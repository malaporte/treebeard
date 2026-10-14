import { describe, expect, it, vi } from 'vitest'
import { checkDependencies } from './dependencies'
import { setBunSpawnResolver } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

const TWG_AUTH_PROBE = 'twg user get -o json --output-summary none'

describe('dependencies service', () => {
  it('marks dependencies installed and authenticated when probes pass', async () => {
    setBunSpawnResolver((command) => {
      const key = command.join(' ')
      if (key === 'gh --version') return { stdout: 'gh version 2.0.0\n' }
      if (key === 'gh auth status') return { stdout: 'logged in\n' }
      if (key === 'twg --version') return { stdout: '1.3.5\n' }
      if (key === TWG_AUTH_PROBE) return { stdout: '{"data":{"name":"sam"}}' }
      return { stderr: `unexpected command: ${key}`, exitCode: 1 }
    })

    const status = await checkDependencies()
    expect(status.checks).toEqual([
      {
        name: 'gh',
        required: true,
        installed: true,
        authenticated: true,
        version: 'gh version 2.0.0',
        error: null,
        authError: null
      },
      {
        name: 'twg',
        required: true,
        installed: true,
        authenticated: true,
        version: '1.3.5',
        error: null,
        authError: null
      }
    ])
  })

  it('reports missing twg when the version probe fails', async () => {
    setBunSpawnResolver((command) => {
      const key = command.join(' ')
      if (key === 'gh --version') return { stdout: 'gh version 2.0.0\n' }
      if (key === 'gh auth status') return { stdout: 'logged in\n' }
      if (key === 'twg --version') return { stderr: 'command not found', exitCode: 1 }
      return { stderr: `unexpected command: ${key}`, exitCode: 1 }
    })

    const status = await checkDependencies()
    const twg = status.checks.find((check) => check.name === 'twg')
    expect(twg).toEqual({
      name: 'twg',
      required: true,
      installed: false,
      authenticated: null,
      version: null,
      error: 'command not found',
      authError: null
    })
  })

  it('reports twg as unauthenticated when the auth probe fails', async () => {
    setBunSpawnResolver((command) => {
      const key = command.join(' ')
      if (key === 'gh --version') return { stdout: 'gh version 2.0.0\n' }
      if (key === 'gh auth status') return { stdout: 'logged in\n' }
      if (key === 'twg --version') return { stdout: '1.3.5\n' }
      if (key === TWG_AUTH_PROBE) return { stderr: 'login required', exitCode: 1 }
      return { stderr: `unexpected command: ${key}`, exitCode: 1 }
    })

    const status = await checkDependencies()
    const twg = status.checks.find((check) => check.name === 'twg')
    expect(twg?.authenticated).toBe(false)
    expect(twg?.authError).toBe('login required')
  })

  it('treats unsupported auth command as unknown auth state', async () => {
    setBunSpawnResolver((command) => {
      const key = command.join(' ')
      if (key === 'gh --version') return { stdout: 'gh version 2.0.0\n' }
      if (key === 'gh auth status') return { stdout: 'logged in\n' }
      if (key === 'twg --version') return { stdout: '1.3.5\n' }
      if (key === TWG_AUTH_PROBE) return { stderr: "error: unknown command 'user'", exitCode: 1 }
      return { stderr: `unexpected command: ${key}`, exitCode: 1 }
    })

    const status = await checkDependencies()
    const twg = status.checks.find((check) => check.name === 'twg')
    expect(twg?.authenticated).toBeNull()
    expect(twg?.authError).toBeNull()
  })
})
