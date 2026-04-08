import { describe, expect, it, vi } from 'vitest'
import { launchGhostty, launchIde, launchPippinShell } from './launcher'
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

    await launchGhostty('/Users/user/projects/node-commons/this-is-the-worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/osascript', '-e', expect.stringContaining('tell application "Ghostty"')],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
  })

  it('launches a Ghostty tab running pippin shell in the worktree', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '/opt/homebrew/bin/pippin\n' }, { stdout: '' }])

    await launchPippinShell('/repo/worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['which', 'pippin'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'ignore', env: { PATH: '/usr/bin' } })
    )
    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/osascript', '-e', expect.stringContaining('set command of cfg to "/opt/homebrew/bin/pippin shell"')],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/osascript', '-e', expect.stringContaining('set environment variables of cfg to {"PATH=/usr/bin"}')],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/osascript', '-e', expect.stringContaining('set initial working directory of cfg to "/repo/worktree"')],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
  })
})
