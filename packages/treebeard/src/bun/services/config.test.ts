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
      pollIntervalSec: 60,
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
      pollIntervalSec: 1,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 5000,
      collapsedRepos: [],
      defaultIde: 'intellij',
      jiraPanelOpen: false,
      jiraPanelWidth: 260
    })

    expect(getConfig()).toEqual({
      repositories: [],
      pollIntervalSec: 10,
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
})
