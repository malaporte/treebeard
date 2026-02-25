import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCollapsedRepos,
  getConfig,
  getOpencodeEnabled,
  getOpencodeEnabledPaths,
  setCollapsedRepos,
  setConfig,
  setOpencodeEnabled
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
      opencodeServers: {}
    })
  })

  it('sanitizes persisted values to supported ranges', () => {
    setConfig({
      repositories: [],
      pollIntervalSec: 1,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 5000,
      collapsedRepos: [],
      opencodeServers: {}
    })

    expect(getConfig()).toEqual({
      repositories: [],
      pollIntervalSec: 10,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 1440,
      collapsedRepos: [],
      opencodeServers: {}
    })
  })

  it('persists collapsed repos independently', () => {
    setCollapsedRepos(['repo-1', 'repo-2'])
    expect(getCollapsedRepos()).toEqual(['repo-1', 'repo-2'])
  })
})

describe('opencode server config helpers', () => {
  beforeEach(() => {
    setupStore()
  })

  it('returns false for unknown worktree paths', () => {
    expect(getOpencodeEnabled('/repo/unknown')).toBe(false)
  })

  it('persists enabled state for a worktree', () => {
    setOpencodeEnabled('/repo/wt-persist', true)
    expect(getOpencodeEnabled('/repo/wt-persist')).toBe(true)
    expect(getOpencodeEnabled('/repo/wt-other')).toBe(false)
  })

  it('removes entry when disabling', () => {
    setOpencodeEnabled('/repo/wt-rm', true)
    setOpencodeEnabled('/repo/wt-rm', false)
    expect(getOpencodeEnabled('/repo/wt-rm')).toBe(false)

    const config = getConfig()
    expect('/repo/wt-rm' in config.opencodeServers).toBe(false)
  })

  it('returns all enabled paths', () => {
    setOpencodeEnabled('/repo/a', true)
    setOpencodeEnabled('/repo/b', true)
    setOpencodeEnabled('/repo/c', false)

    const paths = getOpencodeEnabledPaths()
    expect(paths.sort()).toEqual(['/repo/a', '/repo/b'])
  })

  it('returns empty array when no servers are enabled', () => {
    expect(getOpencodeEnabledPaths()).toEqual([])
  })

  it('preserves other config fields when toggling opencode servers', () => {
    setConfig({
      repositories: [{ id: '1', name: 'repo', path: '/repo' }],
      pollIntervalSec: 120,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 45,
      collapsedRepos: ['repo-1'],
      opencodeServers: {}
    })

    setOpencodeEnabled('/repo/worktree', true)

    const config = getConfig()
    expect(config.repositories).toEqual([{ id: '1', name: 'repo', path: '/repo' }])
    expect(config.pollIntervalSec).toBe(120)
    expect(config.autoUpdateEnabled).toBe(false)
    expect(config.collapsedRepos).toEqual(['repo-1'])
    expect(config.opencodeServers).toEqual({ '/repo/worktree': true })
  })

  it('sanitizes invalid opencodeServers value to empty object', () => {
    store.set('/Users/test/.config/treebeard', JSON.stringify({
      repositories: [],
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      opencodeServers: 'invalid'
    }))

    const config = getConfig()
    expect(config.opencodeServers).toEqual({})
  })
})
