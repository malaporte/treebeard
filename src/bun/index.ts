import { BrowserWindow, BrowserView, Utils } from 'electrobun/bun'
import Electrobun from 'electrobun/bun'
import os from 'node:os'
import { getConfig, setConfig, getCollapsedRepos, setCollapsedRepos } from './services/config'
import {
  getWorktrees,
  getGitHubRepo,
  getDefaultBranch,
  addWorktree,
  buildWorktreePath,
  getRemoteBranches,
  getWorktreeStatus,
  removeWorktree
} from './services/git'
import { getJiraIssue } from './services/jira'
import { getPRForBranch } from './services/github'
import { launchVSCode, launchGhostty } from './services/launcher'
import type { TreebeardRPC } from '../shared/rpc-types'
import type { AppConfig } from '../shared/types'

// --- RPC Handlers ---

const mainviewRPC = BrowserView.defineRPC<TreebeardRPC>({
  maxRequestTime: 30000,
  handlers: {
    requests: {
      'config:get': () => {
        return getConfig()
      },
      'config:set': ({ config }) => {
        setConfig(config)
      },
      'config:getCollapsed': () => {
        return getCollapsedRepos()
      },
      'config:setCollapsed': ({ ids }) => {
        setCollapsedRepos(ids)
      },
      'git:worktrees': async ({ repoPath }) => {
        return getWorktrees(repoPath)
      },
      'git:defaultBranch': async ({ repoPath }) => {
        return getDefaultBranch(repoPath)
      },
      'git:remoteBranches': async ({ repoPath }) => {
        return getRemoteBranches(repoPath)
      },
      'git:addWorktree': async ({ repoPath, repoName, branch, isNewBranch }) => {
        const baseBranch = isNewBranch ? await getDefaultBranch(repoPath) : undefined
        const worktreePath = buildWorktreePath(repoName, branch)
        return addWorktree(repoPath, branch, worktreePath, isNewBranch, baseBranch)
      },
      'git:worktreeStatus': async ({ worktreePath }) => {
        return getWorktreeStatus(worktreePath)
      },
      'git:removeWorktree': async ({ repoPath, worktreePath, force }) => {
        return removeWorktree(repoPath, worktreePath, force)
      },
      'jira:issue': async ({ issueKey }) => {
        return getJiraIssue(issueKey)
      },
      'gh:pr': async ({ repoPath, branch }) => {
        const ghRepo = await getGitHubRepo(repoPath)
        if (!ghRepo) return null
        return getPRForBranch(repoPath, branch, ghRepo)
      },
      'launch:vscode': async ({ worktreePath }) => {
        await launchVSCode(worktreePath)
      },
      'launch:ghostty': ({ worktreePath }) => {
        launchGhostty(worktreePath)
      },
      'launch:opencode': ({ worktreePath }) => {
        // Deferred: terminal/opencode integration requires PTY support
        // For now, launch in Ghostty as a fallback
        launchGhostty(worktreePath)
      },
      'system:homedir': () => {
        return os.homedir()
      },
      'dialog:openDirectory': async () => {
        const paths = await Utils.openFileDialog({
          startingFolder: os.homedir(),
          allowedFileTypes: '*',
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false
        })
        if (!paths || paths.length === 0) return null
        return paths[0]
      }
    },
    messages: {}
  }
})

// --- Window ---

const win = new BrowserWindow({
  title: 'Treebeard',
  url: 'views://mainview/index.html',
  titleBarStyle: 'hiddenInset',
  frame: {
    width: 1200,
    height: 800,
    x: 200,
    y: 200
  },
  rpc: mainviewRPC
})
