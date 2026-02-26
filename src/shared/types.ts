// Shared types used across bun and view processes

export interface RepoConfig {
  id: string
  name: string
  path: string
}

export interface AppConfig {
  repositories: RepoConfig[]
  pollIntervalSec: number
  autoUpdateEnabled: boolean
  updateCheckIntervalMin: number
  collapsedRepos: string[]
  opencodeServers: Record<string, boolean>
  mobileBridge: MobileBridgeConfig
}

export interface MobileBridgeConfig {
  enabled: boolean
  host: string
  port: number
  pairingCode: string
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

export interface OpencodeServerStatus {
  enabled: boolean
  running: boolean
  url: string | null
  pid: number | null
  error: string | null
}

export interface MobileWorktree {
  repo: RepoConfig
  worktree: Worktree
  opencode: OpencodeServerStatus
}

export interface MobileBridgeStatus {
  enabled: boolean
  running: boolean
  host: string
  port: number
  pairingCode: string
  urls: string[]
}

export interface MobilePairingInfo {
  token: string
  expiresAt: string
  bridgeUrl: string
  deepLink: string
}

export interface DependencyCheck {
  name: 'gh' | 'jira' | 'opencode'
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
