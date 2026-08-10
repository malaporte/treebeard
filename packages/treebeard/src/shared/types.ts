// Shared types used across bun and view processes

export type IdeId = 'vscode' | 'cursor' | 'intellij' | 'webstorm' | 'zed' | 'sublime'

export interface RepoConfig {
  id: string
  name: string
  path: string
  setupCommands?: string[]
}

export interface WorkspaceMember {
  repoId: string
  worktreePath: string
  linkPath: string
}

export interface Workspace {
  id: string
  name: string
  path: string
  members: WorkspaceMember[]
}

export interface AppConfig {
  repositories: RepoConfig[]
  workspaces: Workspace[]
  kiroCrewSessions: Record<string, string>
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
