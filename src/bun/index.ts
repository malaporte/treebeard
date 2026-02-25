import { BrowserWindow, BrowserView, Utils, ApplicationMenu, Updater } from 'electrobun/bun'
import os from 'node:os'
import { getConfig, setConfig, getCollapsedRepos, setCollapsedRepos } from './services/config'
import { checkDependencies } from './services/dependencies'
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
import type { AppConfig, DependencyStatus } from '../shared/types'

const MIN_UPDATE_CHECK_INTERVAL_MIN = 5
const MAX_UPDATE_CHECK_INTERVAL_MIN = 1440
const STARTUP_UPDATE_CHECK_DELAY_MS = 15000

let autoUpdateInterval: ReturnType<typeof setInterval> | null = null
let isUpdateCheckInFlight = false
let isUpdatePromptOpen = false
let dependencyStatus: DependencyStatus | null = null
let dependencyCheckInFlight: Promise<DependencyStatus> | null = null

interface UpdateCheckResult {
  success: boolean
  updateAvailable: boolean
  error?: string
}

function normalizeUpdateIntervalMin(intervalMin: number): number {
  return Math.min(Math.max(Math.round(intervalMin), MIN_UPDATE_CHECK_INTERVAL_MIN), MAX_UPDATE_CHECK_INTERVAL_MIN)
}

function autoUpdateEnabled(config: AppConfig): boolean {
  return config.autoUpdateEnabled
}

function configureAutoUpdateSchedule(config: AppConfig): void {
  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval)
    autoUpdateInterval = null
  }

  if (!autoUpdateEnabled(config)) return

  const intervalMin = normalizeUpdateIntervalMin(config.updateCheckIntervalMin)
  autoUpdateInterval = setInterval(() => {
    void checkForAppUpdate()
  }, intervalMin * 60_000)
}

async function promptToRestartForUpdate(): Promise<void> {
  if (isUpdatePromptOpen) return

  isUpdatePromptOpen = true
  try {
    const { response } = await Utils.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: 'A new version of Treebeard is ready to install.',
      detail: 'Restart now to apply the update.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1
    })

    if (response === 0) {
      await Updater.applyUpdate()
    }
  } finally {
    isUpdatePromptOpen = false
  }
}

async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (isUpdateCheckInFlight) {
    return { success: true, updateAvailable: false }
  }

  isUpdateCheckInFlight = true
  try {
    const info = await Updater.checkForUpdate()

    if (!info.updateAvailable) {
      return { success: true, updateAvailable: false }
    }

    await Updater.downloadUpdate()
    const postDownloadInfo = Updater.updateInfo()

    if (!postDownloadInfo?.updateReady) {
      return {
        success: false,
        updateAvailable: true,
        error: postDownloadInfo?.error || 'Update download failed'
      }
    }

    await promptToRestartForUpdate()
    return { success: true, updateAvailable: true }
  } catch {
    return { success: false, updateAvailable: false, error: 'Failed to check for updates' }
  } finally {
    isUpdateCheckInFlight = false
  }
}

function startAutoUpdateScheduler(): void {
  const config = getConfig()
  configureAutoUpdateSchedule(config)

  setTimeout(() => {
    if (!autoUpdateEnabled(getConfig())) return
    void checkForAppUpdate()
  }, STARTUP_UPDATE_CHECK_DELAY_MS)
}

async function getDependencyStatus(forceRefresh = false): Promise<DependencyStatus> {
  if (!forceRefresh && dependencyStatus) return dependencyStatus

  if (!dependencyCheckInFlight) {
    dependencyCheckInFlight = checkDependencies()
      .then((status) => {
        dependencyStatus = status
        return status
      })
      .finally(() => {
        dependencyCheckInFlight = null
      })
  }

  return dependencyCheckInFlight
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
        configureAutoUpdateSchedule(getConfig())
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
      },
      'system:dependencies': async ({ refresh }) => {
        return getDependencyStatus(Boolean(refresh))
      },
      'app:quit': () => {
        Utils.quit()
      },
      'app:closeWindow': () => {
        win.close()
      },
      'app:checkForUpdates': async () => {
        return checkForAppUpdate()
      }
    },
    messages: {}
  }
})

// --- Application Menu ---

ApplicationMenu.setApplicationMenu([
  {
    label: 'Treebeard',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'showAll' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { role: 'close' },
    ],
  },
])

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

startAutoUpdateScheduler()
void getDependencyStatus()
