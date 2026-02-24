import { BrowserWindow, BrowserView, Utils } from 'electrobun/bun'
import Electrobun from 'electrobun/bun'
import path from 'node:path'
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
import { createPtySession, writePty, resizePty, closePty, closeAllPty, hasPtySession } from './services/pty'
import type { TreebeardRPC } from '../shared/rpc-types'
import type { TerminalRPC } from '../shared/terminal-rpc-types'
import type { AppConfig } from '../shared/types'

// --- Terminal Window Management ---

// Keyed by worktree path to prevent duplicate terminal windows
const terminalWindows = new Map<string, { windowId: number; sessionId: string }>()

let sessionCounter = 0

function openTerminalWindow(worktreePath: string): void {
  const existing = terminalWindows.get(worktreePath)
  if (existing) {
    const win = BrowserWindow.getById(existing.windowId)
    if (win) {
      win.focus()
      return
    }
    // Window was closed externally, clean up stale entry
    terminalWindows.delete(worktreePath)
  }

  const sessionId = `pty-${++sessionCounter}`
  const worktreeName = path.basename(worktreePath)

  const terminalRPC = BrowserView.defineRPC<TerminalRPC>({
    maxRequestTime: 10000,
    handlers: {
      requests: {
        'pty:write': ({ data }) => {
          writePty(sessionId, data)
        },
        'pty:resize': ({ cols, rows }) => {
          // First resize triggers PTY spawn with the actual terminal dimensions
          if (!hasPtySession(sessionId)) {
            createPtySession(
              sessionId,
              worktreePath,
              cols,
              rows,
              (data) => {
                terminalRPC.sendProxy['pty:data']({ payload: { data } })
              },
              (exitCode) => {
                terminalRPC.sendProxy['pty:exit']({ payload: { exitCode } })
                termWin.close()
              }
            )
            terminalRPC.sendProxy['pty:ready']({ payload: { worktreeName } })
            return
          }
          resizePty(sessionId, cols, rows)
        },
        'pty:close': () => {
          closePty(sessionId)
        }
      },
      messages: {}
    }
  })

  const termWin = new BrowserWindow({
    title: `Terminal — ${worktreeName}`,
    url: 'views://terminal/index.html',
    titleBarStyle: 'hiddenInset',
    frame: {
      width: 900,
      height: 600,
      x: 300,
      y: 250
    },
    rpc: terminalRPC
  })

  terminalWindows.set(worktreePath, { windowId: termWin.id, sessionId })

  termWin.on('close', () => {
    closePty(sessionId)
    terminalWindows.delete(worktreePath)
  })
}

// --- Main RPC Handlers ---

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
        openTerminalWindow(worktreePath)
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

// --- Cleanup ---

Electrobun.events.on('before-quit', () => {
  closeAllPty()
})

// --- Main Window ---

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
