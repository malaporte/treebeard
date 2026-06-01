// Shared types used across bun and view processes

export type IdeId = 'vscode' | 'cursor' | 'intellij' | 'webstorm' | 'zed' | 'sublime'

export interface RepoConfig {
  id: string
  name: string
  path: string
  setupCommands?: string[]
}

export interface AppConfig {
  repositories: RepoConfig[]
  workspaces?: Workspace[]
  pollIntervalSec: number
  fetchIntervalSec: number
  autoUpdateEnabled: boolean
  updateCheckIntervalMin: number
  collapsedRepos: string[]
  defaultIde: IdeId
  jiraPanelOpen: boolean
  jiraPanelWidth: number
}

export interface Worktree {
  path: string
  branch: string
  head: string
  isMain: boolean
}

export interface JiraIssue {
  key: string
  summary: string
  status: string
  assignee: string | null
  issueType: string
  url: string
}

export interface PRInfo {
  number: number
  url: string
  title: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  ciStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | null
  ciFailed: number
  ciTotal: number
}

export interface WorktreeStatus {
  hasUncommittedChanges: boolean
  unpushedCommits: number
  unpulledCommits: number
  linesAdded: number
  linesDeleted: number
}

export interface SetupCommandResult {
  command: string
  success: boolean
  output: string
}

export interface DependencyCheck {
  name: 'gh' | 'jira'
  required: boolean
  installed: boolean
  authenticated: boolean | null
  version: string | null
  error: string | null
  authError: string | null
}

export interface DependencyStatus {
  checkedAt: string
  checks: DependencyCheck[]
}

export interface Workspace {
  id: string
  name: string
  slug: string
  repoIds: string[]
  setupCommands?: string[]
}

export interface WorkspaceWorktreeMember {
  repoId: string
  repoName: string
  path: string | null
  worktree: Worktree | null
}

export interface WorkspaceWorktree {
  workspaceId: string
  branch: string
  rootPath: string
  members: WorkspaceWorktreeMember[]
  isComplete: boolean
}

export interface WorkspaceWorktreeStatus {
  rollup: WorktreeStatus
  perRepo: { repoId: string; status: WorktreeStatus | null }[]
  dirtyRepoCount: number
}
