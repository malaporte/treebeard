import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { getConfig, setConfig, getCollapsedRepos, setCollapsedRepos } from './services/config'
import { getWorktrees, getGitHubRepo, extractJiraKey, getDefaultBranch, addWorktree, buildWorktreePath, getRemoteBranches, getWorktreeStatus, removeWorktree } from './services/git'
import { getJiraIssue } from './services/jira'
import { getPRForBranch } from './services/github'
import { launchVSCode, launchGhostty, launchOpenCode } from './services/launcher'
import type { AppConfig } from './types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Treebeard',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// --- IPC Handlers ---

// Config
ipcMain.handle('config:get', () => {
  return getConfig()
})

ipcMain.handle('config:set', (_event, config: AppConfig) => {
  setConfig(config)
})

ipcMain.handle('config:getCollapsed', () => {
  return getCollapsedRepos()
})

ipcMain.handle('config:setCollapsed', (_event, ids: string[]) => {
  setCollapsedRepos(ids)
})

// Git worktrees
ipcMain.handle('git:worktrees', async (_event, repoPath: string) => {
  return getWorktrees(repoPath)
})

ipcMain.handle('git:defaultBranch', async (_event, repoPath: string) => {
  return getDefaultBranch(repoPath)
})

ipcMain.handle('git:remoteBranches', async (_event, repoPath: string) => {
  return getRemoteBranches(repoPath)
})

ipcMain.handle(
  'git:addWorktree',
  async (
    _event,
    repoPath: string,
    repoName: string,
    branch: string,
    isNewBranch: boolean
  ) => {
    const baseBranch = isNewBranch ? await getDefaultBranch(repoPath) : undefined
    const worktreePath = buildWorktreePath(repoName, branch)
    return addWorktree(repoPath, branch, worktreePath, isNewBranch, baseBranch)
  }
)

// Git worktree status & removal

ipcMain.handle('git:worktreeStatus', async (_event, worktreePath: string) => {
  return getWorktreeStatus(worktreePath)
})

ipcMain.handle('git:removeWorktree', async (_event, repoPath: string, worktreePath: string, force?: boolean) => {
  return removeWorktree(repoPath, worktreePath, force)
})

// JIRA issue
ipcMain.handle('jira:issue', async (_event, issueKey: string) => {
  return getJiraIssue(issueKey)
})

// GitHub PR — auto-detects the GitHub remote for the given repo
ipcMain.handle('gh:pr', async (_event, repoPath: string, branch: string) => {
  const ghRepo = await getGitHubRepo(repoPath)
  if (!ghRepo) return null
  return getPRForBranch(repoPath, branch, ghRepo)
})

// Launchers
ipcMain.handle('launch:vscode', async (_event, worktreePath: string) => {
  await launchVSCode(worktreePath)
})

ipcMain.handle('launch:ghostty', (_event, worktreePath: string) => {
  launchGhostty(worktreePath)
})

ipcMain.handle('launch:opencode', (_event, worktreePath: string) => {
  launchOpenCode(worktreePath)
})

// System
ipcMain.handle('system:homedir', () => {
  return os.homedir()
})

// Dialog
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Git Repository'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// --- App lifecycle ---

app.whenReady().then(() => {
  // Set dock icon — resolve from project root in dev, resources dir in production
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  if (!icon.isEmpty() && app.dock) {
    app.dock.setIcon(icon)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Re-export for type inference in renderer
export { extractJiraKey }
