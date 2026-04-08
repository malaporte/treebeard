import { describe, expect, it, vi } from 'vitest'
import { launchGhostty, launchIde } from './launcher'
import { setBunSpawnQueue } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

describe('launcher service', () => {
  it('launches the configured IDE and waits for exit', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '' }])

    await launchIde('vscode', '/repo/worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['code', '/repo/worktree'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'pipe' })
    )
  })

  it('launches IntelliJ via the idea CLI command', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '' }])

    await launchIde('intellij', '/repo/worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['idea', '/repo/worktree'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'pipe' })
    )
  })

  it('launches ghostty with AppleScript and sets tab title', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '' }])

    await launchGhostty('/repo/worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/osascript', '-e', expect.stringContaining('tell application "Ghostty"')],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
  })
})
