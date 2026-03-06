import os from 'node:os'
import { randomBytes } from 'node:crypto'
import {
  ensureMobileBridgePairingCode,
  getConfig,
  getMobileBridgeConfig,
  rotateMobileBridgePairingCode,
  setMobileBridgeEnabled
} from './config'
import {
  getCodexPendingActions,
  getCodexSessionEvents,
  getCodexSessionStatus,
  getCodexStatus,
  interruptCodexSession,
  respondCodexPendingAction,
  startCodexSession,
  steerCodexSession
} from './codex'
import { getWorktrees } from './git'
import type {
  CodexPendingAction,
  CodexSessionEvent,
  CodexSessionStatus,
  MobileBridgeConfig,
  MobileBridgeStatus,
  MobilePairingInfo,
  MobileProxyTraceEntry,
  MobileWorktree
} from '../../shared/types'

interface MobileBridgeRuntime {
  server: ReturnType<typeof Bun.serve>
  host: string
  port: number
}

interface PairExchangeBody {
  token?: string
}

interface ApiSessionRecord {
  expiresAtMs: number
}

interface OneTimeTokenRecord {
  expiresAtMs: number
  bridgeUrl: string
}

interface StartSessionRequestBody {
  worktreePath?: string
  prompt?: string
}

interface WorktreeRequestBody {
  worktreePath?: string
}

interface EventsQuery {
  worktreePath: string
  cursor: number
}

interface RespondActionRequestBody {
  worktreePath?: string
  actionId?: string
  response?: string
}

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization'
}

let runtime: MobileBridgeRuntime | null = null
const oneTimeTokens = new Map<string, OneTimeTokenRecord>()
const apiSessionTokens = new Map<string, ApiSessionRecord>()

const ONE_TIME_TOKEN_TTL_MS = 5 * 60 * 1000
const SESSION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ONE_TIME_TOKEN_BYTES = 24
const SESSION_TOKEN_BYTES = 32
const PAIRING_DEEP_LINK_VERSION = 1
const MAX_PROXY_TRACE_ENTRIES = 300
const proxyTrace: MobileProxyTraceEntry[] = []

/** Returns recent bridge trace entries for troubleshooting. */
export function getMobileProxyTrace(): MobileProxyTraceEntry[] {
  return [...proxyTrace]
}

/** Clears accumulated bridge trace entries. */
export function clearMobileProxyTrace(): void {
  proxyTrace.length = 0
}

/** Returns the current mobile bridge status and connection details. */
export function getMobileBridgeStatus(): MobileBridgeStatus {
  const config = getMobileBridgeConfig()
  const pairingCode = ensureMobileBridgePairingCode()
  const running = runtime !== null
  const port = runtime?.port ?? config.port
  const host = runtime?.host ?? config.host

  return {
    enabled: config.enabled,
    running,
    host,
    port,
    pairingCode,
    urls: mobileUrls(host, port)
  }
}

/** Enables/disables the mobile bridge and returns the updated status. */
export async function setMobileBridgeEnabledState(enabled: boolean): Promise<MobileBridgeStatus> {
  setMobileBridgeEnabled(enabled)
  await syncMobileBridgeFromConfig()
  return getMobileBridgeStatus()
}

/** Rotates the pairing code and returns the updated status. */
export function rotateMobileBridgePairingCodeStatus(): MobileBridgeStatus {
  rotateMobileBridgePairingCode()
  return getMobileBridgeStatus()
}

/** Creates a one-time pairing token to be encoded as QR payload for mobile. */
export function createMobilePairingToken(): MobilePairingInfo {
  cleanupAuthState()
  const status = getMobileBridgeStatus()
  const bridgeUrl = status.urls[0] || `http://${status.host}:${status.port}`
  const token = randomToken(ONE_TIME_TOKEN_BYTES)
  const expiresAtMs = Date.now() + ONE_TIME_TOKEN_TTL_MS
  oneTimeTokens.set(token, { expiresAtMs, bridgeUrl })

  const expiresAt = new Date(expiresAtMs).toISOString()
  const payload = {
    v: PAIRING_DEEP_LINK_VERSION,
    url: bridgeUrl,
    token,
    exp: expiresAt
  }
  const encoded = encodeURIComponent(JSON.stringify(payload))

  return {
    token,
    expiresAt,
    bridgeUrl,
    deepLink: `treebeard://pair?data=${encoded}`
  }
}

/** Starts or stops the mobile bridge to match the persisted configuration. */
export async function syncMobileBridgeFromConfig(): Promise<void> {
  const config = getMobileBridgeConfig()
  ensureMobileBridgePairingCode()

  if (!config.enabled) {
    stopMobileBridge()
    return
  }

  if (runtime && runtime.host === config.host && runtime.port === config.port) {
    return
  }

  stopMobileBridge()
  startMobileBridge(config)
}

