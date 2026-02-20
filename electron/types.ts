// Shared types used by both main and renderer processes

export interface RepoConfig {
  id: string
  name: string
  path: string
}

export interface AppConfig {
  repositories: RepoConfig[]
  pollIntervalSec: number
  collapsedRepos: string[]
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

export interface WorktreeInfo extends Worktree {
  jiraKey: string | null
  jira: JiraIssue | null
  pr: PRInfo | null
}

// IPC channel names
export const IPC = {
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_GET_COLLAPSED: 'config:getCollapsed',
  CONFIG_SET_COLLAPSED: 'config:setCollapsed',
  GIT_WORKTREES: 'git:worktrees',
  GIT_DEFAULT_BRANCH: 'git:defaultBranch',
  GIT_ADD_WORKTREE: 'git:addWorktree',
  GIT_WORKTREE_STATUS: 'git:worktreeStatus',
  GIT_REMOVE_WORKTREE: 'git:removeWorktree',
  JIRA_ISSUE: 'jira:issue',
  GH_PR: 'gh:pr',
  LAUNCH_VSCODE: 'launch:vscode',
  LAUNCH_GHOSTTY: 'launch:ghostty',
  LAUNCH_OPENCODE: 'launch:opencode',
  SYSTEM_HOMEDIR: 'system:homedir'
} as const
