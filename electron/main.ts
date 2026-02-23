import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { getConfig, setConfig, getCollapsedRepos, setCollapsedRepos } from './services/config'
import { getWorktrees, getGitHubRepo, extractJiraKey, getDefaultBranch, addWorktree, buildWorktreePath, getRemoteBranches, getWorktreeStatus, removeWorktree } from './services/git'
import { getJiraIssue } from './services/jira'
import { getPRForBranch } from './services/github'
import { launchVSCode, launchGhostty } from './services/launcher'
import { createPty, writePty, resizePty, closePty } from './services/pty'
import type { AppConfig } from './types'

let mainWindow: BrowserWindow | null = null

// Track open terminal windows by worktree path so we focus instead of duplicating
const terminalWindows = new Map<string, BrowserWindow>()

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
  // Reuse an existing window for this worktree path rather than opening a duplicate
  const existing = terminalWindows.get(worktreePath)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }

  const worktreeName = path.basename(worktreePath)
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 400,
    minHeight: 300,
    title: `opencode — ${worktreeName}`,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  terminalWindows.set(worktreePath, win)
  win.on('closed', () => terminalWindows.delete(worktreePath))

  const query = `?worktreePath=${encodeURIComponent(worktreePath)}`
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/terminal.html${query}`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/terminal.html'), { search: query })
  }
})

// PTY — used by the embedded OpenCode panel
ipcMain.handle('pty:create', (event, worktreePath: string, cols: number, rows: number) => {
  return createPty(worktreePath, cols, rows, event.sender)
})

ipcMain.handle('pty:write', (_event, id: string, data: string) => {
  writePty(id, data)
})

ipcMain.handle('pty:resize', (_event, id: string, cols: number, rows: number) => {
  resizePty(id, cols, rows)
})

ipcMain.handle('pty:close', (_event, id: string) => {
  closePty(id)
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
