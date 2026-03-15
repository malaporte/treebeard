import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCodexEnabled,
  getCollapsedRepos,
  getConfig,
  getSandboxEnabled,
  setCodexEnabled,
  setCollapsedRepos,
  setConfig,
  setSandboxEnabled
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
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      codexServerEnabled: false,
      desktopCodexPaneWidth: 420,
      sandboxEnabled: false
    })
  })

  it('sanitizes persisted values to supported ranges', () => {
    setConfig({
      repositories: [],
      pollIntervalSec: 1,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 5000,
      collapsedRepos: [],
      codexServerEnabled: false,
      desktopCodexPaneWidth: 99999,
      sandboxEnabled: false
    })

    expect(getConfig()).toEqual({
      repositories: [],
      pollIntervalSec: 10,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 1440,
      collapsedRepos: [],
      codexServerEnabled: false,
      desktopCodexPaneWidth: 4096,
      sandboxEnabled: false
    })
  })

  it('persists collapsed repos independently', () => {
    setCollapsedRepos(['repo-1', 'repo-2'])
    expect(getCollapsedRepos()).toEqual(['repo-1', 'repo-2'])
  })
})

describe('codex server config helpers', () => {
  beforeEach(() => {
    setupStore()
  })

  it('returns false by default', () => {
    expect(getCodexEnabled()).toBe(false)
  })

  it('persists enabled state', () => {
    setCodexEnabled(true)
    expect(getCodexEnabled()).toBe(true)
  })

  it('can disable server state', () => {
    setCodexEnabled(true)
    setCodexEnabled(false)
    expect(getCodexEnabled()).toBe(false)
  })

  it('preserves other config fields when toggling codex servers', () => {
    setConfig({
      repositories: [{ id: '1', name: 'repo', path: '/repo' }],
      pollIntervalSec: 120,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 45,
      collapsedRepos: ['repo-1'],
      codexServerEnabled: false,
      desktopCodexPaneWidth: 480,
      sandboxEnabled: true
    })

    setCodexEnabled(true)

    const config = getConfig()
    expect(config.repositories).toEqual([{ id: '1', name: 'repo', path: '/repo' }])
    expect(config.pollIntervalSec).toBe(120)
    expect(config.autoUpdateEnabled).toBe(false)
    expect(config.collapsedRepos).toEqual(['repo-1'])
    expect(config.codexServerEnabled).toBe(true)
  })

  it('sanitizes invalid codexServerEnabled value to false', () => {
    store.set('/Users/test/.config/treebeard/treebeard-config.json', JSON.stringify({
      repositories: [],
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      codexServerEnabled: 'invalid'
    }))

    const config = getConfig()
    expect(config.codexServerEnabled).toBe(false)
    expect(config.desktopCodexPaneWidth).toBe(420)
  })
})

describe('sandbox config helpers', () => {
  beforeEach(() => {
    setupStore()
  })

  it('returns false by default', () => {
    expect(getSandboxEnabled()).toBe(false)
  })

  it('persists enabled state', () => {
    setSandboxEnabled(true)
    expect(getSandboxEnabled()).toBe(true)
  })

  it('can disable sandbox state', () => {
    setSandboxEnabled(true)
    setSandboxEnabled(false)
    expect(getSandboxEnabled()).toBe(false)
  })

  it('sanitizes invalid sandboxEnabled value to false', () => {
    store.set('/Users/test/.config/treebeard/treebeard-config.json', JSON.stringify({
      repositories: [],
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      codexServerEnabled: false,
      sandboxEnabled: 'invalid'
    }))

    expect(getSandboxEnabled()).toBe(false)
  })
})
