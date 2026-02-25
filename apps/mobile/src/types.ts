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

export interface WorktreesResponse {
  worktrees: MobileWorktree[]
  generatedAt: string
}
