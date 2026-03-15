import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSpawnProcess } from '../../test/bun'

describe('shell-env service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('parses login-shell env output and caches it', async () => {
    const spawn = vi.fn(() =>
      createSpawnProcess({
        stdout: 'PATH=/opt/homebrew/bin\u0000SHELL=/bin/zsh\u0000'
      })
    )

    vi.stubGlobal('Bun', {
      env: { SHELL: '/bin/zsh' },
      spawn
    })

    const { getShellEnv } = await import('./shell-env')
    const env = await getShellEnv()
    const cachedEnv = await getShellEnv()

    expect(env.PATH).toBe('/opt/homebrew/bin')
    expect(env.SHELL).toBe('/bin/zsh')
    expect(cachedEnv).toBe(env)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('falls back to process.env when shell invocation fails', async () => {
    const spawn = vi.fn(() =>
      createSpawnProcess({
        stderr: 'shell failed',
        exitCode: 1
      })
    )

    vi.stubGlobal('Bun', {
      env: { SHELL: '/bin/zsh' },
      spawn
    })

    const { getShellEnv } = await import('./shell-env')
    const env = await getShellEnv()

    expect(env).toEqual(expect.objectContaining({ PATH: process.env.PATH }))
  })
})
