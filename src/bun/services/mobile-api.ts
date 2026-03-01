import os from 'node:os'
import { randomBytes } from 'node:crypto'
import {
  ensureMobileBridgePairingCode,
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
  MobileProxyTraceEntry,
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

interface BridgeSocketData {
  upstreamUrl: string
  upstream: WebSocket | null
  queued: Array<string | Uint8Array | ArrayBuffer>
  protocols: string[]
  headers: Record<string, string>
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

interface WebSessionRequestBody {
  worktreePath?: string
}

interface WebSessionUrlResult {
  webUrl: string
  expiresAt: string
}

interface WebTicketRecord {
  expiresAtMs: number
  worktreePath: string
}

interface WebSessionRecord {
  expiresAtMs: number
  worktreePath: string
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
const webTickets = new Map<string, WebTicketRecord>()
const webSessions = new Map<string, WebSessionRecord>()

const ONE_TIME_TOKEN_TTL_MS = 5 * 60 * 1000
const SESSION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const WEB_TICKET_TTL_MS = 2 * 60 * 1000
const WEB_SESSION_TTL_MS = 8 * 60 * 60 * 1000
const ONE_TIME_TOKEN_BYTES = 24
const SESSION_TOKEN_BYTES = 32
const WEB_TICKET_BYTES = 24
const WEB_SESSION_BYTES = 32
const PAIRING_DEEP_LINK_VERSION = 1
const WEB_SESSION_COOKIE = 'tb_web_session'
const MAX_PROXY_TRACE_ENTRIES = 300
const proxyTrace: MobileProxyTraceEntry[] = []

/** Returns recent proxy trace entries for troubleshooting. */
export function getMobileProxyTrace(): MobileProxyTraceEntry[] {
  return [...proxyTrace]
}

/** Clears accumulated proxy trace entries. */
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

/** Creates an authenticated OpenCode proxy URL for local/desktop troubleshooting. */
export async function createLocalOpencodeWebUrl(worktreePath: string): Promise<WebSessionUrlResult> {
  const status = getMobileBridgeStatus()
  if (!status.enabled || !status.running || status.urls.length === 0) {
    throw new Error('Mobile bridge must be enabled and running to open proxied UI')
  }

  const bridgeOrigin = status.urls.find((url) => url.includes('localhost')) || status.urls[0]
  addProxyTrace('http', `local web url requested worktree=${worktreePath} bridge=${bridgeOrigin}`)
  return createWebSessionUrl(worktreePath, bridgeOrigin)
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
    // OpenCode web UI can keep long-lived HTTP requests (SSE/streaming).
    // Bun's default idle timeout is short and can terminate these early.
    idleTimeout: 255,
    fetch: (request, activeServer) => handleRequest(request, activeServer as ReturnType<typeof Bun.serve>),
    websocket: {
      open(ws) {
        const data = ws.data as unknown as BridgeSocketData
        const upstreamOptions: {
          headers: Record<string, string>
          protocols?: string[]
        } = {
          headers: data.headers
        }
        if (data.protocols.length > 0) {
          upstreamOptions.protocols = data.protocols
        }

        const WebSocketWithOptions = WebSocket as unknown as {
          new (url: string, options?: { headers?: Record<string, string>; protocols?: string[] }): WebSocket
        }
        const upstream = new WebSocketWithOptions(data.upstreamUrl, upstreamOptions)
        addProxyTrace('ws', `upstream open requested ${data.upstreamUrl}`)
        data.upstream = upstream

        upstream.addEventListener('open', () => {
          addProxyTrace('ws', `upstream open confirmed ${data.upstreamUrl}`)
          for (const message of data.queued) {
            upstream.send(message)
          }
          data.queued = []
        })

        upstream.addEventListener('message', (event) => {
          if (typeof event.data === 'string' || event.data instanceof ArrayBuffer || event.data instanceof Uint8Array) {
            ws.send(event.data)
          }
        })

        upstream.addEventListener('close', () => {
          addProxyTrace('ws', `upstream close ${data.upstreamUrl}`)
          try {
            ws.close()
          } catch {
            // Ignore close errors during teardown.
          }
        })

        upstream.addEventListener('error', () => {
          addProxyTrace('ws', `upstream error ${data.upstreamUrl}`)
          try {
            ws.close()
          } catch {
            // Ignore close errors during teardown.
          }
        })
      },
      message(ws, message) {
        const data = ws.data as unknown as BridgeSocketData
        const upstream = data.upstream

        if (upstream && upstream.readyState === WebSocket.OPEN) {
          upstream.send(message as string | ArrayBuffer | Uint8Array)
          return
        }

        if (typeof message === 'string' || message instanceof ArrayBuffer || message instanceof Uint8Array) {
          data.queued.push(message)
        }
      },
      close(ws) {
        const data = ws.data as unknown as BridgeSocketData
        addProxyTrace('ws', `client close ${data.upstreamUrl}`)
        if (data.upstream && data.upstream.readyState < WebSocket.CLOSING) {
          data.upstream.close()
        }
      }
    }
  })

  runtime = {
    server,
    host: config.host,
    port: typeof server.port === 'number' ? server.port : config.port
  }
}

async function handleRequest(
  request: Request,
  server: ReturnType<typeof Bun.serve>
): Promise<Response | undefined> {
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
    const body = await readPairExchangeBody(request)
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

  if (request.method === 'POST' && path === '/opencode/web/session') {
    const apiSessionToken = getApiSessionToken(request)
    if (!isAuthorizedApiSession(apiSessionToken)) {
      addProxyTrace('http', 'web session unauthorized')
      return json(401, { error: 'Unauthorized' })
    }

    const body = await readWebSessionRequestBody(request)
    if (!body || typeof body.worktreePath !== 'string' || body.worktreePath.trim().length === 0) {
      addProxyTrace('http', 'web session invalid payload')
      return json(400, { error: 'Invalid payload' })
    }

    const worktreePath = body.worktreePath.trim()
    try {
      const result = await createWebSessionUrl(worktreePath, url.origin)
      addProxyTrace('http', `web session created for ${worktreePath}`)
      return json(200, result)
    } catch (err) {
      addProxyTrace('http', `web session failed: ${err instanceof Error ? err.message : String(err)}`)
      return json(409, { error: err instanceof Error ? err.message : 'Unable to create web session URL' })
    }
  }

  if (!url.pathname.startsWith('/bridge')) {
    return proxyOpencodeWebRequest(request, url, server)
  }

  // After a browser has exchanged a web ticket and received the cookie, route
  // all non-API paths through the active OpenCode proxy session.
  const cookieSession = getValidWebSession(request)
  if (cookieSession && url.pathname !== '/health') {
    return proxyWithSession(request, url, cookieSession.worktreePath, null, server)
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
    const opencode = getServerStatus()
    addProxyTrace('http', `worktrees returned ${worktrees.length}`)
    return json(200, {
      worktrees,
      opencode,
      generatedAt: new Date().toISOString()
    })
  }

  if (request.method === 'POST' && path === '/opencode/set-enabled') {
    const body = await readJsonBody(request)
    if (!body || typeof body.enabled !== 'boolean') {
      addProxyTrace('http', 'set-enabled invalid payload')
      return json(400, { error: 'Invalid payload' })
    }

    const status = await setServerEnabled(body.enabled)
    addProxyTrace('http', `set-enabled -> ${body.enabled}`)
    return json(200, status)
  }

  if (request.method === 'POST' && path === '/opencode/status') {
    return json(200, getServerStatus())
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

async function readWebSessionRequestBody(request: Request): Promise<WebSessionRequestBody | null> {
  try {
    return await request.json() as WebSessionRequestBody
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
  for (const [token, record] of webTickets.entries()) {
    if (record.expiresAtMs <= now) {
      webTickets.delete(token)
    }
  }
  for (const [token, record] of webSessions.entries()) {
    if (record.expiresAtMs <= now) {
      webSessions.delete(token)
    }
  }
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

async function createWebSessionUrl(worktreePath: string, bridgeOrigin: string): Promise<WebSessionUrlResult> {
  const status = getServerStatus()
  if (!status.running || !status.url) {
    throw new Error('OpenCode server is not running for this worktree')
  }

  addProxyTrace('http', `create web session worktree=${worktreePath} upstream=${status.url}`)

  const webTicket = randomToken(WEB_TICKET_BYTES)
  const expiresAtMs = Date.now() + WEB_TICKET_TTL_MS
  webTickets.set(webTicket, { expiresAtMs, worktreePath })

  const launchUrl = new URL(bridgeOrigin)
  const worktreeSlug = encodeWorktreeSlug(worktreePath)
  launchUrl.pathname = `/${worktreeSlug}/session`
  launchUrl.search = `ticket=${encodeURIComponent(webTicket)}`

  return {
    webUrl: launchUrl.toString(),
    expiresAt: new Date(expiresAtMs).toISOString()
  }
}

function encodeWorktreeSlug(worktreePath: string): string {
  return Buffer.from(worktreePath, 'utf8').toString('base64url')
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

async function proxyOpencodeWebRequest(
  request: Request,
  url: URL,
  server: ReturnType<typeof Bun.serve>
): Promise<Response> {
  const cookieSession = getValidWebSession(request)
  const ticket = url.searchParams.get('ticket')
  let worktreePath = cookieSession?.worktreePath ?? null
  let setCookieHeader: string | null = null

  if (ticket) {
    const consumed = consumeWebTicket(ticket)
    if (!consumed) {
      return json(401, { error: 'Invalid or expired web ticket' })
    }

    const sessionToken = randomToken(WEB_SESSION_BYTES)
    const sessionExpiresAtMs = Date.now() + WEB_SESSION_TTL_MS
    webSessions.set(sessionToken, {
      expiresAtMs: sessionExpiresAtMs,
      worktreePath: consumed.worktreePath
    })
    worktreePath = consumed.worktreePath
    setCookieHeader = `${WEB_SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(WEB_SESSION_TTL_MS / 1000)}`

    // Finish ticket exchange first, then redirect so subsequent asset/API
    // requests consistently include the session cookie.
    const redirectPath = normalizeProxyPath(url.pathname)
    const redirectSearch = new URLSearchParams(url.search)
    redirectSearch.delete('ticket')
    const search = redirectSearch.toString()
    const headers = new Headers({
      location: `${redirectPath}${search ? `?${search}` : ''}`
    })
    headers.append('set-cookie', setCookieHeader)
    addProxyTrace('http', `web ticket exchanged for ${worktreePath}`)
    return new Response(null, {
      status: 302,
      headers
    })
  }

  if (!worktreePath) {
    return json(401, { error: 'Unauthorized web session' })
  }

  return proxyWithSession(request, url, worktreePath, setCookieHeader, server)
}

async function proxyWithSession(
  request: Request,
  url: URL,
  worktreePath: string,
  setCookieHeader: string | null,
  server?: ReturnType<typeof Bun.serve>
): Promise<Response> {
  const proxyPath = normalizeProxyPath(url.pathname)
  const serverStatus = getServerStatus()
  if (!serverStatus.running || !serverStatus.url) {
    return json(409, { error: 'OpenCode server is not running for this worktree' })
  }

  const upstreamBase = new URL(serverStatus.url)
  const upstreamUrl = new URL(upstreamBase.toString())
  upstreamUrl.pathname = proxyPath
  const searchParams = new URLSearchParams(url.search)
  searchParams.delete('ticket')
  const search = searchParams.toString()
  upstreamUrl.search = search ? `?${search}` : ''

  if (isWebSocketRequest(request)) {
    if (!server) {
      return json(500, { error: 'WebSocket proxy unavailable' })
    }

    const bridgeSocketData: BridgeSocketData = {
      upstreamUrl: toWebSocketUrl(upstreamUrl.toString()),
      upstream: null,
      queued: [],
      protocols: parseWebSocketProtocols(request.headers.get('sec-websocket-protocol')),
      headers: buildUpstreamWebSocketHeaders(request, upstreamBase)
    }

    const upgraded = server.upgrade(request, {
      data: bridgeSocketData
    })
    addProxyTrace('ws', upgraded ? `upgrade ok ${proxyPath}` : `upgrade failed ${proxyPath}`)
    return upgraded ? undefined as unknown as Response : json(502, { error: 'WebSocket upgrade failed' })
  }

  // Build a minimal header set for the upstream request. Forwarding the
  // full browser header bag (sec-ch-*, sec-fetch-*, connection, etc.)
  // causes Bun-to-Bun fetch issues and is unnecessary for API calls.
  const headers = new Headers()
  headers.set('accept', request.headers.get('accept') || '*/*')
  headers.set('accept-encoding', 'identity')
  headers.set('content-type', request.headers.get('content-type') || 'application/json')
  headers.set('origin', upstreamBase.origin)

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const next = new URL(referer)
      next.protocol = upstreamBase.protocol
      next.host = upstreamBase.host
      headers.set('referer', next.toString())
    } catch {
      headers.set('referer', `${upstreamBase.origin}/`)
    }
  }

  const sanitizedCookie = stripBridgeSessionCookie(request.headers.get('cookie'))
  if (sanitizedCookie) {
    headers.set('cookie', sanitizedCookie)
  }

  // Requests that don't match any OpenCode API route fall through to
  // OpenCode's catch-all, which proxies to app.opencode.ai — but first
  // runs Instance.provide() + InstanceBootstrap(). On the first request
  // for a directory this spawns LSP servers, file watchers, etc., causing
  // massive RAM spikes for what is essentially a static asset fetch.
  // Bypass OpenCode entirely for these requests.
  if (!isOpencodeApiPath(proxyPath)) {
    addProxyTrace('proxy', `CDN direct ${request.method} ${proxyPath}`)
    return proxyCdnDirect(request, proxyPath, setCookieHeader, worktreePath)
  }

  if (!headers.get('x-opencode-directory') && shouldInjectDirectoryHeader(proxyPath)) {
    headers.set('x-opencode-directory', worktreePath)
    addProxyTrace('proxy', `directory hint applied ${worktreePath} for ${proxyPath}`)
  }

  addProxyTrace('proxy', `→ ${request.method} ${upstreamUrl.toString()}`)

  const abort = new AbortController()
  if (request.signal) {
    request.signal.addEventListener('abort', () => abort.abort(), { once: true })
  }

  let body: ArrayBuffer | null = null
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    body = await request.arrayBuffer()
  }

  const upstream = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers,
    body,
    redirect: 'manual',
    signal: abort.signal
  })

  traceImportantResponse(proxyPath, upstream)

  const responseHeaders = new Headers(upstream.headers)
  rewriteUpstreamSetCookies(responseHeaders)

  const location = responseHeaders.get('location')
  if (location) {
    responseHeaders.set('location', rewriteUpstreamLocation(location, upstreamBase))
  }

  if (setCookieHeader) {
    responseHeaders.append('set-cookie', setCookieHeader)
  }

  const rewritten = await maybeRewriteProxyBody(
    upstream,
    responseHeaders,
    upstreamBase,
    url.origin,
    proxyPath,
    worktreePath
  )

  if (rewritten !== null) {
    return new Response(rewritten, {
      status: upstream.status,
      headers: responseHeaders
    })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  })
}

