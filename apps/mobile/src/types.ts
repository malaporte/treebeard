export interface MobileBridgeStatus {
  enabled: boolean
  running: boolean
  host: string
  port: number
  pairingCode: string
  urls: string[]
}

export interface Worktree {
  path: string
  branch: string
  head: string
  isMain: boolean
}

export interface RepoConfig {
  id: string
  name: string
  path: string
}

export interface CodexRuntimeStatus {
  enabled: boolean
  running: boolean
  pid: number | null
  error: string | null
}

export interface MobileWorktree {
  repo: RepoConfig
  worktree: Worktree
}

export interface WorktreesResponse {
  worktrees: MobileWorktree[]
  codex: CodexRuntimeStatus
  homedir?: string
  generatedAt: string
}

export interface CodexSessionStatus {
  worktreePath: string
  threadId: string
  running: boolean
  startedAt: string
  updatedAt: string
  lastEventId: number
  error: string | null
}

export type CodexConversationItemStatus = 'streaming' | 'completed' | 'pending'

export interface CodexConversationItemBase {
  id: string
  threadId: string
  turnId: string
  itemId: string
  status: CodexConversationItemStatus
  createdAt: string
  updatedAt: string
}

export interface CodexUserMessageItem extends CodexConversationItemBase {
  type: 'user_message'
  text: string
}

export interface CodexAssistantMessageItem extends CodexConversationItemBase {
  type: 'assistant_message'
  text: string
  phase: string | null
}

export interface CodexReasoningItem extends CodexConversationItemBase {
  type: 'reasoning'
  summary: string[]
  content: string[]
}

export interface CodexPlanItem extends CodexConversationItemBase {
  type: 'plan'
  text: string
}

export interface CodexCommandExecutionItem extends CodexConversationItemBase {
  type: 'command_execution'
  command: string
  cwd: string
  processId: string | null
  executionStatus: string
  output: string | null
  exitCode: number | null
  durationMs: number | null
}

export interface CodexFileChangeItem extends CodexConversationItemBase {
  type: 'file_change'
  changeCount: number
  patchStatus: string
}

export interface CodexMcpToolCallItem extends CodexConversationItemBase {
  type: 'mcp_tool_call'
  server: string
  tool: string
  toolStatus: string
  resultSummary: string | null
  errorSummary: string | null
  durationMs: number | null
}

export interface CodexStatusItem extends CodexConversationItemBase {
  type: 'status'
  title: string
  text: string
}

export type CodexConversationItem =
  | CodexUserMessageItem
  | CodexAssistantMessageItem
  | CodexReasoningItem
  | CodexPlanItem
  | CodexCommandExecutionItem
  | CodexFileChangeItem
  | CodexMcpToolCallItem
  | CodexStatusItem

export interface CodexConversationTurn {
  id: string
  status: string
  error: string | null
  items: CodexConversationItem[]
}

export interface CodexConversationSnapshot {
  threadId: string
  revision: number
  turns: CodexConversationTurn[]
}

export interface CodexConversationUpdate {
  worktreePath: string
  status: CodexSessionStatus
  snapshot: CodexConversationSnapshot
  pendingActions: CodexPendingAction[]
}

export interface CodexSessionEvent {
  id: number
  at: string
  worktreePath: string
  turnId?: string
  itemId?: string
  phase?: 'streaming' | 'completed'
  kind: 'status' | 'message' | 'reasoning' | 'command' | 'error'
  actor: 'user' | 'assistant' | 'system'
  channel: 'chat' | 'diagnostic'
  title: string | null
  message: string
  rawType: string | null
}

export interface CodexPendingAction {
  id: string
  worktreePath: string
  kind: 'approval' | 'user_input'
  prompt: string
  options: string[]
}
