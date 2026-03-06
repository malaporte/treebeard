import type {
  CodexConversationUpdate,
  CodexConversationSnapshot,
  CodexPendingAction,
  CodexSessionEvent,
  CodexSessionStatus,
  MobileBridgeStatus,
  WorktreesResponse
} from './types'

export interface BridgeConnection {
  baseUrl: string
  sessionToken: string
}

export interface PairExchangeResult {
  sessionToken: string
  expiresAt: string
  bridgeUrl: string
}

const REQUEST_TIMEOUT_MS = 6000

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function request<T>(connection: BridgeConnection, path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(`${connection.baseUrl}${path}`, {
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
  const response = await fetchWithTimeout(`${baseUrl}/bridge/health`)
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }
  return await response.json() as { ok: boolean }
}

export async function exchangePairingToken(baseUrl: string, token: string): Promise<PairExchangeResult> {
  const response = await fetchWithTimeout(`${baseUrl}/bridge/pair/exchange`, {
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

export function startCodexSession(
  connection: BridgeConnection,
  worktreePath: string,
  prompt: string
): Promise<{ status: CodexSessionStatus }> {
  return request(connection, '/bridge/codex/session/start', {
    method: 'POST',
    body: JSON.stringify({ worktreePath, prompt })
  })
}

export function steerCodexSession(
  connection: BridgeConnection,
  worktreePath: string,
  prompt: string
): Promise<{ status: CodexSessionStatus }> {
  return request(connection, '/bridge/codex/session/steer', {
    method: 'POST',
    body: JSON.stringify({ worktreePath, prompt })
  })
}

export function interruptCodexSession(
  connection: BridgeConnection,
  worktreePath: string
): Promise<{ status: CodexSessionStatus }> {
  return request(connection, '/bridge/codex/session/interrupt', {
    method: 'POST',
    body: JSON.stringify({ worktreePath })
  })
}

export function getCodexSessionStatus(
  connection: BridgeConnection,
  worktreePath: string
): Promise<{ status: CodexSessionStatus }> {
  const query = new URLSearchParams({ worktreePath })
  return request(connection, `/bridge/codex/session/status?${query.toString()}`)
}

export function getCodexSessionEvents(
  connection: BridgeConnection,
  worktreePath: string,
  cursor: number
): Promise<{ events: CodexSessionEvent[]; nextCursor: number }> {
  const query = new URLSearchParams({ worktreePath, cursor: String(cursor) })
  return request(connection, `/bridge/codex/session/events?${query.toString()}`)
}

export function getCodexConversation(
  connection: BridgeConnection,
  worktreePath: string
): Promise<{ status: CodexSessionStatus; snapshot: CodexConversationSnapshot }> {
  const query = new URLSearchParams({ worktreePath })
  return request(connection, `/bridge/codex/session/conversation?${query.toString()}`)
}

export function resumeCodexConversation(
  connection: BridgeConnection,
  worktreePath: string
): Promise<{ status: CodexSessionStatus; snapshot: CodexConversationSnapshot }> {
  return request(connection, '/bridge/codex/session/conversation/resume', {
    method: 'POST',
    body: JSON.stringify({ worktreePath })
  })
}

export function waitForCodexConversationUpdate(
  connection: BridgeConnection,
  worktreePath: string,
  revision: number
): Promise<{ update: CodexConversationUpdate | null }> {
  const query = new URLSearchParams({ worktreePath, revision: String(revision) })
  return request(connection, `/bridge/codex/session/conversation/updates?${query.toString()}`, undefined)
}

export function getCodexPendingActions(
  connection: BridgeConnection,
  worktreePath: string
): Promise<{ actions: CodexPendingAction[] }> {
  const query = new URLSearchParams({ worktreePath })
  return request(connection, `/bridge/codex/session/pending-actions?${query.toString()}`)
}

export function respondCodexPendingAction(
  connection: BridgeConnection,
  worktreePath: string,
  actionId: string,
  response: string
): Promise<{ success: boolean; error?: string }> {
  return request(connection, '/bridge/codex/session/respond-action', {
    method: 'POST',
    body: JSON.stringify({ worktreePath, actionId, response })
  })
}
