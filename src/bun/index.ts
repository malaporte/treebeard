import { BrowserWindow, BrowserView, Utils, ApplicationMenu, Updater } from 'electrobun/bun'
import Electrobun from 'electrobun/bun'
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
import { launchVSCode, launchGhostty, launchURL } from './services/launcher'
import {
  forceStopAllServers,
  getServerSync,
  getServerStatus,
  setServerEnabled,
  stopAllServers,
  restoreEnabledServer
} from './services/opencode'
import {
  clearMobileProxyTrace,
  createMobilePairingToken,
  createLocalOpencodeWebUrl,
  getMobileProxyTrace,
  getMobileBridgeStatus,
  rotateMobileBridgePairingCodeStatus,
  setMobileBridgeEnabledState,
  stopMobileBridge,
  syncMobileBridgeFromConfig
} from './services/mobile-api'
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
let shutdownInFlight: Promise<void> | null = null

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

async function gracefulShutdown(quitAfterCleanup: boolean): Promise<void> {
  if (shutdownInFlight) {
    await shutdownInFlight
    return
  }

  shutdownInFlight = (async () => {
    stopMobileBridge()
    await stopAllServers()
    if (quitAfterCleanup) {
      Utils.quit()
    }
  })()

  await shutdownInFlight
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
        void syncMobileBridgeFromConfig()
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
      'launch:url': async ({ url }) => {
        // Prefer Electrobun's native FFI — Bun.spawn('/usr/bin/open') is
        // silently blocked in the Electrobun process sandbox.
        if (Utils.openExternal(url)) {
          return { success: true }
        }
        try {
          await launchURL(url)
          return { success: true }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err)
          }
        }
      },
      'opencode:getStatus': () => {
        return getServerStatus()
      },
      'opencode:setEnabled': async ({ enabled }) => {
        return setServerEnabled(enabled)
      },
      'opencode:openProxyUI': async ({ worktreePath }) => {
        try {
          let status = getServerStatus()
          if (!status.running) {
            status = await setServerEnabled(true)
          }

          if (!status.url) {
            return {
              success: false,
              error: status.error || 'OpenCode server did not report a URL'
            }
          }

          const bridge = await setMobileBridgeEnabledState(true)
          if (!bridge.running) {
            return {
              success: false,
              error: 'Mobile bridge failed to start'
            }
          }

          const session = await createLocalOpencodeWebUrl(worktreePath)
          return { success: true, url: session.webUrl }
        } catch (err) {
          const status = getServerStatus()
          if (status.url) {
            const direct = new URL(status.url)
            direct.pathname = `/${Buffer.from(worktreePath, 'utf8').toString('base64url')}/session`
            return { success: true, url: direct.toString() }
          }

          return {
            success: false,
            error: err instanceof Error ? err.message : String(err)
          }
        }
      },
      'opencode:getSync': async () => {
        const config = getConfig()
        const paths = await Promise.all(
          config.repositories.map(async (repo) => {
            try {
              const worktrees = await getWorktrees(repo.path)
              return worktrees.map((worktree) => worktree.path)
            } catch {
              return []
            }
          })
        )
        return getServerSync(paths.flat())
      },
      'mobile:getStatus': () => {
        return getMobileBridgeStatus()
      },
      'mobile:setEnabled': async ({ enabled }) => {
        return setMobileBridgeEnabledState(enabled)
      },
      'mobile:rotatePairingCode': () => {
        return rotateMobileBridgePairingCodeStatus()
      },
      'mobile:createPairingToken': () => {
        return createMobilePairingToken()
      },
      'mobile:getProxyTrace': () => {
        return getMobileProxyTrace()
      },
      'mobile:clearProxyTrace': () => {
        clearMobileProxyTrace()
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
        return gracefulShutdown(true)
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

function openSettingsFromMenu() {
  try {
    win.focus()
    const webviewRpc = win.webview.rpc
    if (!webviewRpc) return
    webviewRpc.send['ui:openSettings']()
  } catch {
    // Window may not be fully ready yet
  }
}

// --- Application Menu ---

ApplicationMenu.setApplicationMenu([
  {
    label: 'Treebeard',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { label: 'Settings...', action: 'open-settings', accelerator: 'CmdOrCtrl+,' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'showAll' },
      { type: 'separator' },
      { label: 'Quit Treebeard', action: 'quit-treebeard', accelerator: 'CmdOrCtrl+Q' },
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

ApplicationMenu.on('application-menu-clicked', (event) => {
  const payload = event as { action?: string; data?: { action?: string } }
  const action = payload.data?.action ?? payload.action
  if (action === 'open-settings') {
    openSettingsFromMenu()
    return
  }

  if (action === 'quit-treebeard') {
    void gracefulShutdown(true)
  }
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

// Open window.open() / target="_blank" links in the system browser
Electrobun.events.on(`new-window-open-${win.webview.id}`, (event: { data?: { detail?: string | { url?: string } } }) => {
  const detail = event.data?.detail
  const url = typeof detail === 'string' ? detail : detail?.url
  if (url) {
    Utils.openExternal(url)
  }
})

startAutoUpdateScheduler()
void getDependencyStatus()
void restoreEnabledServer()
void syncMobileBridgeFromConfig()

// --- Shutdown Cleanup ---

function handleShutdown() {
  void gracefulShutdown(false)
}

process.on('SIGINT', handleShutdown)
process.on('SIGTERM', handleShutdown)
process.on('exit', () => {
  forceStopAllServers()
  stopMobileBridge()
})
