// Shared types used across bun and view processes

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

