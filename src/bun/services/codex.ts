import { randomUUID } from 'node:crypto'
import { getCodexEnabled, setCodexEnabled } from './config'
import { getShellEnv } from './shell-env'
import type { CodexPendingAction, CodexRuntimeStatus, CodexSessionEvent, CodexSessionStatus } from '../../shared/types'

interface CodexRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface CodexRpcResponse {
  jsonrpc?: unknown
  id?: unknown
  result?: unknown
  error?: unknown
}

interface CodexRpcInboundRequest {
  jsonrpc?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
}

interface PendingActionInternal {
  action: CodexPendingAction
  requestId: number
  method: 'item/commandExecution/requestApproval' | 'item/fileChange/requestApproval' | 'item/tool/requestUserInput'
  questionIds: string[]
}

interface CodexSessionRuntime {
  process: ReturnType<typeof Bun.spawn>
  worktreePath: string
  threadId: string
  activeTurnId: string | null
  startedAt: string
  updatedAt: string
  running: boolean
  error: string | null
  events: CodexSessionEvent[]
  nextEventId: number
  nextRpcId: number
  pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>
  pendingActions: PendingActionInternal[]
}

const MAX_SESSION_EVENTS = 500
const sessions = new Map<string, CodexSessionRuntime>()

function runtimeStatus(): CodexRuntimeStatus {
  const enabled = getCodexEnabled()
  const active = [...sessions.values()].find((session) => session.running)
  return {
    enabled,
    running: active !== undefined,
    pid: active?.process.pid ?? null,
    error: active?.error ?? null
  }
}

/** Get the current status for the global Codex runtime. */
export function getCodexStatus(): CodexRuntimeStatus {
  return runtimeStatus()
}

/** Enable or disable Codex sessions globally. Returns final status. */
export async function setCodexStatusEnabled(enabled: boolean): Promise<CodexRuntimeStatus> {
  setCodexEnabled(enabled)
  if (!enabled) {
    await stopAllCodexSessions()
  }
  return runtimeStatus()
}

/** Stops all managed Codex sessions. */
export async function stopAllCodexSessions(): Promise<void> {
  const running = [...sessions.values()]
  await Promise.all(running.map(async (session) => {
    try {
      session.process.kill('SIGTERM')
      await session.process.exited
    } catch {
      // Best-effort shutdown.
    }
  }))
}

/** Synchronously force-kills all sessions during final process exit. */
export function forceStopAllCodexSessions(): void {
  for (const session of sessions.values()) {
    try {
      session.process.kill('SIGTERM')
    } catch {
      // Best-effort shutdown.
    }
    session.running = false
  }
}

/** Starts a Codex turn for a worktree session. One active turn is allowed per worktree. */
export async function startCodexSession(worktreePath: string, prompt: string): Promise<CodexSessionStatus> {
  const trimmedPath = worktreePath.trim()
  let session = sessions.get(trimmedPath)

  if (!session) {
    session = await startAppServerSession(trimmedPath)
    sessions.set(trimmedPath, session)
  }

  if (session.running && session.activeTurnId) {
    throw new Error('A Codex session is already running for this worktree')
  }

  const response = await rpcRequest(session, 'turn/start', {
    threadId: session.threadId,
    input: [{ type: 'text', text: prompt, text_elements: [] }],
    approvalPolicy: 'on-request'
  })

  const turnId = getTurnIdFromTurnResponse(response)
  if (!turnId) {
    throw new Error('Failed to start Codex turn')
  }

  session.activeTurnId = turnId
  session.running = true
  addEvent(session, {
    kind: 'status',
    message: 'Codex turn started',
    rawType: 'turn/start'
  })

  return toSessionStatus(session)
}