// OpenCode API route prefixes — everything else falls through to the
// catch-all which proxies to app.opencode.ai (the SPA CDN).
const OPENCODE_API_PREFIXES = [
  '/global/',
  '/auth/',
  '/project/',
  '/pty/',
  '/config/',
  '/experimental/',
  '/session/',
  '/permission/',
  '/question/',
  '/provider/',
  '/find/',
  '/file/',
  '/mcp/',
  '/tui/',
  '/instance/'
]

const OPENCODE_API_EXACT = new Set([
  '/auth',
  '/project',
  '/pty',
  '/config',
  '/experimental',
  '/session',
  '/permission',
  '/question',
  '/provider',
  '/file',
  '/mcp',
  '/tui',
  '/instance',
  '/global',
  '/doc',
  '/path',
  '/vcs',
  '/command',
  '/log',
  '/agent',
  '/skill',
  '/lsp',
  '/formatter',
  '/event',
  '/find',
  '/files',
  '/symbols'
])

function isOpencodeApiPath(proxyPath: string): boolean {
  if (OPENCODE_API_EXACT.has(proxyPath)) return true
  for (const prefix of OPENCODE_API_PREFIXES) {
    if (proxyPath.startsWith(prefix)) return true
  }
  return false
}

/** Fetch SPA shell / static assets directly from app.opencode.ai,
 *  bypassing OpenCode to avoid triggering InstanceBootstrap. */
