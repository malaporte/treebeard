import type { MobileBridgeStatus, OpencodeServerStatus, WorktreesResponse } from './types'

export interface BridgeConnection {
  baseUrl: string
  sessionToken: string
}

export interface PairExchangeResult {
  sessionToken: string
  expiresAt: string
  bridgeUrl: string
}

export interface OpencodeWebSessionResult {
  webUrl: string
  expiresAt: string
}

async function request<T>(connection: BridgeConnection, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${connection.baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${connection.sessionToken}`,
      ...(init?.headers || {})
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with status ${response.status}`)
  }

  return await response.json() as T
}

export async function getHealth(baseUrl: string): Promise<{ ok: boolean }> {
  const response = await fetch(`${baseUrl}/bridge/health`)
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }
  return await response.json() as { ok: boolean }
}

export async function exchangePairingToken(baseUrl: string, token: string): Promise<PairExchangeResult> {
  const response = await fetch(`${baseUrl}/bridge/pair/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Pairing failed with status ${response.status}`)
  }

  return await response.json() as PairExchangeResult
}

export function getStatus(connection: BridgeConnection): Promise<MobileBridgeStatus> {
  return request(connection, '/bridge/status')
}

export function getWorktrees(connection: BridgeConnection): Promise<WorktreesResponse> {
  return request(connection, '/bridge/worktrees')
}

export function getOpencodeStatus(connection: BridgeConnection): Promise<OpencodeServerStatus> {
  return request(connection, '/bridge/opencode/status', {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function createOpencodeWebSession(
  connection: BridgeConnection,
  worktreePath: string
): Promise<OpencodeWebSessionResult> {
  return request(connection, '/bridge/opencode/web/session', {
    method: 'POST',
    body: JSON.stringify({ worktreePath })
  })
}
