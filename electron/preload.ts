import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, JiraIssue, PRInfo, Worktree, WorktreeStatus } from './types'

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
    set: (config: AppConfig): Promise<void> => ipcRenderer.invoke('config:set', config),
    getCollapsed: (): Promise<string[]> => ipcRenderer.invoke('config:getCollapsed'),
    setCollapsed: (ids: string[]): Promise<void> => ipcRenderer.invoke('config:setCollapsed', ids)
  },
  git: {
    worktrees: (repoPath: string): Promise<Worktree[]> =>
      ipcRenderer.invoke('git:worktrees', repoPath),
    defaultBranch: (repoPath: string): Promise<string> =>
      ipcRenderer.invoke('git:defaultBranch', repoPath),
    remoteBranches: (repoPath: string): Promise<string[]> =>
      ipcRenderer.invoke('git:remoteBranches', repoPath),
    addWorktree: (
      repoPath: string,
      repoName: string,
      branch: string,
      isNewBranch: boolean
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:addWorktree', repoPath, repoName, branch, isNewBranch),
    worktreeStatus: (worktreePath: string): Promise<WorktreeStatus> =>
      ipcRenderer.invoke('git:worktreeStatus', worktreePath),
    removeWorktree: (repoPath: string, worktreePath: string, force?: boolean): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:removeWorktree', repoPath, worktreePath, force)
  },
  jira: {
    issue: (issueKey: string): Promise<JiraIssue | null> =>
      ipcRenderer.invoke('jira:issue', issueKey)
  },
  gh: {
    pr: (repoPath: string, branch: string): Promise<PRInfo | null> =>
      ipcRenderer.invoke('gh:pr', repoPath, branch)
  },
  launch: {
    vscode: (worktreePath: string): Promise<void> =>
      ipcRenderer.invoke('launch:vscode', worktreePath),
    ghostty: (worktreePath: string): Promise<void> =>
      ipcRenderer.invoke('launch:ghostty', worktreePath),
    opencode: (worktreePath: string): Promise<void> =>
      ipcRenderer.invoke('launch:opencode', worktreePath)
  },
  system: {
    homedir: (): Promise<string> => ipcRenderer.invoke('system:homedir')
  },
  dialog: {
    openDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('dialog:openDirectory')
  }
}

export type TreebeardAPI = typeof api

contextBridge.exposeInMainWorld('treebeard', api)
