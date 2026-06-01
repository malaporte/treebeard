import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCollapsedRepos,
  getConfig,
  setCollapsedRepos,
  setConfig
} from './config'

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/Users/test'
  }
}))

const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()

vi.mock('node:fs', () => ({
  default: {
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    mkdirSync: vi.fn(),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args)
  }
}))

let store: Map<string, string>

function setupStore() {
  mockReadFileSync.mockReset()
  mockWriteFileSync.mockReset()
  store = new Map<string, string>()
  mockReadFileSync.mockImplementation((filePath: string) => {
    if (!store.has(filePath)) {
      throw new Error('ENOENT')
    }
    return store.get(filePath) ?? ''
  })
  mockWriteFileSync.mockImplementation((filePath: string, data: string) => {
    store.set(filePath, data)
  })
}

describe('config service', () => {
  beforeEach(() => {
    setupStore()
  })

  it('returns defaults when no file exists', () => {
    expect(getConfig()).toEqual({
      repositories: [],
      workspaces: [],
      pollIntervalSec: 60,
      fetchIntervalSec: 300,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      defaultIde: 'vscode',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })
  })

  it('sanitizes persisted values to supported ranges', () => {
    setConfig({
      repositories: [],
      workspaces: [],
      pollIntervalSec: 1,
      fetchIntervalSec: 30,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 5000,
      collapsedRepos: [],
      defaultIde: 'intellij',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })

    expect(getConfig()).toEqual({
      repositories: [],
      workspaces: [],
      pollIntervalSec: 10,
      fetchIntervalSec: 60,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 1440,
      collapsedRepos: [],
      defaultIde: 'intellij',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })
  })

  it('persists collapsed repos independently', () => {
    setCollapsedRepos(['repo-1', 'repo-2'])
    expect(getCollapsedRepos()).toEqual(['repo-1', 'repo-2'])
  })

  it('legacy config without workspaces field defaults to []', () => {
    setConfig({
      repositories: [],
      workspaces: [],
      pollIntervalSec: 60,
      fetchIntervalSec: 300,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      defaultIde: 'vscode',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })

    const stored = JSON.parse(store.get('/Users/test/.config/treebeard/treebeard-config.json') ?? '{}')
    delete stored.workspaces
    store.set('/Users/test/.config/treebeard/treebeard-config.json', JSON.stringify(stored))

    expect(getConfig().workspaces).toEqual([])
  })

  it('drops workspace with repoIds referencing non-existent repos', () => {
    setConfig({
      repositories: [{ id: 'repo-a', name: 'Repo A', path: '/a' }],
      workspaces: [
        { id: 'ws-1', name: 'WS 1', slug: 'ws-1', repoIds: ['repo-a', 'repo-missing'] }
      ],
      pollIntervalSec: 60,
      fetchIntervalSec: 300,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      defaultIde: 'vscode',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })

    expect(getConfig().workspaces).toEqual([])
  })

  it('drops workspace with fewer than 2 members', () => {
    setConfig({
      repositories: [{ id: 'repo-a', name: 'Repo A', path: '/a' }],
      workspaces: [
        { id: 'ws-1', name: 'WS 1', slug: 'ws-1', repoIds: ['repo-a'] }
      ],
      pollIntervalSec: 60,
      fetchIntervalSec: 300,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      defaultIde: 'vscode',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })

    expect(getConfig().workspaces).toEqual([])
  })

  it('drops workspace with invalid slug format', () => {
    setConfig({
      repositories: [
        { id: 'repo-a', name: 'Repo A', path: '/a' },
        { id: 'repo-b', name: 'Repo B', path: '/b' }
      ],
      workspaces: [
        { id: 'ws-1', name: 'Starts With Dash', slug: '-invalid', repoIds: ['repo-a', 'repo-b'] },
        { id: 'ws-2', name: 'Has Uppercase', slug: 'MyWorkspace', repoIds: ['repo-a', 'repo-b'] }
      ],
      pollIntervalSec: 60,
      fetchIntervalSec: 300,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      defaultIde: 'vscode',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })

    expect(getConfig().workspaces).toEqual([])
  })

  it('keeps only the first workspace when slugs are duplicated', () => {
    setConfig({
      repositories: [
        { id: 'repo-a', name: 'Repo A', path: '/a' },
        { id: 'repo-b', name: 'Repo B', path: '/b' }
      ],
      workspaces: [
        { id: 'ws-1', name: 'First', slug: 'my-workspace', repoIds: ['repo-a', 'repo-b'] },
        { id: 'ws-2', name: 'Second', slug: 'my-workspace', repoIds: ['repo-a', 'repo-b'] }
      ],
      pollIntervalSec: 60,
      fetchIntervalSec: 300,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      defaultIde: 'vscode',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })

    const workspaces = getConfig().workspaces ?? []
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0].id).toBe('ws-1')
  })

  it('passes valid workspaces through unchanged', () => {
    setConfig({
      repositories: [
        { id: 'repo-a', name: 'Repo A', path: '/a' },
        { id: 'repo-b', name: 'Repo B', path: '/b' }
      ],
      workspaces: [
        { id: 'ws-1', name: 'My Workspace', slug: 'my-workspace', repoIds: ['repo-a', 'repo-b'] }
      ],
      pollIntervalSec: 60,
      fetchIntervalSec: 300,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      defaultIde: 'vscode',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })

    expect(getConfig().workspaces).toEqual([
      { id: 'ws-1', name: 'My Workspace', slug: 'my-workspace', repoIds: ['repo-a', 'repo-b'] }
    ])
  })
})