/** Sends follow-up input to a running turn. */
export async function steerCodexSession(worktreePath: string, prompt: string): Promise<CodexSessionStatus> {
  const session = sessions.get(worktreePath.trim())
  if (!session || !session.running || !session.activeTurnId) {
    throw new Error('No active Codex turn to steer for this worktree')
  }

  await rpcRequest(session, 'turn/steer', {
    threadId: session.threadId,
    input: [{ type: 'text', text: prompt, text_elements: [] }],
    expectedTurnId: session.activeTurnId
  })

  addEvent(session, {
    kind: 'status',
    message: 'Codex turn steered',
    rawType: 'turn/steer'
  })

  return toSessionStatus(session)
}

/** Interrupts the active Codex turn for the given worktree. */
export async function interruptCodexSession(worktreePath: string): Promise<CodexSessionStatus | null> {
  const session = sessions.get(worktreePath.trim())
  if (!session) return null

  if (session.running && session.activeTurnId) {
    try {
      await rpcRequest(session, 'turn/interrupt', {
        threadId: session.threadId,
        turnId: session.activeTurnId
      })
    } catch {
      // Best-effort interrupt; completion notifications can still settle state.
    }

    session.running = false
    session.activeTurnId = null
    addEvent(session, {
      kind: 'status',
      message: 'Codex turn interrupted',
      rawType: 'turn/interrupt'
    })
  }

  return toSessionStatus(session)
}

/** Returns session status for a worktree, if available. */
export function getCodexSessionStatus(worktreePath: string): CodexSessionStatus | null {
  const session = sessions.get(worktreePath)
  if (!session) return null
  return toSessionStatus(session)
}

/** Returns events after the provided cursor for a worktree session. */
export function getCodexSessionEvents(
  worktreePath: string,
  cursor: number
): { events: CodexSessionEvent[]; nextCursor: number } {
  const session = sessions.get(worktreePath)
  if (!session) {
    return { events: [], nextCursor: cursor }
  }

  const events = session.events.filter((event) => event.id > cursor)
  const nextCursor = events.length > 0 ? events[events.length - 1].id : cursor
  return { events, nextCursor }
}

/** Returns pending approval/input actions for a worktree session. */
export function getCodexPendingActions(worktreePath: string): CodexPendingAction[] {
  const session = sessions.get(worktreePath)
  if (!session) return []
  return session.pendingActions.map((entry) => entry.action)
}

/** Records a response for a pending action and forwards it to Codex app-server. */
export function respondCodexPendingAction(
  worktreePath: string,
  actionId: string,
  response: string
): { success: boolean; error?: string } {
  const session = sessions.get(worktreePath)
  if (!session) {
    return { success: false, error: 'Session not found' }
  }

  const index = session.pendingActions.findIndex((entry) => entry.action.id === actionId)
  if (index === -1) {
    return { success: false, error: 'Action not found' }
  }

  const pending = session.pendingActions[index]
  session.pendingActions.splice(index, 1)

  const payload = buildActionResponsePayload(pending, response)
  if (!payload) {
    return { success: false, error: 'Unsupported action response' }
  }

  sendRpcResponse(session, pending.requestId, payload)
  addEvent(session, {
    kind: 'status',
    message: `Action ${actionId} resolved with response: ${response}`,
    rawType: pending.method
  })

  return { success: true }
}

