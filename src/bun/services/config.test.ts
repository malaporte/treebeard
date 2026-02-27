import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCollapsedRepos,
  getConfig,
  getMobileBridgeConfig,
  getOpencodeEnabled,
  rotateMobileBridgePairingCode,
  setMobileBridgeEnabled,
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
      opencodeServerEnabled: false,
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
      opencodeServerEnabled: false,
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
      opencodeServerEnabled: false,
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

describe('opencode server config helpers', () => {
  beforeEach(() => {
    setupStore()
  })

  it('returns false by default', () => {
    expect(getOpencodeEnabled()).toBe(false)
  })

  it('persists enabled state', () => {
    setOpencodeEnabled(true)
    expect(getOpencodeEnabled()).toBe(true)
  })

  it('can disable server state', () => {
    setOpencodeEnabled(true)
    setOpencodeEnabled(false)
    expect(getOpencodeEnabled()).toBe(false)
  })

  it('preserves other config fields when toggling opencode servers', () => {
    setConfig({
      repositories: [{ id: '1', name: 'repo', path: '/repo' }],
      pollIntervalSec: 120,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 45,
      collapsedRepos: ['repo-1'],
      opencodeServerEnabled: false,
      mobileBridge: {
        enabled: false,
        host: '0.0.0.0',
        port: 8787,
        pairingCode: ''
      }
    })

    setOpencodeEnabled(true)

    const config = getConfig()
    expect(config.repositories).toEqual([{ id: '1', name: 'repo', path: '/repo' }])
    expect(config.pollIntervalSec).toBe(120)
    expect(config.autoUpdateEnabled).toBe(false)
    expect(config.collapsedRepos).toEqual(['repo-1'])
    expect(config.opencodeServerEnabled).toBe(true)
  })

  it('sanitizes invalid opencodeServerEnabled value to false', () => {
    store.set('/Users/test/.config/treebeard', JSON.stringify({
      repositories: [],
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      opencodeServerEnabled: 'invalid'
    }))

    const config = getConfig()
    expect(config.opencodeServerEnabled).toBe(false)
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
