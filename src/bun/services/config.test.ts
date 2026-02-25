import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCollapsedRepos, getConfig, setCollapsedRepos, setConfig } from './config'

const fileStore = new Map<string, string>()

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/Users/test'
  }
}))

vi.mock('node:fs', () => ({
  default: {
    readFileSync: (filePath: string) => {
      if (!fileStore.has(filePath)) {
        throw new Error('ENOENT')
      }
      return fileStore.get(filePath) ?? ''
    },
    mkdirSync: vi.fn(),
    writeFileSync: (filePath: string, data: string) => {
      fileStore.set(filePath, data)
    }
  }
}))

describe('config service', () => {
  beforeEach(() => {
    fileStore.clear()
  })

  it('returns defaults when no file exists', () => {
    expect(getConfig()).toEqual({
      repositories: [],
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: []
    })
  })

  it('sanitizes persisted values to supported ranges', () => {
    setConfig({
      repositories: [],
      pollIntervalSec: 1,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 5000,
      collapsedRepos: []
    })

    expect(getConfig()).toEqual({
      repositories: [],
      pollIntervalSec: 10,
      autoUpdateEnabled: false,
      updateCheckIntervalMin: 1440,
      collapsedRepos: []
    })
  })

  it('persists collapsed repos independently', () => {
    setCollapsedRepos(['repo-1', 'repo-2'])
    expect(getCollapsedRepos()).toEqual(['repo-1', 'repo-2'])
  })
})