/** Stops the mobile bridge if it is currently running. */
export function stopMobileBridge(): void {
  if (!runtime) return
  runtime.server.stop(true)
  runtime = null
}

function startMobileBridge(config: MobileBridgeConfig): void {
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    idleTimeout: 255,
    fetch: (request) => handleRequest(request)
  })

  runtime = {
    server,
    host: config.host,
    port: typeof server.port === 'number' ? server.port : config.port
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = stripBridgeApiPrefix(url.pathname)
  addProxyTrace('http', `${request.method} ${url.pathname}${url.search}`)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS })
  }

  if (request.method === 'GET' && path === '/health') {
    addProxyTrace('http', 'health check ok')
    return json(200, {
      ok: true,
      service: 'treebeard-mobile-bridge',
      now: new Date().toISOString()
    })
  }

  if (request.method === 'POST' && path === '/pair/exchange') {
    const body = await readJson<PairExchangeBody>(request)
    if (!body || typeof body.token !== 'string' || body.token.trim().length === 0) {
      addProxyTrace('http', 'pair exchange invalid payload')
      return json(400, { error: 'Invalid payload' })
    }

    const exchange = consumeOneTimeToken(body.token.trim())
    if (!exchange) {
      addProxyTrace('http', 'pair exchange invalid token')
      return json(401, { error: 'Invalid or expired pairing token' })
    }

    const sessionToken = randomToken(SESSION_TOKEN_BYTES)
    const sessionExpiresAtMs = Date.now() + SESSION_TOKEN_TTL_MS
    apiSessionTokens.set(sessionToken, { expiresAtMs: sessionExpiresAtMs })

    return json(200, {
      sessionToken,
      expiresAt: new Date(sessionExpiresAtMs).toISOString(),
      bridgeUrl: exchange.bridgeUrl
    })
  }

  const apiSessionToken = getApiSessionToken(request)
  if (!isAuthorizedApiSession(apiSessionToken)) {
    addProxyTrace('http', `unauthorized ${url.pathname}`)
    return json(401, { error: 'Unauthorized' })
  }

  if (request.method === 'GET' && path === '/status') {
    addProxyTrace('http', 'status ok')
    return json(200, getMobileBridgeStatus())
  }

  if (request.method === 'GET' && path === '/worktrees') {
    const worktrees = await listMobileWorktrees()
    const codex = getCodexStatus()
    addProxyTrace('http', `worktrees returned ${worktrees.length}`)
    return json(200, {
      worktrees,
      codex,
      homedir: os.homedir(),
      generatedAt: new Date().toISOString()
    })
  }

  if (request.method === 'POST' && path === '/codex/session/start') {
    const body = await readJson<StartSessionRequestBody>(request)
    if (!body || typeof body.worktreePath !== 'string' || typeof body.prompt !== 'string') {
      return json(400, { error: 'Invalid payload' })
    }

    try {
      const status = await startCodexSession(body.worktreePath.trim(), body.prompt)
      addProxyTrace('codex', `session started for ${body.worktreePath.trim()}`)
      return json(200, { status })
    } catch (err) {
      return json(409, { error: err instanceof Error ? err.message : 'Failed to start session' })
    }
  }

  if (request.method === 'POST' && path === '/codex/session/steer') {
    const body = await readJson<StartSessionRequestBody>(request)
    if (!body || typeof body.worktreePath !== 'string' || typeof body.prompt !== 'string') {
      return json(400, { error: 'Invalid payload' })
    }

    try {
      const status = await steerCodexSession(body.worktreePath.trim(), body.prompt)
      addProxyTrace('codex', `session steered for ${body.worktreePath.trim()}`)
      return json(200, { status })
    } catch (err) {
      return json(409, { error: err instanceof Error ? err.message : 'Failed to steer session' })
    }
  }

  if (request.method === 'POST' && path === '/codex/session/interrupt') {
    const body = await readJson<WorktreeRequestBody>(request)
    if (!body || typeof body.worktreePath !== 'string') {
      return json(400, { error: 'Invalid payload' })
    }

    const status = await interruptCodexSession(body.worktreePath.trim())
    if (!status) {
      return json(404, { error: 'Session not found' })
    }

    addProxyTrace('codex', `session interrupted for ${body.worktreePath.trim()}`)
    return json(200, { status })
  }

  if (request.method === 'GET' && path === '/codex/session/status') {
    const worktreePath = url.searchParams.get('worktreePath')
    if (!worktreePath || worktreePath.trim().length === 0) {
      return json(400, { error: 'worktreePath is required' })
    }

    const status = getCodexSessionStatus(worktreePath.trim())
    if (!status) {
      return json(404, { error: 'Session not found' })
    }

    return json(200, { status })
  }

  if (request.method === 'GET' && path === '/codex/session/events') {
    const query = parseEventsQuery(url)
    if (!query) {
      return json(400, { error: 'Invalid query' })
    }

    const result = getCodexSessionEvents(query.worktreePath, query.cursor)
    return json(200, result)
  }

  if (request.method === 'GET' && path === '/codex/session/pending-actions') {
    const worktreePath = url.searchParams.get('worktreePath')
    if (!worktreePath || worktreePath.trim().length === 0) {
      return json(400, { error: 'worktreePath is required' })
    }

    const actions = getCodexPendingActions(worktreePath.trim())
    return json(200, { actions })
  }

  if (request.method === 'POST' && path === '/codex/session/respond-action') {
    const body = await readJson<RespondActionRequestBody>(request)
    if (!body || typeof body.worktreePath !== 'string' || typeof body.actionId !== 'string' || typeof body.response !== 'string') {
      return json(400, { error: 'Invalid payload' })
    }

    const result = respondCodexPendingAction(body.worktreePath.trim(), body.actionId.trim(), body.response)
    if (!result.success) {
      return json(404, { error: result.error || 'Action not found' })
    }

    return json(200, result)
  }

  if (request.method === 'GET' && path === '/debug/proxy-trace') {
    return json(200, getMobileProxyTrace())
  }

  if (request.method === 'POST' && path === '/debug/proxy-trace/clear') {
    clearMobileProxyTrace()
    return json(200, { success: true })
  }

  return json(404, { error: 'Not found' })
}

