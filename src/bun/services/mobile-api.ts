import os from 'node:os'
import { randomBytes } from 'node:crypto'
import {
  getConfig,
  getMobileBridgeConfig,
  rotateMobileBridgePairingCode,
  setMobileBridgeEnabled
} from './config'
import { getWorktrees } from './git'
import { getServerStatus, setServerEnabled } from './opencode'
import type {
  MobileBridgeConfig,
  MobileBridgeStatus,
  MobilePairingInfo,
  MobileWorktree
} from '../../shared/types'

interface MobileApiRequestBody {
  worktreePath?: string
  enabled?: boolean
}

interface MobileBridgeRuntime {
  server: ReturnType<typeof Bun.serve>
  host: string
  port: number
}

interface PairExchangeBody {
  token?: string
}

interface SessionRecord {
  expiresAtMs: number
}

interface OneTimeTokenRecord {
  expiresAtMs: number
  bridgeUrl: string
}

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization'
}

let runtime: MobileBridgeRuntime | null = null
const oneTimeTokens = new Map<string, OneTimeTokenRecord>()
const sessionTokens = new Map<string, SessionRecord>()

const ONE_TIME_TOKEN_TTL_MS = 5 * 60 * 1000
const SESSION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ONE_TIME_TOKEN_BYTES = 24
const SESSION_TOKEN_BYTES = 32
const PAIRING_DEEP_LINK_VERSION = 1

/** Returns the current mobile bridge status and connection details. */
export function getMobileBridgeStatus(): MobileBridgeStatus {
  const config = getMobileBridgeConfig()
  const running = runtime !== null
  const port = runtime?.port ?? config.port
  const host = runtime?.host ?? config.host

  return {
    enabled: config.enabled,
    running,
    host,
    port,
    pairingCode: config.pairingCode,
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

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS })
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    return json(200, {
      ok: true,
      service: 'treebeard-mobile-bridge',
      now: new Date().toISOString()
    })
  }

  if (request.method === 'POST' && url.pathname === '/pair/exchange') {
    const body = await readPairExchangeBody(request)
    if (!body || typeof body.token !== 'string' || body.token.trim().length === 0) {
      return json(400, { error: 'Invalid payload' })
    }

    const exchange = consumeOneTimeToken(body.token.trim())
    if (!exchange) {
      return json(401, { error: 'Invalid or expired pairing token' })
    }

    const sessionToken = randomToken(SESSION_TOKEN_BYTES)
    const sessionExpiresAtMs = Date.now() + SESSION_TOKEN_TTL_MS
    sessionTokens.set(sessionToken, { expiresAtMs: sessionExpiresAtMs })

    return json(200, {
      sessionToken,
      expiresAt: new Date(sessionExpiresAtMs).toISOString(),
      bridgeUrl: exchange.bridgeUrl
    })
  }

  if (!isAuthorized(request)) {
    return json(401, { error: 'Unauthorized' })
  }

  if (request.method === 'GET' && url.pathname === '/status') {
    return json(200, getMobileBridgeStatus())
  }

  if (request.method === 'GET' && url.pathname === '/worktrees') {
    const worktrees = await listMobileWorktrees()
    return json(200, {
      worktrees,
      generatedAt: new Date().toISOString()
    })
  }

  if (request.method === 'POST' && url.pathname === '/opencode/set-enabled') {
    const body = await readJsonBody(request)
    if (!body || typeof body.worktreePath !== 'string' || typeof body.enabled !== 'boolean') {
      return json(400, { error: 'Invalid payload' })
    }

    const status = await setServerEnabled(body.worktreePath, body.enabled)
    return json(200, status)
  }

  if (request.method === 'POST' && url.pathname === '/opencode/status') {
    const body = await readJsonBody(request)
    if (!body || typeof body.worktreePath !== 'string') {
      return json(400, { error: 'Invalid payload' })
    }

    return json(200, getServerStatus(body.worktreePath))
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
          worktree,
          opencode: getServerStatus(worktree.path)
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

async function readJsonBody(request: Request): Promise<MobileApiRequestBody | null> {
  try {
    return await request.json() as MobileApiRequestBody
  } catch {
    return null
  }
}

async function readPairExchangeBody(request: Request): Promise<PairExchangeBody | null> {
  try {
    return await request.json() as PairExchangeBody
  } catch {
    return null
  }
}

function isAuthorized(request: Request): boolean {
  cleanupAuthState()

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false

  const token = authHeader.slice('Bearer '.length).trim()
  const session = sessionTokens.get(token)
  if (!session) return false
  if (session.expiresAtMs <= Date.now()) {
    sessionTokens.delete(token)
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
  for (const [token, record] of sessionTokens.entries()) {
    if (record.expiresAtMs <= now) {
      sessionTokens.delete(token)
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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  })
}
