import { describe, expect, it, vi } from 'vitest'
import { launchCodexDesktop, launchGhostty, launchVSCode } from './launcher'
import { setBunSpawnQueue } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

describe('launcher service', () => {
  it('launches vscode and waits for exit', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '' }])

    await launchVSCode('/repo/worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['code', '/repo/worktree'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'pipe' })
    )
  })

  it('launches ghostty with open -a and path argument', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '' }])

    await launchGhostty('/repo/worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['open', '-a', 'Ghostty.app', '/repo/worktree'],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
  })

  it('opens the latest codex thread for the worktree when one exists', async () => {
    const spawn = setBunSpawnQueue([
      {
        stdout: [
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: { data: [{ id: '019cc483-aaaa-bbbb-cccc-123456789abc' }], nextCursor: null }
          })
        ].join('\n')
      },
      { stdout: '' }
    ])

    await launchCodexDesktop('/repo/worktree')

    expect(spawn).toHaveBeenNthCalledWith(
      1,
      ['codex', 'app-server', '--listen', 'stdio://'],
      expect.objectContaining({ cwd: '/repo/worktree', stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
    )
    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/open', 'codex://threads/019cc483-aaaa-bbbb-cccc-123456789abc'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'pipe' })
    )
  })

  it('falls back to opening codex desktop on the worktree when no matching thread exists', async () => {
    const spawn = setBunSpawnQueue([
      {
        stdout: [
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
          JSON.stringify({ jsonrpc: '2.0', id: 2, result: { data: [], nextCursor: null } })
        ].join('\n')
      },
      { stdout: '' }
    ])

    await launchCodexDesktop('/repo/worktree')

    expect(spawn).toHaveBeenNthCalledWith(
      2,
      ['open', '-a', 'Codex.app', '/repo/worktree'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'pipe' })
    )
  })
})
