import { randomUUID } from 'node:crypto'
import { getCodexEnabled, setCodexEnabled } from './config'
import { getShellEnv } from './shell-env'
import type {
  CodexConversationItem,
  CodexConversationSnapshot,
  CodexConversationTurn,
  CodexConversationUpdate,
  CodexPendingAction,
  CodexRuntimeStatus,
  CodexSessionEvent,
  CodexSessionStatus
} from '../../shared/types'

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

interface CodexConversationTurnRuntime {
  id: string
  status: string
  error: string | null
  items: CodexConversationItem[]
}

type CodexConversationListener = (update: CodexConversationUpdate) => void

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
  streamingAssistantByItemId: Map<string, number>
  conversationRevision: number
  turns: Map<string, CodexConversationTurnRuntime>
  turnOrder: string[]
  pendingTurnId: string | null
}

const MAX_SESSION_EVENTS = 500
const OPT_OUT_NOTIFICATION_METHODS = [
  'codex/event/agent_message_content_delta',
  'codex/event/agent_message_delta',
  'codex/event/agent_reasoning_delta',
  'codex/event/reasoning_content_delta',
  'codex/event/reasoning_raw_content_delta',
  'codex/event/exec_command_output_delta',
  'codex/event/exec_approval_request',
  'codex/event/exec_command_begin',
  'codex/event/exec_command_end',
  'codex/event/exec_output',
  'codex/event/item_started',
  'codex/event/item_completed',
  'item/plan/delta',
  'item/commandExecution/outputDelta',
  'item/fileChange/outputDelta',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/textDelta'
] as const
const sessions = new Map<string, CodexSessionRuntime>()
const conversationListeners = new Map<string, Set<CodexConversationListener>>()

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

  const pendingTurnId = `pending:${randomUUID()}`
  session.pendingTurnId = pendingTurnId
  insertUserConversationItem(session, pendingTurnId, prompt)

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
  bindPendingTurn(session, pendingTurnId, turnId)
  session.pendingTurnId = null
  addEvent(session, {
    kind: 'status',
    message: 'Codex turn started',
    rawType: 'turn/start'
  })
  addUserDebugEvent(session, prompt, turnId, 'turn/start')

  return toSessionStatus(session)
}

/** Sends follow-up input to a running turn. */
export async function steerCodexSession(worktreePath: string, prompt: string): Promise<CodexSessionStatus> {
  const session = sessions.get(worktreePath.trim())
  if (!session || !session.running || !session.activeTurnId) {
    throw new Error('No active Codex turn to steer for this worktree')
  }

  insertUserConversationItem(session, session.activeTurnId, prompt)
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
  addUserDebugEvent(session, prompt, session.activeTurnId, 'turn/steer')

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
    notifySessionChanged(session)
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

/** Returns the current normalized conversation snapshot for a worktree session. */
export async function getCodexConversation(
  worktreePath: string
): Promise<{ status: CodexSessionStatus; snapshot: CodexConversationSnapshot } | null> {
  const session = sessions.get(worktreePath.trim())
  if (!session) return null

  if (session.threadId.length > 0 && session.turnOrder.length === 0) {
    await hydrateConversationFromThreadRead(session)
  }

  return {
    status: toSessionStatus(session),
    snapshot: toConversationSnapshot(session)
  }
}

/** Reloads the conversation snapshot from the app-server thread and returns the latest view. */
export async function resumeCodexConversation(
  worktreePath: string
): Promise<{ status: CodexSessionStatus; snapshot: CodexConversationSnapshot } | null> {
  const session = sessions.get(worktreePath.trim())
  if (!session || session.threadId.length === 0) return null

  await hydrateConversationFromThreadResume(session)
  return {
    status: toSessionStatus(session),
    snapshot: toConversationSnapshot(session)
  }
}

/** Waits for the next conversation update after the provided revision, or returns null on timeout. */
export async function waitForCodexConversationUpdate(
  worktreePath: string,
  revision: number,
  timeoutMs: number
): Promise<CodexConversationUpdate | null> {
  const key = worktreePath.trim()
  const session = sessions.get(key)
  if (!session) return null

  if (session.conversationRevision !== revision) {
    return buildConversationUpdate(session)
  }

  return await new Promise<CodexConversationUpdate | null>((resolve) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      unsubscribe()
      resolve(null)
    }, timeoutMs)

    const unsubscribe = subscribeCodexConversation(key, (update) => {
      if (settled) return
      if (update.snapshot.revision === revision) return
      settled = true
      clearTimeout(timeout)
      unsubscribe()
      resolve(update)
    })
  })
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
  notifySessionChanged(session)
  addEvent(session, {
    kind: 'status',
    message: `Action ${actionId} resolved with response: ${response}`,
    rawType: pending.method
  })

  return { success: true }
}