async function proxyCdnDirect(
  request: Request,
  proxyPath: string,
  setCookieHeader: string | null,
  worktreePath: string
): Promise<Response> {
  const cdnUrl = `https://app.opencode.ai${proxyPath}`

  const abort = new AbortController()
  if (request.signal) {
    request.signal.addEventListener('abort', () => abort.abort(), { once: true })
  }

  const upstream = await fetch(cdnUrl, {
    method: request.method,
    headers: { 'accept-encoding': 'identity' },
    redirect: 'follow',
    signal: abort.signal
  })

  addProxyTrace('proxy', `CDN ${proxyPath} -> ${upstream.status} [${upstream.headers.get('content-type') || ''}]`)

  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  responseHeaders.delete('transfer-encoding')

  // OpenCode sets this CSP on its catch-all. Replicate it so the SPA
  // behaves identically when served through the bridge.
  responseHeaders.set(
    'content-security-policy',
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:"
  )

  if (setCookieHeader) {
    responseHeaders.append('set-cookie', setCookieHeader)
  }

  const contentType = upstream.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    const html = await upstream.text()
    const rewritten = injectRandomUuidPolyfill(html)
    return new Response(rewritten, {
      status: upstream.status,
      headers: responseHeaders
    })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  })
}

function traceImportantResponse(proxyPath: string, upstream: Response): void {
  const important = new Set(['/project', '/path', '/global/config', '/provider/auth'])
  if (!important.has(proxyPath)) return

  const contentType = upstream.headers.get('content-type') || ''
  addProxyTrace('proxy', `${proxyPath} response content-type=${contentType || 'unknown'} status=${upstream.status}`)
}

