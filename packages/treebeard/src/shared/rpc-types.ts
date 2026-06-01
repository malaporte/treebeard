import type { RPCSchema } from 'electrobun/bun'
import type {
  AppConfig,
  DependencyStatus,
  IdeId,
  JiraIssue,
  PRInfo,
  SetupCommandResult,
  Worktree,
  WorkspaceWorktree,
  WorkspaceWorktreeStatus,
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
        response: { success: boolean; worktreePath?: string; error?: string }
      }
      'git:runSetup': {
        params: { worktreePath: string; commands: string[] }
        response: { results: SetupCommandResult[]; allSucceeded: boolean }
      }
      'git:worktreeStatus': {
        params: { worktreePath: string }
        response: WorktreeStatus
      }
      'git:fetchRepo': {
        params: { repoPath: string }
        response: void
      }
      'git:pull': {
        params: { worktreePath: string }
        response: { success: boolean; error?: string }
      }
      'git:removeWorktree': {
        params: { repoPath: string; worktreePath: string; force?: boolean }
        response: { success: boolean; error?: string }
      }
      'jira:issue': {
        params: { issueKey: string }
        response: JiraIssue | null
      }
      'jira:myIssues': {
        params: Record<string, never>
        response: JiraIssue[]
      }
      'gh:pr': {
        params: { repoPath: string; branch: string }
        response: PRInfo | null
      }
      'launch:ide': {
        params: { ideId: IdeId; worktreePath: string }
        response: void
      }
      'launch:ghostty': {
        params: { worktreePath: string }
        response: void
      }
      'launch:pippinShell': {
        params: { worktreePath: string }
        response: void
      }
      'launch:opencode': {
        params: { worktreePath: string }
        response: void
      }
      'launch:url': {
        params: { url: string }
        response: { success: boolean; error?: string }
      }
      'system:homedir': {
        params: Record<string, never>
        response: string
      }
      'system:opencodePath': {
        params: Record<string, never>
        response: string | null
      }
      'system:pippinPath': {
        params: Record<string, never>
        response: string | null
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
      'workspace:list': {
        params: { workspaceId: string }
        response: WorkspaceWorktree[]
      }
      'workspace:addWorktree': {
        params: { workspaceId: string; branch: string; isNewBranch: boolean }
        response: { success: boolean; perRepo: { repoId: string; success: boolean; error?: string }[]; workspacePath?: string }
      }
      'workspace:removeWorktree': {
        params: { workspaceId: string; branch: string; force?: boolean }
        response: { success: boolean; perRepo: { repoId: string; success: boolean; error?: string }[] }
      }
      'workspace:status': {
        params: { workspaceId: string; branch: string }
        response: WorkspaceWorktreeStatus
      }
      'workspace:fetch': {
        params: { workspaceId: string }
        response: void
      }
      'workspace:pull': {
        params: { workspaceId: string; branch: string }
        response: { perRepo: { repoId: string; success: boolean; error?: string }[] }
      }
      'workspace:remoteBranches': {
        params: { workspaceId: string }
        response: string[]
      }
      'workspace:repair': {
        params: { workspaceId: string; branch: string }
        response: { success: boolean; perRepo: { repoId: string; success: boolean; error?: string }[] }
      }
      'launch:workspaceIde': {
        params: { ideId: IdeId; workspacePath: string }
        response: void
      }
      'launch:workspaceGhostty': {
        params: { workspacePath: string; title: string }
        response: void
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