/** Subscribes to live conversation updates for a worktree session. */
export function subscribeCodexConversation(
  worktreePath: string,
  listener: CodexConversationListener
): () => void {
  const key = worktreePath.trim()
  const listeners = conversationListeners.get(key) ?? new Set<CodexConversationListener>()
  listeners.add(listener)
  conversationListeners.set(key, listeners)

  const session = sessions.get(key)
  if (session) {
    listener(buildConversationUpdate(session))
  }

  return () => {
    const current = conversationListeners.get(key)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) {
      conversationListeners.delete(key)
    }
  }
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
    pendingActions: [],
    streamingAssistantByItemId: new Map(),
    conversationRevision: 0,
    turns: new Map(),
    turnOrder: [],
    pendingTurnId: null
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
    notifySessionChanged(session)
  })

  await rpcRequest(session, 'initialize', {
    clientInfo: {
      name: 'treebeard',
      version: '1.0.0'
    },
    capabilities: {
      experimentalApi: true,
      optOutNotificationMethods: [...OPT_OUT_NOTIFICATION_METHODS]
    }
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
      actor: 'system',
      channel: 'diagnostic',
      title: source,
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
    actor: 'system',
    channel: 'diagnostic',
    title: source,
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
  upsertConversationStatusItem(session, {
    turnId: session.activeTurnId ?? session.pendingTurnId ?? 'pending-actions',
    itemId: actionId,
    title: 'Pending action',
    text: prompt,
    status: 'pending'
  })
  addEvent(session, {
    kind: 'status',
    message: `Action requested: ${prompt}`,
    rawType: method
  })
  notifySessionChanged(session)
}

function handleNotification(session: CodexSessionRuntime, method: string, params: Record<string, unknown>): void {
  if (method === 'serverRequest/resolved') {
    const requestId = typeof params.requestId === 'number' ? params.requestId : null
    if (requestId !== null) {
      session.pendingActions = session.pendingActions.filter((entry) => entry.requestId !== requestId)
      notifySessionChanged(session)
    }
    return
  }

  if (method === 'turn/started') {
    const turnId = getTurnIdFromNotification(params) ?? session.activeTurnId
    if (turnId) {
      if (session.pendingTurnId) {
        bindPendingTurn(session, session.pendingTurnId, turnId)
        session.pendingTurnId = null
      }
      session.activeTurnId = turnId
      setTurnRuntimeStatus(session, turnId, 'running', null)
    }
    session.running = true
    addEvent(session, {
      kind: 'status',
      actor: 'system',
      channel: 'diagnostic',
      title: 'Turn started',
      turnId: turnId ?? undefined,
      phase: 'completed',
      message: 'Codex turn started',
      rawType: method
    })
    return
  }

  if (method === 'turn/completed') {
    const turnId = getTurnIdFromNotification(params) ?? session.activeTurnId
    session.running = false
    if (turnId) {
      setTurnRuntimeStatus(session, turnId, 'completed', null)
    }
    session.activeTurnId = null
    addEvent(session, {
      kind: 'status',
      actor: 'system',
      channel: 'diagnostic',
      title: 'Turn completed',
      turnId: turnId ?? undefined,
      phase: 'completed',
      message: 'Codex turn completed',
      rawType: method
    })
    return
  }

  if (method === 'error') {
    const errorMessage = getErrorMessageFromNotification(params) ?? 'Codex reported an error'
    const turnId = getTurnIdFromNotification(params)
    if (turnId) {
      setTurnRuntimeStatus(session, turnId, 'failed', errorMessage)
    }
    upsertConversationStatusItem(session, {
      turnId: turnId ?? session.activeTurnId ?? 'status',
      itemId: `error:${randomUUID()}`,
      title: 'Error',
      text: errorMessage,
      status: 'completed'
    })
    addEvent(session, {
      kind: 'error',
      actor: 'system',
      channel: 'diagnostic',
      title: 'Error',
      turnId: getTurnIdFromNotification(params) ?? undefined,
      phase: 'completed',
      message: errorMessage,
      rawType: method
    })
    return
  }

  if (method === 'thread/compacted' || method === 'model/rerouted') {
    const message = extractReadableMessage(params) || method.replace('/', ' ')
    upsertConversationStatusItem(session, {
      turnId: session.activeTurnId ?? 'status',
      itemId: `${method}:${randomUUID()}`,
      title: method,
      text: message,
      status: 'completed'
    })
    addEvent(session, {
      kind: 'status',
      actor: 'system',
      channel: 'diagnostic',
      title: method,
      phase: 'completed',
      message,
      rawType: method
    })
    return
  }

  if (method === 'item/agentMessage/delta') {
    const itemId = typeof params.itemId === 'string' ? params.itemId : null
    const delta = typeof params.delta === 'string' ? params.delta : null
    const turnId = typeof params.turnId === 'string' ? params.turnId : null
    if (!itemId || !delta || delta.length === 0) return
    upsertAssistantDelta(session, itemId, turnId, delta, method)
    return
  }

  if (method === 'item/completed') {
    const completed = readNotificationItem(params)
    if (!completed) return
    const { item, turnId } = completed
    const itemType = typeof item.type === 'string' ? item.type : null
    const itemId = typeof item.id === 'string' ? item.id : null

    if (itemType === 'agentMessage') {
      const text = typeof item.text === 'string' ? item.text : null
      if (!text || text.trim().length === 0) return
      finalizeAssistantMessage(session, {
        itemId,
        turnId,
        text,
        rawType: method
      })
      return
    }

    const diagnostic = summarizeDiagnosticItem(item, 'completed')
    if (!diagnostic) return
    upsertConversationDiagnosticItem(session, item, turnId, 'completed')
    addEvent(session, {
      kind: diagnostic.kind,
      actor: 'system',
      channel: 'diagnostic',
      title: diagnostic.title,
      turnId: turnId ?? undefined,
      itemId: itemId ?? undefined,
      phase: 'completed',
      message: diagnostic.message,
      rawType: method
    })
    return
  }

  if (method === 'item/started') {
    const started = readNotificationItem(params)
    if (!started) return
    const { item, turnId } = started
    const itemType = typeof item.type === 'string' ? item.type : null
    if (itemType === 'agentMessage') return

    const itemId = typeof item.id === 'string' ? item.id : null
    const diagnostic = summarizeDiagnosticItem(item, 'started')
    if (!diagnostic) return
    upsertConversationDiagnosticItem(session, item, turnId, 'pending')
    addEvent(session, {
      kind: diagnostic.kind,
      actor: 'system',
      channel: 'diagnostic',
      title: diagnostic.title,
      turnId: turnId ?? undefined,
      itemId: itemId ?? undefined,
      phase: 'streaming',
      message: diagnostic.message,
      rawType: method
    })
    return
  }
}

function upsertAssistantDelta(
  session: CodexSessionRuntime,
  itemId: string,
  turnId: string | null,
  delta: string,
  rawType: string
): void {
  const resolvedTurnId = turnId ?? session.activeTurnId ?? session.pendingTurnId ?? 'pending-assistant'
  upsertAssistantConversationItem(session, resolvedTurnId, itemId, delta, 'streaming', null)

  const existingEventId = session.streamingAssistantByItemId.get(itemId)
  if (existingEventId !== undefined) {
    const existing = session.events.find((event) => event.id === existingEventId)
    if (existing) {
      existing.message = `${existing.message}${delta}`
      existing.at = new Date().toISOString()
      existing.turnId = turnId ?? existing.turnId
      existing.rawType = rawType
      existing.phase = 'streaming'
      session.updatedAt = existing.at
      return
    }
    session.streamingAssistantByItemId.delete(itemId)
  }

  const created = addEvent(session, {
    kind: 'message',
    actor: 'assistant',
    channel: 'chat',
    title: null,
    turnId: turnId ?? undefined,
    itemId,
    phase: 'streaming',
    message: delta,
    rawType
  })
  if (created) {
    session.streamingAssistantByItemId.set(itemId, created.id)
  }
}

function finalizeAssistantMessage(
  session: CodexSessionRuntime,
  args: { itemId: string | null; turnId: string | null; text: string; rawType: string }
): void {
  const resolvedTurnId = args.turnId ?? session.activeTurnId ?? session.pendingTurnId ?? 'completed-assistant'
  upsertAssistantConversationItem(session, resolvedTurnId, args.itemId ?? `assistant:${randomUUID()}`, args.text, 'completed', null)

  if (args.itemId) {
    const existingId = session.streamingAssistantByItemId.get(args.itemId)
    if (existingId !== undefined) {
      const existing = session.events.find((event) => event.id === existingId)
      if (existing) {
        existing.message = args.text
        existing.turnId = args.turnId ?? existing.turnId
        existing.itemId = args.itemId
        existing.phase = 'completed'
        existing.rawType = args.rawType
        existing.at = new Date().toISOString()
        session.updatedAt = existing.at
        session.streamingAssistantByItemId.delete(args.itemId)
        return
      }
      session.streamingAssistantByItemId.delete(args.itemId)
    }
  }

  addEvent(session, {
    kind: 'message',
    actor: 'assistant',
    channel: 'chat',
    title: null,
    turnId: args.turnId ?? undefined,
    itemId: args.itemId ?? undefined,
    phase: 'completed',
    message: args.text,
    rawType: args.rawType
  })
}

function insertUserConversationItem(session: CodexSessionRuntime, turnId: string, prompt: string): void {
  const threadId = session.threadId || 'pending-thread'
  const now = new Date().toISOString()
  const turn = ensureConversationTurn(session, turnId)
  turn.items.push({
    id: `user:${randomUUID()}`,
    type: 'user_message',
    threadId,
    turnId,
    itemId: `user:${randomUUID()}`,
    status: 'completed',
    createdAt: now,
    updatedAt: now,
    text: prompt
  })
  touchConversation(session)
}

function addUserDebugEvent(
  session: CodexSessionRuntime,
  prompt: string,
  turnId: string | null,
  rawType: string
): void {
  addEvent(session, {
    kind: 'message',
    actor: 'user',
    channel: 'chat',
    title: 'Prompt',
    turnId: turnId ?? undefined,
    phase: 'completed',
    message: prompt,
    rawType
  })
}

function bindPendingTurn(session: CodexSessionRuntime, pendingTurnId: string, turnId: string): void {
  if (pendingTurnId === turnId) return
  const pendingTurn = session.turns.get(pendingTurnId)
  if (!pendingTurn) {
    ensureConversationTurn(session, turnId)
    return
  }

  session.turns.delete(pendingTurnId)
  pendingTurn.id = turnId
  pendingTurn.items = pendingTurn.items.map((item) => ({
    ...item,
    turnId,
    threadId: session.threadId
  }))
  session.turns.set(turnId, pendingTurn)
  session.turnOrder = session.turnOrder.map((entry) => entry === pendingTurnId ? turnId : entry)
  touchConversation(session)
}

function ensureConversationTurn(session: CodexSessionRuntime, turnId: string): CodexConversationTurnRuntime {
  const existing = session.turns.get(turnId)
  if (existing) return existing

  const next: CodexConversationTurnRuntime = {
    id: turnId,
    status: turnId.startsWith('pending:') ? 'pending' : 'running',
    error: null,
    items: []
  }
  session.turns.set(turnId, next)
  session.turnOrder.push(turnId)
  touchConversation(session)
  return next
}

function touchConversation(session: CodexSessionRuntime): void {
  session.conversationRevision += 1
  session.updatedAt = new Date().toISOString()
  notifySessionChanged(session)
}

function setTurnRuntimeStatus(session: CodexSessionRuntime, turnId: string, status: string, error: string | null): void {
  const turn = ensureConversationTurn(session, turnId)
  turn.status = status
  turn.error = error
  touchConversation(session)
}

function upsertAssistantConversationItem(
  session: CodexSessionRuntime,
  turnId: string,
  itemId: string,
  text: string,
  status: 'streaming' | 'completed',
  phase: string | null
): void {
  const turn = ensureConversationTurn(session, turnId)
  const now = new Date().toISOString()
  const existing = turn.items.find((item) => item.type === 'assistant_message' && item.itemId === itemId)
  if (existing && existing.type === 'assistant_message') {
    existing.text = status === 'streaming' ? `${existing.text}${text}` : text
    existing.status = status
    existing.phase = phase
    existing.updatedAt = now
    touchConversation(session)
    return
  }

  turn.items.push({
    id: `assistant:${itemId}`,
    type: 'assistant_message',
    threadId: session.threadId,
    turnId,
    itemId,
    status,
    createdAt: now,
    updatedAt: now,
    text,
    phase
  })
  touchConversation(session)
}

function upsertConversationDiagnosticItem(
  session: CodexSessionRuntime,
  item: Record<string, unknown>,
  turnId: string | null,
  status: 'pending' | 'completed'
): void {
  const resolvedTurnId = turnId ?? session.activeTurnId ?? session.pendingTurnId ?? 'status'
  const itemType = typeof item.type === 'string' ? item.type : null
  const itemId = typeof item.id === 'string' ? item.id : `${itemType ?? 'status'}:${randomUUID()}`
  const now = new Date().toISOString()
  const turn = ensureConversationTurn(session, resolvedTurnId)
  const existingIndex = turn.items.findIndex((entry) => entry.itemId === itemId)
  const next = normalizeConversationItemFromThreadItem(session.threadId, resolvedTurnId, item, status, now)
  if (!next) return
  if (existingIndex >= 0) {
    turn.items[existingIndex] = next
  } else {
    turn.items.push(next)
  }
  touchConversation(session)
}

function upsertConversationStatusItem(
  session: CodexSessionRuntime,
  args: { turnId: string; itemId: string; title: string; text: string; status: 'pending' | 'completed' }
): void {
  const turn = ensureConversationTurn(session, args.turnId)
  const now = new Date().toISOString()
  const existingIndex = turn.items.findIndex((item) => item.type === 'status' && item.itemId === args.itemId)
  const next: CodexConversationItem = {
    id: `status:${args.itemId}`,
    type: 'status',
    threadId: session.threadId || 'pending-thread',
    turnId: args.turnId,
    itemId: args.itemId,
    status: args.status,
    createdAt: now,
    updatedAt: now,
    title: args.title,
    text: args.text
  }
  if (existingIndex >= 0) {
    turn.items[existingIndex] = next
  } else {
    turn.items.push(next)
  }
  touchConversation(session)
}

function normalizeConversationItemFromThreadItem(
  threadId: string,
  turnId: string,
  item: Record<string, unknown>,
  status: 'pending' | 'completed',
  now: string
): CodexConversationItem | null {
  const itemId = typeof item.id === 'string' ? item.id : randomUUID()
  const base = {
    id: `${turnId}:${itemId}`,
    threadId,
    turnId,
    itemId,
    status,
    createdAt: now,
    updatedAt: now
  }
  const type = typeof item.type === 'string' ? item.type : null
  if (type === 'plan') {
    return { ...base, type: 'plan', text: typeof item.text === 'string' ? item.text : '' }
  }
  if (type === 'reasoning') {
    return {
      ...base,
      type: 'reasoning',
      summary: toStringArray(item.summary),
      content: toStringArray(item.content)
    }
  }
  if (type === 'commandExecution') {
    return {
      ...base,
      type: 'command_execution',
      command: typeof item.command === 'string' ? item.command : '',
      cwd: typeof item.cwd === 'string' ? item.cwd : '',
      processId: typeof item.processId === 'string' ? item.processId : null,
      executionStatus: typeof item.status === 'string' ? item.status : status,
      output: typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : null,
      exitCode: typeof item.exitCode === 'number' ? item.exitCode : null,
      durationMs: typeof item.durationMs === 'number' ? item.durationMs : null
    }
  }
  if (type === 'fileChange') {
    return {
      ...base,
      type: 'file_change',
      changeCount: Array.isArray(item.changes) ? item.changes.length : 0,
      patchStatus: typeof item.status === 'string' ? item.status : status
    }
  }
  if (type === 'mcpToolCall') {
    return {
      ...base,
      type: 'mcp_tool_call',
      server: typeof item.server === 'string' ? item.server : '',
      tool: typeof item.tool === 'string' ? item.tool : '',
      toolStatus: typeof item.status === 'string' ? item.status : status,
      resultSummary: summarizeJsonValue(item.result),
      errorSummary: summarizeJsonValue(item.error),
      durationMs: typeof item.durationMs === 'number' ? item.durationMs : null
    }
  }
  if (type === 'dynamicToolCall') {
    return {
      ...base,
      type: 'status',
      title: 'Dynamic tool',
      text: typeof item.tool === 'string' ? item.tool : 'Dynamic tool'
    }
  }
  if (type === 'collabAgentToolCall') {
    return {
      ...base,
      type: 'status',
      title: 'Agent tool',
      text: typeof item.tool === 'string' ? item.tool : 'Agent tool'
    }
  }
  if (type === 'enteredReviewMode' || type === 'exitedReviewMode' || type === 'contextCompaction') {
    return {
      ...base,
      type: 'status',
      title: type,
      text: typeof item.review === 'string' ? item.review : type
    }
  }
  return null
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function summarizeJsonValue(value: unknown): string | null {
  const text = extractReadableMessage(value)
  if (text && text.trim().length > 0) return text.trim()
  return null
}

function readNotificationItem(
  params: Record<string, unknown>
): { turnId: string | null; item: Record<string, unknown> } | null {
  const item = (typeof params.item === 'object' && params.item !== null)
    ? params.item as Record<string, unknown>
    : null
  if (!item) return null

  const turnId = typeof params.turnId === 'string' ? params.turnId : null
  return { turnId, item }
}

function getTurnIdFromNotification(params: Record<string, unknown>): string | null {
  if (typeof params.turnId === 'string') return params.turnId
  return getTurnIdFromTurnParams(params)
}

function getErrorMessageFromNotification(params: Record<string, unknown>): string | null {
  if (typeof params.message === 'string' && params.message.trim().length > 0) {
    return params.message
  }

  const error = (typeof params.error === 'object' && params.error !== null)
    ? params.error as Record<string, unknown>
    : null
  if (!error) return null

  if (typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message
  }
  return extractReadableMessage(error)
}

function summarizeDiagnosticItem(
  item: Record<string, unknown>,
  phase: 'started' | 'completed'
): { kind: CodexSessionEvent['kind']; title: string; message: string } | null {
  const itemType = typeof item.type === 'string' ? item.type : null
  if (!itemType) return null

  if (itemType === 'reasoning') {
    const summary = Array.isArray(item.summary)
      ? item.summary.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).join('\n')
      : ''
    return {
      kind: 'reasoning',
      title: 'Reasoning',
      message: summary || `Reasoning ${phase}`
    }
  }

  if (itemType === 'plan') {
    return {
      kind: 'status',
      title: 'Plan',
      message: typeof item.text === 'string' && item.text.length > 0 ? item.text : `Plan ${phase}`
    }
  }

  if (itemType === 'commandExecution') {
    const command = typeof item.command === 'string' ? item.command : 'command'
    const status = typeof item.status === 'string' ? item.status : phase
    return {
      kind: 'command',
      title: 'Command',
      message: `${command} (${status})`
    }
  }

  if (itemType === 'fileChange') {
    const changes = Array.isArray(item.changes) ? item.changes.length : 0
    const status = typeof item.status === 'string' ? item.status : phase
    return {
      kind: 'status',
      title: 'File change',
      message: `${changes} file change${changes === 1 ? '' : 's'} (${status})`
    }
  }

  if (itemType === 'mcpToolCall') {
    const server = typeof item.server === 'string' ? item.server : 'mcp'
    const tool = typeof item.tool === 'string' ? item.tool : 'tool'
    const status = typeof item.status === 'string' ? item.status : phase
    return {
      kind: 'status',
      title: 'MCP tool',
      message: `${server}:${tool} (${status})`
    }
  }

  return null
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

async function hydrateConversationFromThreadRead(session: CodexSessionRuntime): Promise<void> {
  const result = await rpcRequest(session, 'thread/read', {
    threadId: session.threadId,
    includeTurns: true
  })
  const thread = getThreadFromConversationResponse(result)
  if (!thread) return
  replaceConversationFromThread(session, thread)
}

async function hydrateConversationFromThreadResume(session: CodexSessionRuntime): Promise<void> {
  const result = await rpcRequest(session, 'thread/resume', {
    threadId: session.threadId,
    persistExtendedHistory: false
  })
  const thread = getThreadFromConversationResponse(result)
  if (!thread) return
  replaceConversationFromThread(session, thread)
}

function getThreadFromConversationResponse(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>
  return typeof record.thread === 'object' && record.thread !== null
    ? record.thread as Record<string, unknown>
    : null
}

function replaceConversationFromThread(session: CodexSessionRuntime, thread: Record<string, unknown>): void {
  const threadId = typeof thread.id === 'string' ? thread.id : session.threadId
  session.threadId = threadId
  session.turns.clear()
  session.turnOrder = []

  const turns = Array.isArray(thread.turns) ? thread.turns : []
  const now = new Date().toISOString()
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') continue
    const record = turn as Record<string, unknown>
    const turnId = typeof record.id === 'string' ? record.id : null
    if (!turnId) continue

    const nextTurn = ensureConversationTurn(session, turnId)
    nextTurn.status = typeof record.status === 'string' ? record.status : 'completed'
    nextTurn.error = readTurnError(record.error)
    nextTurn.items = []

    const items = Array.isArray(record.items) ? record.items : []
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const itemRecord = item as Record<string, unknown>
      const itemType = typeof itemRecord.type === 'string' ? itemRecord.type : null
      if (itemType === 'userMessage') {
        nextTurn.items.push(normalizeUserMessageItem(threadId, turnId, itemRecord, now))
        continue
      }
      if (itemType === 'agentMessage') {
        nextTurn.items.push(normalizeAssistantMessageItem(threadId, turnId, itemRecord, now))
        continue
      }
      const normalized = normalizeConversationItemFromThreadItem(threadId, turnId, itemRecord, 'completed', now)
      if (normalized) {
        nextTurn.items.push(normalized)
      }
    }
  }

  touchConversation(session)
}