function isWebSocketRequest(request: Request): boolean {
  const upgrade = request.headers.get('upgrade')
  const connection = request.headers.get('connection') || ''
  return Boolean(upgrade && upgrade.toLowerCase() === 'websocket' && connection.toLowerCase().includes('upgrade'))
}

function toWebSocketUrl(url: string): string {
  const next = new URL(url)
  next.protocol = next.protocol === 'https:' ? 'wss:' : 'ws:'
  return next.toString()
}

function parseWebSocketProtocols(header: string | null): string[] {
  if (!header) return []
  return header
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function buildUpstreamWebSocketHeaders(request: Request, upstreamBase: URL): Record<string, string> {
  const headers: Record<string, string> = {}

  const cookie = stripBridgeSessionCookie(request.headers.get('cookie'))
  if (cookie) {
    headers.cookie = cookie
  }

  headers.origin = upstreamBase.origin

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const next = new URL(referer)
      next.protocol = upstreamBase.protocol
      next.host = upstreamBase.host
      headers.referer = next.toString()
    } catch {
      headers.referer = `${upstreamBase.origin}/`
    }
  }

  return headers
}

function addProxyTrace(source: 'http' | 'proxy' | 'ws', message: string): void {
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

function consumeWebTicket(ticket: string): WebTicketRecord | null {
  const record = webTickets.get(ticket)
  if (!record) return null
  webTickets.delete(ticket)
  if (record.expiresAtMs <= Date.now()) return null
  return record
}

function getValidWebSession(request: Request): WebSessionRecord | null {
  cleanupAuthState()
  const cookieToken = parseCookie(request.headers.get('cookie'), WEB_SESSION_COOKIE)
  if (!cookieToken) return null
  const session = webSessions.get(cookieToken)
  if (!session) return null
  if (session.expiresAtMs <= Date.now()) {
    webSessions.delete(cookieToken)
    return null
  }
  return session
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [key, ...valueParts] = part.trim().split('=')
    if (key === name) {
      return valueParts.join('=')
    }
  }
  return null
}

function stripBridgeSessionCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return ''
  const kept: string[] = []

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (trimmed.startsWith(`${WEB_SESSION_COOKIE}=`)) continue
    kept.push(trimmed)
  }

  return kept.join('; ')
}

function rewriteUpstreamSetCookies(headers: Headers): void {
  const setCookies = getSetCookieHeaders(headers)
  if (setCookies.length === 0) return

  headers.delete('set-cookie')
  for (const cookie of setCookies) {
    headers.append('set-cookie', rewriteSetCookieForBridge(cookie))
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie()
  }

  const combined = headers.get('set-cookie')
  if (!combined) return []
  return splitCombinedSetCookie(combined)
}

function splitCombinedSetCookie(combined: string): string[] {
  const cookies: string[] = []
  let current = ''
  let inExpires = false

  for (let i = 0; i < combined.length; i += 1) {
    const char = combined[i]

    if (!inExpires && combined.slice(i, i + 8).toLowerCase() === 'expires=') {
      inExpires = true
    }

    if (char === ',' && !inExpires) {
      cookies.push(current.trim())
      current = ''
      continue
    }

    if (inExpires && char === ';') {
      inExpires = false
    }

    current += char
  }

  if (current.trim()) {
    cookies.push(current.trim())
  }

  return cookies
}