async function startAppServerSession(worktreePath: string): Promise<CodexSessionRuntime> {
  const env = await getShellEnv()
  const startedAt = new Date().toISOString()
  const proc = Bun.spawn(['codex', 'app-server', '--listen', 'stdio://'], {
    cwd: worktreePath,
    env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe'
  })

  const session: CodexSessionRuntime = {
    process: proc,
    worktreePath,
    threadId: '',
    activeTurnId: null,
    startedAt,
    updatedAt: startedAt,
    running: false,
    error: null,
    events: [],
    nextEventId: 1,
    nextRpcId: 1,
    pendingRequests: new Map(),
    pendingActions: []
  }

  addEvent(session, {
    kind: 'status',
    message: 'Codex app-server started',
    rawType: 'app-server/start'
  })

  void consumeStdout(session)
  void consumeStderr(session)

  proc.exited.then((exitCode) => {
    session.running = false
    session.activeTurnId = null
    session.updatedAt = new Date().toISOString()

    for (const pending of session.pendingRequests.values()) {
      pending.reject(new Error('Codex app-server exited'))
    }
    session.pendingRequests.clear()

    if (exitCode !== 0) {
      session.error = `Codex app-server exited with code ${exitCode}`
      addEvent(session, {
        kind: 'error',
        message: session.error,
        rawType: 'app-server/exit'
      })
    } else {
      addEvent(session, {
        kind: 'status',
        message: 'Codex app-server stopped',
        rawType: 'app-server/exit'
      })
    }
  })

  await rpcRequest(session, 'initialize', {
    clientInfo: {
      name: 'treebeard',
      version: '1.0.0'
    },
    capabilities: null
  })
  sendRpcNotification(session, 'initialized')

  const threadResp = await rpcRequest(session, 'thread/start', {
    cwd: worktreePath,
    approvalPolicy: 'on-request',
    sandbox: 'workspace-write',
    experimentalRawEvents: false,
    persistExtendedHistory: false
  })

  const threadId = getThreadIdFromThreadResponse(threadResp)
  if (!threadId) {
    throw new Error('Codex app-server did not return thread id')
  }

  session.threadId = threadId
  addEvent(session, {
    kind: 'status',
    message: `Codex thread initialized (${threadId})`,
    rawType: 'thread/start'
  })

  return session
}

async function rpcRequest(session: CodexSessionRuntime, method: string, params: unknown): Promise<unknown> {
  const id = session.nextRpcId
  session.nextRpcId += 1

  const request: CodexRpcRequest = {
    jsonrpc: '2.0',
    id,
    method,
    params
  }

  const promise = new Promise<unknown>((resolve, reject) => {
    session.pendingRequests.set(id, { resolve, reject })
  })

  sendRpcLine(session, request)
  return await promise
}

function sendRpcNotification(session: CodexSessionRuntime, method: string, params?: unknown): void {
  sendRpcLine(session, {
    jsonrpc: '2.0',
    method,
    ...(params !== undefined ? { params } : {})
  })
}

function sendRpcResponse(session: CodexSessionRuntime, id: number, result: unknown): void {
  sendRpcLine(session, {
    jsonrpc: '2.0',
    id,
    result
  })
}

function sendRpcLine(session: CodexSessionRuntime, payload: unknown): void {
  const sink = session.process.stdin as { write: (data: string) => void } | undefined
  if (!sink) return
  try {
    sink.write(`${JSON.stringify(payload)}\n`)
  } catch {
    session.error = 'Failed to write to Codex app-server stdin'
    addEvent(session, {
      kind: 'error',
      message: session.error,
      rawType: 'app-server/write'
    })
  }
}

async function consumeStdout(session: CodexSessionRuntime): Promise<void> {
  if (!(session.process.stdout instanceof ReadableStream)) return
  await consumeStream(session, session.process.stdout, 'stdout')
}

async function consumeStderr(session: CodexSessionRuntime): Promise<void> {
  if (!(session.process.stderr instanceof ReadableStream)) return
  await consumeStream(session, session.process.stderr, 'stderr')
}

async function consumeStream(
  session: CodexSessionRuntime,
  stream: ReadableStream<Uint8Array>,
  source: 'stdout' | 'stderr'
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ''

  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      pending += decoder.decode(result.value, { stream: true })
      const lines = pending.split('\n')
      pending = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length === 0) continue
        processStreamLine(session, trimmed, source)
      }
    }

    const final = pending.trim()
    if (final.length > 0) {
      processStreamLine(session, final, source)
    }
  } catch {
    addEvent(session, {
      kind: 'error',
      message: `Failed to read codex ${source} stream`,
      rawType: 'app-server/read'
    })
  }
}

