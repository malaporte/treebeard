import type { MobileBridgeStatus, OpencodeServerStatus, WorktreesResponse } from './types'

export interface BridgeConnection {
  baseUrl: string
  pairingCode: string
}

async function request<T>(connection: BridgeConnection, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${connection.baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${connection.pairingCode}`,
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
  const response = await fetch(`${baseUrl}/health`)
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }
  return await response.json() as { ok: boolean }
}

export function getStatus(connection: BridgeConnection): Promise<MobileBridgeStatus> {
  return request(connection, '/status')
}

export function getWorktrees(connection: BridgeConnection): Promise<WorktreesResponse> {
  return request(connection, '/worktrees')
}

export function setOpencodeEnabled(
  connection: BridgeConnection,
  worktreePath: string,
  enabled: boolean
): Promise<OpencodeServerStatus> {
  return request(connection, '/opencode/set-enabled', {
    method: 'POST',
    body: JSON.stringify({ worktreePath, enabled })
  })
}
