import type { RPCSchema } from 'electrobun/bun'
import type {
  AppConfig,
  CodexConversationUpdate,
  CodexConversationSnapshot,
  CodexPendingAction,
  CodexRuntimeStatus,
  CodexSessionEvent,
  CodexSessionStatus,
  DependencyStatus,
  JiraIssue,
  MobileBridgeStatus,
  MobilePairingInfo,
  MobileProxyTraceEntry,
  PRInfo,
  Worktree,
  WorktreeStatus
} from './types'

export type TreebeardRPC = {
  bun: RPCSchema<{
    requests: {
      'config:get': {
        params: Record<string, never>
        response: AppConfig
      }
      'config:set': {
        params: { config: AppConfig }
        response: void
      }
      'config:getCollapsed': {
        params: Record<string, never>
        response: string[]
      }
      'config:setCollapsed': {
        params: { ids: string[] }
        response: void
      }
      'git:worktrees': {
        params: { repoPath: string }
        response: Worktree[]
      }
      'git:defaultBranch': {
        params: { repoPath: string }
        response: string
      }
      'git:remoteBranches': {
        params: { repoPath: string }
        response: string[]
      }
      'git:addWorktree': {
        params: {
          repoPath: string
          repoName: string
          branch: string
          isNewBranch: boolean
        }
        response: { success: boolean; error?: string }
      }
      'git:worktreeStatus': {
        params: { worktreePath: string }
        response: WorktreeStatus
      }
      'git:removeWorktree': {
        params: { repoPath: string; worktreePath: string; force?: boolean }
        response: { success: boolean; error?: string }
      }
      'jira:issue': {
        params: { issueKey: string }
        response: JiraIssue | null
      }
      'gh:pr': {
        params: { repoPath: string; branch: string }
        response: PRInfo | null
      }
      'launch:vscode': {
        params: { worktreePath: string }
        response: void
      }
      'launch:ghostty': {
        params: { worktreePath: string }
        response: void
      }
      'launch:url': {
        params: { url: string }
        response: { success: boolean; error?: string }
      }
      'codex:getStatus': {
        params: Record<string, never>
        response: CodexRuntimeStatus
      }
      'codex:setEnabled': {
        params: { enabled: boolean }
        response: CodexRuntimeStatus
      }
      'codex:startSession': {
        params: { worktreePath: string; prompt: string }
        response: { success: boolean; error?: string; status?: CodexSessionStatus }
      }
      'codex:interruptSession': {
        params: { worktreePath: string }
        response: { success: boolean; error?: string; status?: CodexSessionStatus }
      }
      'codex:steerSession': {
        params: { worktreePath: string; prompt: string }
        response: { success: boolean; error?: string; status?: CodexSessionStatus }
      }
      'codex:getSessionStatus': {
        params: { worktreePath: string }
        response: { success: boolean; error?: string; status?: CodexSessionStatus }
      }
      'codex:getSessionEvents': {
        params: { worktreePath: string; cursor: number }
        response: { success: boolean; error?: string; events: CodexSessionEvent[]; nextCursor: number }
      }
      'codex:getConversation': {
        params: { worktreePath: string }
        response: { success: boolean; error?: string; status?: CodexSessionStatus; snapshot?: CodexConversationSnapshot }
      }
      'codex:resumeConversation': {
        params: { worktreePath: string }
        response: { success: boolean; error?: string; status?: CodexSessionStatus; snapshot?: CodexConversationSnapshot }
      }
      'codex:getPendingActions': {
        params: { worktreePath: string }
        response: { success: boolean; error?: string; actions: CodexPendingAction[] }
      }
      'codex:respondPendingAction': {
        params: { worktreePath: string; actionId: string; response: string }
        response: { success: boolean; error?: string }
      }
      'mobile:getStatus': {
        params: Record<string, never>
        response: MobileBridgeStatus
      }
      'mobile:setEnabled': {
        params: { enabled: boolean }
        response: MobileBridgeStatus
      }
      'mobile:rotatePairingCode': {
        params: Record<string, never>
        response: MobileBridgeStatus
      }
      'mobile:createPairingToken': {
        params: Record<string, never>
        response: MobilePairingInfo
      }
      'mobile:getProxyTrace': {
        params: Record<string, never>
        response: MobileProxyTraceEntry[]
      }
      'mobile:clearProxyTrace': {
        params: Record<string, never>
        response: void
      }
      'system:homedir': {
        params: Record<string, never>
        response: string
      }
      'dialog:openDirectory': {
        params: Record<string, never>
        response: string | null
      }
      'system:dependencies': {
        params: { refresh?: boolean }
        response: DependencyStatus
      }
      'app:quit': {
        params: Record<string, never>
        response: void
      }
      'app:closeWindow': {
        params: Record<string, never>
        response: void
      }
      'app:checkForUpdates': {
        params: Record<string, never>
        response: { success: boolean; updateAvailable: boolean; error?: string }
      }
    }
    messages: Record<string, never>
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: {
      'ui:openSettings': void
      'codex:conversationUpdate': CodexConversationUpdate
    }
  }>
}
