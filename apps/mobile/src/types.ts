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

export interface CodexSessionEvent {
  id: number
  at: string
  worktreePath: string
  kind: 'status' | 'message' | 'reasoning' | 'command' | 'error'
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