async function listMobileWorktrees(): Promise<MobileWorktree[]> {
  const config = getConfig()
  const byRepo = await Promise.all(
    config.repositories.map(async (repo) => {
      try {
        const worktrees = await getWorktrees(repo.path)
        return worktrees.map((worktree) => ({
          repo,
          worktree
        }))
      } catch {
        return []
      }
    })
  )

  return byRepo
    .flat()
    .sort((a, b) => `${a.repo.name}:${a.worktree.branch}`.localeCompare(`${b.repo.name}:${b.worktree.branch}`))
}

function parseEventsQuery(url: URL): EventsQuery | null {
  const worktreePath = url.searchParams.get('worktreePath')
  if (!worktreePath || worktreePath.trim().length === 0) return null

  const cursorRaw = url.searchParams.get('cursor')
  const cursor = cursorRaw ? Number.parseInt(cursorRaw, 10) : 0
  if (!Number.isFinite(cursor) || cursor < 0) return null

  return {
    worktreePath: worktreePath.trim(),
    cursor
  }
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T
  } catch {
    return null
  }
}

function getApiSessionToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice('Bearer '.length).trim()
}

function isAuthorizedApiSession(token: string | null): boolean {
  cleanupAuthState()
  if (!token) return false

  const session = apiSessionTokens.get(token)
  if (!session) return false
  if (session.expiresAtMs <= Date.now()) {
    apiSessionTokens.delete(token)
    return false
  }
  return true
}

function consumeOneTimeToken(token: string): OneTimeTokenRecord | null {
  cleanupAuthState()
  const record = oneTimeTokens.get(token)
  if (!record) return null
  oneTimeTokens.delete(token)
  if (record.expiresAtMs <= Date.now()) return null
  return record
}

function cleanupAuthState(): void {
  const now = Date.now()
  for (const [token, record] of oneTimeTokens.entries()) {
    if (record.expiresAtMs <= now) {
      oneTimeTokens.delete(token)
    }
  }
  for (const [token, record] of apiSessionTokens.entries()) {
    if (record.expiresAtMs <= now) {
      apiSessionTokens.delete(token)
    }
  }
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

function mobileUrls(host: string, port: number): string[] {
  if (host !== '0.0.0.0') {
    return [`http://${host}:${port}`]
  }

  const urls = new Set<string>([`http://localhost:${port}`])
  const interfaces = os.networkInterfaces()

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) continue
    for (const address of addresses) {
      if (address.internal || address.family !== 'IPv4') continue
      urls.add(`http://${address.address}:${port}`)
    }
  }

  return [...urls].sort()
}

function addProxyTrace(source: 'http' | 'codex', message: string): void {
  const entry = {
    at: new Date().toISOString(),
    source,
    message
  }
  proxyTrace.push(entry)

  if (proxyTrace.length > MAX_PROXY_TRACE_ENTRIES) {
    proxyTrace.splice(0, proxyTrace.length - MAX_PROXY_TRACE_ENTRIES)
  }
}

function stripBridgeApiPrefix(pathname: string): string {
  if (!pathname.startsWith('/bridge')) return pathname
  const suffix = pathname.slice('/bridge'.length)
  return suffix.length > 0 ? suffix : '/'
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  })
}

export interface MobileWorktreesResponse {
  worktrees: MobileWorktree[]
  codex: ReturnType<typeof getCodexStatus>
  homedir?: string
  generatedAt: string
}

export interface MobileSessionStatusResponse {
  status: CodexSessionStatus
}

export interface MobileSessionEventsResponse {
  events: CodexSessionEvent[]
  nextCursor: number
}

export interface MobilePendingActionsResponse {
  actions: CodexPendingAction[]
}
