import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  attachWorkspaceWorktree,
  createWorkspace,
  removeWorkspace,
  removeWorkspaceMember,
  updateWorkspaceWorktreePath
} from './workspaces'
import type { AppConfig } from '../../shared/types'

const { getConfig, setConfig } = vi.hoisted(() => ({
  getConfig: vi.fn(),
  setConfig: vi.fn()
}))
const { getWorktrees } = vi.hoisted(() => ({
  getWorktrees: vi.fn()
}))
const { existsSync, lstatSync, mkdirSync, rmdirSync, symlinkSync, unlinkSync } = vi.hoisted(() => ({
  existsSync: vi.fn(),
  lstatSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmdirSync: vi.fn(),
  symlinkSync: vi.fn(),
  unlinkSync: vi.fn()
}))

vi.mock('node:os', () => ({ default: { homedir: () => '/Users/test' } }))
vi.mock('node:fs', () => ({ default: { existsSync, lstatSync, mkdirSync, rmdirSync, symlinkSync, unlinkSync } }))
vi.mock('./config', () => ({ getConfig, setConfig }))
vi.mock('./git', () => ({ getWorktrees }))

function createConfig(): AppConfig {
  return {
    repositories: [{ id: 'repo-1', name: 'Treebeard App', path: '/repos/treebeard' }],
    workspaces: [],
    kiroCrewSessions: {},
    pollIntervalSec: 60,
    fetchIntervalSec: 300,
    autoUpdateEnabled: true,
    updateCheckIntervalMin: 30,
    collapsedRepos: [],
    defaultIde: 'vscode',
    jiraPanelOpen: false,
    jiraPanelWidth: 260
  }
}