function rewriteSetCookieForBridge(cookie: string): string {
  const parts = cookie.split(';').map((part) => part.trim()).filter(Boolean)
  const kept: string[] = []

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower.startsWith('domain=')) continue
    if (lower === 'secure') continue
    kept.push(part)
  }

  return kept.join('; ')
}

function normalizeProxyPath(pathname: string): string {
  return pathname || '/'
}

function stripBridgeApiPrefix(pathname: string): string {
  if (!pathname.startsWith('/bridge')) return pathname
  const suffix = pathname.slice('/bridge'.length)
  return suffix.length > 0 ? suffix : '/'
}

function shouldInjectDirectoryHeader(proxyPath: string): boolean {
  const normalized = normalizeProxyPath(proxyPath)
  return !normalized.match(/^\/session\/[^/]+(\/|$)/)
}

function rewriteUpstreamLocation(location: string, upstreamBase: URL): string {
  try {
    const next = new URL(location, upstreamBase)
    return `${next.pathname}${next.search}`
  } catch {
    return location
  }
}

async function maybeRewriteProxyBody(
  upstream: Response,
  responseHeaders: Headers,
  upstreamBase: URL,
  bridgeOrigin: string,
  proxyPath: string,
  worktreePath: string
): Promise<string | null> {
  const contentType = responseHeaders.get('content-type') || ''

  // Never buffer streaming responses — SSE and chunked streams will hang
  // indefinitely because the body never ends.
  if (contentType.includes('text/event-stream')) {
    return null
  }

  // Only HTML needs rewriting (polyfill injection). Pass everything else
  // through as a stream to avoid buffering large JS/CSS/JSON payloads.
  if (!contentType.includes('text/html')) {
    return null
  }

  const source = await upstream.text()
  const rewritten = injectRandomUuidPolyfill(source)

  // Rewritten text bodies are no longer byte-identical to upstream payloads,
  // so encoding/length metadata must be cleared.
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  responseHeaders.delete('transfer-encoding')
  return rewritten
}


function injectRandomUuidPolyfill(html: string): string {
  if (html.includes('treebeard-random-uuid-polyfill')) {
    return html
  }

  const script = '<script id="treebeard-random-uuid-polyfill">if(!globalThis.crypto){globalThis.crypto={};}if(typeof globalThis.crypto.randomUUID!=="function"){globalThis.crypto.randomUUID=()=>"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(+c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>+c/4).toString(16));}</script>'

  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}</head>`)
  }

  return `${script}${html}`
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  })
}