function readTurnError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return typeof record.message === 'string' ? record.message : null
}

function normalizeUserMessageItem(
  threadId: string,
  turnId: string,
  item: Record<string, unknown>,
  now: string
): CodexConversationItem {
  const itemId = typeof item.id === 'string' ? item.id : `user:${randomUUID()}`
  const text = extractTextFromUserContent(item.content)
  return {
    id: `${turnId}:${itemId}`,
    type: 'user_message',
    threadId,
    turnId,
    itemId,
    status: 'completed',
    createdAt: now,
    updatedAt: now,
    text
  }
}

function normalizeAssistantMessageItem(
  threadId: string,
  turnId: string,
  item: Record<string, unknown>,
  now: string
): CodexConversationItem {
  const itemId = typeof item.id === 'string' ? item.id : `assistant:${randomUUID()}`
  return {
    id: `${turnId}:${itemId}`,
    type: 'assistant_message',
    threadId,
    turnId,
    itemId,
    status: 'completed',
    createdAt: now,
    updatedAt: now,
    text: typeof item.text === 'string' ? item.text : '',
    phase: typeof item.phase === 'string' ? item.phase : null
  }
}

function extractTextFromUserContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const entry of content) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (typeof record.text === 'string') {
      parts.push(record.text)
      continue
    }
    if (typeof record.content === 'string') {
      parts.push(record.content)
    }
  }
  return parts.join('\n').trim()
}

