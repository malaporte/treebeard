import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isKiroCrewAvailable, openKiroCrewSession } from './kiro-crew'
import { setBunSpawnQueue } from '../../test/bun'
import type { AppConfig } from '../../shared/types'

const { getConfig, setConfig } = vi.hoisted(() => ({
  getConfig: vi.fn(),
  setConfig: vi.fn()
}))

vi.mock('./config', () => ({
  getConfig,
  setConfig
}))

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

function createConfig(kiroCrewSessions: Record<string, string> = {}): AppConfig {
  return {
    repositories: [],
    workspaces: [],
    kiroCrewSessions,
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

describe('Kiro Crew service', () => {
  beforeEach(() => {
    getConfig.mockReset()
    setConfig.mockReset()
    getConfig.mockReturnValue(createConfig())
    vi.stubGlobal('fetch', vi.fn())
  })

  it('reuses an existing session and scopes it to the worktree', async () => {
    const fetch = vi.mocked(globalThis.fetch)
    fetch
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
    getConfig.mockReturnValue(createConfig({ '/repo/worktree': 'chat-123' }))
    const spawn = setBunSpawnQueue([
      { stdout: 'http://localhost:5476/?token=secret\n' },
      { stdout: '' }
    ])

    await expect(openKiroCrewSession('/repo/worktree')).resolves.toEqual({ success: true })

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:5476/api/chat/slots/chat-123?token=secret'
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:5476/api/chat/slots/chat-123/project?token=secret',
      expect.objectContaining({ body: JSON.stringify({ project: '/repo/worktree' }) })
    )
    expect(setConfig).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenLastCalledWith(
      ['/usr/bin/open', '-a', 'KiroCrew'],
      { stdout: 'ignore', stderr: 'ignore' }
    )
  })

  it('creates and stores a session when no association exists', async () => {
    const fetch = vi.mocked(globalThis.fetch)
    fetch
      .mockResolvedValueOnce(new Response('{"key":"chat-456"}'))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
    setBunSpawnQueue([
      { stdout: 'http://localhost:5476/?token=secret\n' },
      { stdout: '' }
    ])

    await expect(openKiroCrewSession('/repo/worktree')).resolves.toEqual({ success: true })

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:5476/api/chat/slots?token=secret',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Treebeard: repo / worktree' })
      })
    )
    expect(setConfig).toHaveBeenCalledWith(createConfig({ '/repo/worktree': 'chat-456' }))
  })

  it('returns an unavailable error when the local gateway cannot provide a token', async () => {
    const fetch = vi.mocked(globalThis.fetch)
    setBunSpawnQueue([{ stderr: 'gateway unavailable', exitCode: 1 }])

    await expect(openKiroCrewSession('/repo/worktree')).resolves.toEqual({
      success: false,
      error: 'Kiro Crew is unavailable. Start its gateway and try again.'
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires both the Kiro Crew CLI and desktop app', async () => {
    const spawn = setBunSpawnQueue([
      { stdout: '/opt/homebrew/bin/kirocrew\n' },
      { stdout: '/Applications/KiroCrew.app\n' }
    ])

    await expect(isKiroCrewAvailable()).resolves.toBe(true)

    expect(spawn).toHaveBeenNthCalledWith(
      1,
      ['which', 'kirocrew'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'ignore', env: { PATH: '/usr/bin' } })
    )
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      ['/usr/bin/mdfind', 'kMDItemCFBundleIdentifier == "com.amazon.kiro.crew*"cd'],
      { stdout: 'pipe', stderr: 'ignore' }
    )
  })

  it('returns false when the Kiro Crew desktop app is absent', async () => {
    setBunSpawnQueue([
      { stdout: '/opt/homebrew/bin/kirocrew\n' },
      { stdout: '' }
    ])

    await expect(isKiroCrewAvailable()).resolves.toBe(false)
  })

  it('reports a desktop app failure after persisting the scoped session', async () => {
    const fetch = vi.mocked(globalThis.fetch)
    fetch
      .mockResolvedValueOnce(new Response('{"key":"chat-456"}'))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
    setBunSpawnQueue([
      { stdout: 'http://localhost:5476/?token=secret\n' },
      { stderr: 'application not found', exitCode: 1 }
    ])

    await expect(openKiroCrewSession('/repo/worktree')).resolves.toEqual({
      success: false,
      error: 'Kiro Crew session is ready, but its desktop app could not be opened.'
    })

    expect(setConfig).toHaveBeenCalledWith(createConfig({ '/repo/worktree': 'chat-456' }))
  })
})