function processStreamLine(session: CodexSessionRuntime, line: string, source: 'stdout' | 'stderr'): void {
  const parsed = safeJson(line)
  if (parsed === null) {
    addEvent(session, {
      kind: source === 'stderr' ? 'error' : 'message',
      message: line,
      rawType: null
    })
    return
  }

  if (isRpcResponse(parsed)) {
    handleRpcResponse(session, parsed)
    return
  }

  if (isRpcInboundRequest(parsed)) {
    handleRpcInbound(session, parsed)
    return
  }

  addEvent(session, {
    kind: source === 'stderr' ? 'error' : 'message',
    message: line,
    rawType: null
  })
}

function handleRpcResponse(session: CodexSessionRuntime, response: CodexRpcResponse): void {
  const id = typeof response.id === 'number' ? response.id : null
  if (id === null) return

  const pending = session.pendingRequests.get(id)
  if (!pending) return
  session.pendingRequests.delete(id)

  if (response.error !== undefined) {
    pending.reject(response.error)
    const message = extractReadableMessage(response.error) || 'Codex app-server request failed'
    addEvent(session, {
      kind: 'error',
      message,
      rawType: 'rpc/error'
    })
    return
  }

  pending.resolve(response.result)
}

function handleRpcInbound(session: CodexSessionRuntime, inbound: CodexRpcInboundRequest): void {
  const method = typeof inbound.method === 'string' ? inbound.method : null
  if (!method) return

  const requestId = typeof inbound.id === 'number' ? inbound.id : null
  const params = (typeof inbound.params === 'object' && inbound.params !== null)
    ? inbound.params as Record<string, unknown>
    : {}

  if (requestId !== null && isServerRequestMethod(method)) {
    queuePendingAction(session, requestId, method, params)
    return
  }

  handleNotification(session, method, params)
}

function isServerRequestMethod(method: string): method is PendingActionInternal['method'] {
  return method === 'item/commandExecution/requestApproval'
    || method === 'item/fileChange/requestApproval'
    || method === 'item/tool/requestUserInput'
}

function queuePendingAction(
  session: CodexSessionRuntime,
  requestId: number,
  method: PendingActionInternal['method'],
  params: Record<string, unknown>
): void {
  const actionId = randomUUID()
  const worktreePath = session.worktreePath
  const questionIds: string[] = []

  let prompt = extractReadableMessage(params) || method
  let options: string[] = []
  let kind: CodexPendingAction['kind'] = 'approval'

  if (method === 'item/tool/requestUserInput') {
    kind = 'user_input'
    const questions = Array.isArray(params.questions) ? params.questions : []
    options = []

    for (const question of questions) {
      if (!question || typeof question !== 'object') continue
      const record = question as Record<string, unknown>
      if (typeof record.id === 'string') {
        questionIds.push(record.id)
      }
      if (typeof record.question === 'string' && prompt === method) {
        prompt = record.question
      }
      const opts = Array.isArray(record.options) ? record.options : []
      for (const opt of opts) {
        if (!opt || typeof opt !== 'object') continue
        const optRecord = opt as Record<string, unknown>
        if (typeof optRecord.label === 'string') {
          options.push(optRecord.label)
        }
      }
    }
  }

  if (method !== 'item/tool/requestUserInput') {
    options = ['approve', 'deny']
    const reason = typeof params.reason === 'string' ? params.reason : null
    if (reason) {
      prompt = reason
    }
  }

  const pending: PendingActionInternal = {
    action: {
      id: actionId,
      worktreePath,
      kind,
      prompt,
      options
    },
    requestId,
    method,
    questionIds
  }

  session.pendingActions.push(pending)
  addEvent(session, {
    kind: 'status',
    message: `Action requested: ${prompt}`,
    rawType: method
  })
}

function handleNotification(session: CodexSessionRuntime, method: string, params: Record<string, unknown>): void {
  if (method === 'turn/started') {
    const turnId = getTurnIdFromTurnParams(params)
    if (turnId) {
      session.activeTurnId = turnId
      session.running = true
    }
  }

  if (method === 'turn/completed') {
    session.running = false
    session.activeTurnId = null
  }

  if (method === 'serverRequest/resolved') {
    const requestId = typeof params.requestId === 'number' ? params.requestId : null
    if (requestId !== null) {
      session.pendingActions = session.pendingActions.filter((entry) => entry.requestId !== requestId)
    }
  }

  const message = extractReadableMessage(params) || `Notification: ${method}`
  const kind = selectEventKind(method)
  addEvent(session, {
    kind,
    message,
    rawType: method
  })
}