function toConversationSnapshot(session: CodexSessionRuntime): CodexConversationSnapshot {
  return {
    threadId: session.threadId,
    revision: session.conversationRevision,
    turns: session.turnOrder
      .map((turnId) => session.turns.get(turnId))
      .filter((turn): turn is CodexConversationTurnRuntime => turn !== undefined)
      .map((turn): CodexConversationTurn => ({
        id: turn.id,
        status: turn.status,
        error: turn.error,
        items: [...turn.items]
      }))
  }
}

function buildConversationUpdate(session: CodexSessionRuntime): CodexConversationUpdate {
  return {
    worktreePath: session.worktreePath,
    status: toSessionStatus(session),
    snapshot: toConversationSnapshot(session),
    pendingActions: session.pendingActions.map((entry) => entry.action)
  }
}

function notifySessionChanged(session: CodexSessionRuntime): void {
  const listeners = conversationListeners.get(session.worktreePath)
  if (!listeners || listeners.size === 0) return

  const update = buildConversationUpdate(session)
  for (const listener of listeners) {
    try {
      listener(update)
    } catch {
      // Listener failures should not break the session runtime.
    }
  }
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
    | (
      Omit<CodexSessionEvent, 'id' | 'at' | 'worktreePath' | 'actor' | 'channel' | 'title'>
      & Partial<Pick<CodexSessionEvent, 'actor' | 'channel' | 'title'>>
    )
): CodexSessionEvent | null {
  const actor = event.actor ?? (event.kind === 'message' ? 'assistant' : 'system')
  const channel = event.channel ?? (event.kind === 'message' ? 'chat' : 'diagnostic')
  const title = event.title ?? null
  const turnId = event.turnId
  const itemId = event.itemId
  const phase = event.phase
  const previous = session.events[session.events.length - 1]
  if (
    previous
    && previous.turnId === turnId
    && previous.itemId === itemId
    && previous.phase === phase
    && previous.rawType === event.rawType
  ) {
    return null
  }

  const nextEvent: CodexSessionEvent = {
    id: session.nextEventId,
    at: new Date().toISOString(),
    worktreePath: session.worktreePath,
    turnId,
    itemId,
    phase,
    kind: event.kind,
    actor,
    channel,
    title,
    message: event.message,
    rawType: event.rawType
  }
  session.nextEventId += 1
  session.events.push(nextEvent)
  session.updatedAt = nextEvent.at

  if (session.events.length > MAX_SESSION_EVENTS) {
    session.events.splice(0, session.events.length - MAX_SESSION_EVENTS)
  }

  return nextEvent
}

function extractReadableMessage(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const keys = ['message', 'text', 'delta', 'reason', 'error']
  for (const key of keys) {
    if (typeof record[key] === 'string' && (record[key] as string).trim().length > 0) {
      const candidate = (record[key] as string).trim()
      if (!looksLikeOpaqueId(candidate)) {
        return candidate
      }
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === 'id' || key === 'threadId' || key === 'turnId' || key === 'uuid') continue
    const nested = extractReadableMessage(child)
    if (nested && !looksLikeOpaqueId(nested)) return nested
  }

  return null
}

function looksLikeOpaqueId(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 8) return false
  if (trimmed.includes(' ')) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) return true
  if (/^[A-Za-z0-9_-]{16,}$/.test(trimmed)) return true
  return false
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
