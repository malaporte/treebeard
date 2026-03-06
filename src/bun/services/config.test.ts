import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCodexEnabled,
  getCollapsedRepos,
  getConfig,
  getMobileBridgeConfig,
  rotateMobileBridgePairingCode,
  setCodexEnabled,
  setMobileBridgeEnabled,
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
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      codexServerEnabled: false,
      mobileBridge: {
        enabled: false,
        host: '0.0.0.0',
        port: 8787,
        pairingCode: ''
      }
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
      mobileBridge: {
        enabled: true,
        host: '10.0.0.5',
        port: 99999,
        pairingCode: '123456'
      }
    })

    expect(getConfig()).toEqual({
      repositories: [],
      pollIntervalSec: 10,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 1440,
      collapsedRepos: [],
      codexServerEnabled: false,
      mobileBridge: {
        enabled: true,
        host: '10.0.0.5',
        port: 65535,
        pairingCode: '123456'
      }
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
      mobileBridge: {
        enabled: false,
        host: '0.0.0.0',
        port: 8787,
        pairingCode: ''
      }
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
  })
})

describe('mobile bridge config helpers', () => {
  beforeEach(() => {
    setupStore()
  })

  it('returns default mobile bridge config', () => {
    expect(getMobileBridgeConfig()).toEqual({
      enabled: false,
      host: '0.0.0.0',
      port: 8787,
      pairingCode: ''
    })
  })

  it('enables and disables mobile bridge', () => {
    expect(setMobileBridgeEnabled(true).enabled).toBe(true)
    expect(getMobileBridgeConfig().enabled).toBe(true)

    expect(setMobileBridgeEnabled(false).enabled).toBe(false)
    expect(getMobileBridgeConfig().enabled).toBe(false)
  })

  it('rotates pairing code', () => {
    const first = rotateMobileBridgePairingCode()
    const second = rotateMobileBridgePairingCode()
    expect(first).toHaveLength(6)
    expect(second).toHaveLength(6)
    expect(first).not.toBe(second)
  })
})