function buildActionResponsePayload(pending: PendingActionInternal, response: string): unknown {
  const normalized = response.trim().toLowerCase()

  if (pending.method === 'item/commandExecution/requestApproval') {
    return {
      decision: normalized.startsWith('a') ? 'accept' : normalized.startsWith('c') ? 'cancel' : 'decline'
    }
  }

  if (pending.method === 'item/fileChange/requestApproval') {
    return {
      decision: normalized.startsWith('a') ? 'accept' : normalized.startsWith('c') ? 'cancel' : 'decline'
    }
  }

  if (pending.method === 'item/tool/requestUserInput') {
    const answer = normalized.length > 0 ? response : 'decline'
    const answers: Record<string, { answers: string[] }> = {}

    const questionIds = pending.questionIds.length > 0 ? pending.questionIds : ['response']
    for (const questionId of questionIds) {
      answers[questionId] = { answers: [answer] }
    }

    return { answers }
  }

  return null
}

function getThreadIdFromThreadResponse(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>
  const thread = (typeof record.thread === 'object' && record.thread !== null)
    ? record.thread as Record<string, unknown>
    : null
  return thread && typeof thread.id === 'string' ? thread.id : null
}

function getTurnIdFromTurnResponse(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>
  const turn = (typeof record.turn === 'object' && record.turn !== null)
    ? record.turn as Record<string, unknown>
    : null
  return turn && typeof turn.id === 'string' ? turn.id : null
}

function getTurnIdFromTurnParams(params: Record<string, unknown>): string | null {
  const turn = (typeof params.turn === 'object' && params.turn !== null)
    ? params.turn as Record<string, unknown>
    : null
  return turn && typeof turn.id === 'string' ? turn.id : null
}

function toSessionStatus(session: CodexSessionRuntime): CodexSessionStatus {
  return {
    worktreePath: session.worktreePath,
    threadId: session.threadId,
    running: session.running,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    lastEventId: session.nextEventId - 1,
    error: session.error
  }
}

function addEvent(
  session: CodexSessionRuntime,
  event: Omit<CodexSessionEvent, 'id' | 'at' | 'worktreePath'>
): void {
  const nextEvent: CodexSessionEvent = {
    id: session.nextEventId,
    at: new Date().toISOString(),
    worktreePath: session.worktreePath,
    kind: event.kind,
    message: event.message,
    rawType: event.rawType
  }
  session.nextEventId += 1
  session.events.push(nextEvent)
  session.updatedAt = nextEvent.at

  if (session.events.length > MAX_SESSION_EVENTS) {
    session.events.splice(0, session.events.length - MAX_SESSION_EVENTS)
  }
}

function extractReadableMessage(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const keys = ['message', 'text', 'delta', 'reason', 'error']
  for (const key of keys) {
    if (typeof record[key] === 'string' && (record[key] as string).trim().length > 0) {
      return record[key] as string
    }
  }

  for (const child of Object.values(record)) {
    const nested = extractReadableMessage(child)
    if (nested) return nested
  }

  return null
}

function selectEventKind(method: string): CodexSessionEvent['kind'] {
  if (method.includes('error') || method.includes('failed')) return 'error'
  if (method.includes('reasoning')) return 'reasoning'
  if (method.includes('commandExecution')) return 'command'
  if (method.includes('started') || method.includes('completed') || method.includes('status')) return 'status'
  return 'message'
}

function safeJson(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function isRpcResponse(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, 'id')
    && (Object.prototype.hasOwnProperty.call(value, 'result') || Object.prototype.hasOwnProperty.call(value, 'error'))
}

function isRpcInboundRequest(value: Record<string, unknown>): boolean {
  return typeof value.method === 'string'
}
