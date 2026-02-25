import os from 'node:os'
import {
  ensureMobileBridgePairingCode,
  getConfig,
  getMobileBridgeConfig,
  rotateMobileBridgePairingCode,
  setMobileBridgeEnabled
} from './config'
import { getWorktrees } from './git'
import { getServerStatus, setServerEnabled } from './opencode'
import type { MobileBridgeConfig, MobileBridgeStatus, MobileWorktree } from '../../shared/types'

interface MobileApiRequestBody {
  worktreePath?: string
  enabled?: boolean
}

interface MobileBridgeRuntime {
  server: ReturnType<typeof Bun.serve>
  host: string
  port: number
}

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-treebeard-pairing-code'
}

let runtime: MobileBridgeRuntime | null = null

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

function isAuthorized(request: Request): boolean {
  const pairingCode = ensureMobileBridgePairingCode()
  if (!pairingCode) return false

  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${pairingCode}`) {
    return true
  }

  const codeHeader = request.headers.get('x-treebeard-pairing-code')
  return codeHeader === pairingCode
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
