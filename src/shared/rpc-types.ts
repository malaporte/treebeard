import type { RPCSchema } from 'electrobun/bun'
import type {
  AppConfig,
  DependencyStatus,
  JiraIssue,
  MobileBridgeStatus,
  MobilePairingInfo,
  MobileProxyTraceEntry,
  OpencodeSyncStatus,
  OpencodeServerStatus,
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
      'opencode:getStatus': {
        params: Record<string, never>
        response: OpencodeServerStatus
      }
      'opencode:setEnabled': {
        params: { enabled: boolean }
        response: OpencodeServerStatus
      }
      'opencode:openProxyUI': {
        params: { worktreePath: string }
        response: { success: boolean; error?: string }
      }
      'opencode:getSync': {
        params: Record<string, never>
        response: OpencodeSyncStatus
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
    }
  }>
}