describe('workspace service', () => {
  beforeEach(() => {
    getConfig.mockReset()
    setConfig.mockReset()
    getWorktrees.mockReset()
    existsSync.mockReset()
    lstatSync.mockReset()
    mkdirSync.mockReset()
    rmdirSync.mockReset()
    symlinkSync.mockReset()
    unlinkSync.mockReset()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000')
    getConfig.mockReturnValue(createConfig())
    existsSync.mockReturnValue(false)
    getWorktrees.mockResolvedValue([{
      path: '/Users/test/Developer/worktrees/treebeard-app/feat/refresh',
      branch: 'feat/refresh',
      head: 'abc123',
      isMain: false
    }])
  })

  it('creates an empty workspace in the fixed workspace root', () => {
    expect(createWorkspace('Authentication Refresh')).toEqual({
      success: true,
      workspace: {
        id: '00000000-0000-4000-8000-000000000000',
        name: 'Authentication Refresh',
        path: '/Users/test/Developer/workspaces/authentication-refresh',
        members: []
      }
    })
    expect(mkdirSync).toHaveBeenCalledWith('/Users/test/Developer/workspaces/authentication-refresh', { recursive: true })
    expect(setConfig).toHaveBeenCalledWith(expect.objectContaining({
      workspaces: [expect.objectContaining({ id: '00000000-0000-4000-8000-000000000000' })]
    }))
  })

  it('links a verified existing worktree into the workspace', async () => {
    const config = createConfig()
    config.workspaces = [{
      id: 'workspace-1',
      name: 'Authentication Refresh',
      path: '/Users/test/Developer/workspaces/authentication-refresh',
      members: []
    }]
    getConfig.mockReturnValue(config)

    await expect(attachWorkspaceWorktree('workspace-1', 'repo-1', '/Users/test/Developer/worktrees/treebeard-app/feat/refresh')).resolves.toEqual({ success: true })
    expect(getWorktrees).toHaveBeenCalledWith('/repos/treebeard')
    expect(setConfig).toHaveBeenCalledWith(expect.objectContaining({
      workspaces: [expect.objectContaining({
        members: [{
          repoId: 'repo-1',
          worktreePath: '/Users/test/Developer/worktrees/treebeard-app/feat/refresh',
          linkPath: '/Users/test/Developer/workspaces/authentication-refresh/treebeard-app'
        }]
      })]
    }))
    expect(symlinkSync).toHaveBeenCalledWith(
      '/Users/test/Developer/worktrees/treebeard-app/feat/refresh',
      '/Users/test/Developer/workspaces/authentication-refresh/treebeard-app',
      'dir'
    )
  })

  it('rejects attaching a primary worktree', async () => {
    const config = createConfig()
    config.workspaces = [{
      id: 'workspace-1',
      name: 'Authentication Refresh',
      path: '/Users/test/Developer/workspaces/authentication-refresh',
      members: []
    }]
    getConfig.mockReturnValue(config)
    getWorktrees.mockResolvedValue([{
      path: '/repos/treebeard',
      branch: 'main',
      head: 'abc123',
      isMain: true
    }])

    await expect(attachWorkspaceWorktree('workspace-1', 'repo-1', '/repos/treebeard')).resolves.toEqual({
      success: false,
      error: 'Choose an existing non-main worktree from this repository.'
    })
    expect(symlinkSync).not.toHaveBeenCalled()
  })

  it('unlinks a workspace entry without deleting its worktree', () => {
    const config = createConfig()
    config.workspaces = [{
      id: 'workspace-1',
      name: 'Authentication Refresh',
      path: '/Users/test/Developer/workspaces/authentication-refresh',
      members: [{
        repoId: 'repo-1',
        worktreePath: '/Users/test/Developer/worktrees/treebeard-app/feat/refresh',
        linkPath: '/Users/test/Developer/workspaces/authentication-refresh/treebeard-app'
      }]
    }]
    getConfig.mockReturnValue(config)
    lstatSync.mockReturnValue({ isSymbolicLink: () => true })

    expect(removeWorkspaceMember('workspace-1', 'repo-1')).toEqual({ success: true })
    expect(unlinkSync).toHaveBeenCalledWith('/Users/test/Developer/workspaces/authentication-refresh/treebeard-app')
  })

  it('retargets a workspace link after a canonical worktree rename', () => {
    const config = createConfig()
    config.workspaces = [{
      id: 'workspace-1',
      name: 'Authentication Refresh',
      path: '/Users/test/Developer/workspaces/authentication-refresh',
      members: [{
        repoId: 'repo-1',
        worktreePath: '/Users/test/Developer/worktrees/treebeard-app/feat/refresh',
        linkPath: '/Users/test/Developer/workspaces/authentication-refresh/treebeard-app'
      }]
    }]
    getConfig.mockReturnValue(config)
    lstatSync.mockReturnValue({ isSymbolicLink: () => true })

    updateWorkspaceWorktreePath(
      '/Users/test/Developer/worktrees/treebeard-app/feat/refresh',
      '/Users/test/Developer/worktrees/treebeard-app/feat/refresh-v2'
    )

    expect(unlinkSync).toHaveBeenCalledWith('/Users/test/Developer/workspaces/authentication-refresh/treebeard-app')
    expect(symlinkSync).toHaveBeenCalledWith(
      '/Users/test/Developer/worktrees/treebeard-app/feat/refresh-v2',
      '/Users/test/Developer/workspaces/authentication-refresh/treebeard-app',
      'dir'
    )
    expect(setConfig).toHaveBeenCalledWith(expect.objectContaining({
      workspaces: [expect.objectContaining({
        members: [{
          repoId: 'repo-1',
          worktreePath: '/Users/test/Developer/worktrees/treebeard-app/feat/refresh-v2',
          linkPath: '/Users/test/Developer/workspaces/authentication-refresh/treebeard-app'
        }]
      })]
    }))
  })

  it('removes all workspace links without deleting their worktrees', () => {
    const config = createConfig()
    config.repositories.push({ id: 'repo-2', name: 'Website', path: '/repos/website' })
    config.workspaces = [{
      id: 'workspace-1',
      name: 'Authentication Refresh',
      path: '/Users/test/Developer/workspaces/authentication-refresh',
      members: [
        {
          repoId: 'repo-1',
          worktreePath: '/Users/test/Developer/worktrees/treebeard-app/feat/refresh',
          linkPath: '/Users/test/Developer/workspaces/authentication-refresh/treebeard-app'
        },
        {
          repoId: 'repo-2',
          worktreePath: '/Users/test/Developer/worktrees/website/feat/refresh',
          linkPath: '/Users/test/Developer/workspaces/authentication-refresh/website'
        }
      ]
    }]
    getConfig.mockReturnValue(config)
    lstatSync.mockReturnValue({ isSymbolicLink: () => true })

    expect(removeWorkspace('workspace-1')).toEqual({ success: true })
    expect(unlinkSync).toHaveBeenCalledWith('/Users/test/Developer/workspaces/authentication-refresh/treebeard-app')
    expect(unlinkSync).toHaveBeenCalledWith('/Users/test/Developer/workspaces/authentication-refresh/website')
    expect(setConfig).toHaveBeenCalledWith(expect.objectContaining({
      workspaces: []
    }))
    expect(rmdirSync).toHaveBeenCalledWith('/Users/test/Developer/workspaces/authentication-refresh')
  })
})
