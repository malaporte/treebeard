import { describe, expect, it, vi } from 'vitest'
import { checkDependencies } from './dependencies'
import { setBunSpawnResolver } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

describe('dependencies service', () => {
  it('marks dependencies installed and authenticated when probes pass', async () => {
    setBunSpawnResolver((command) => {
      const key = command.join(' ')
      if (key === 'gh --version') return { stdout: 'gh version 2.0.0\n' }
      if (key === 'gh auth status') return { stdout: 'logged in\n' }
      if (key === 'jira --version') return { stdout: 'jira version 1.0.0\n' }
      if (key === 'jira me --raw') return { stdout: '{"name":"sam"}' }
      if (key === 'codex --version') return { stdout: 'codex version 1.2.0\n' }
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
        name: 'jira',
        required: true,
        installed: true,
        authenticated: true,
        version: 'jira version 1.0.0',
        error: null,
        authError: null
      },
      {
        name: 'codex',
        required: true,
        installed: true,
        authenticated: null,
        version: 'codex version 1.2.0',
        error: null,
        authError: null
      }
    ])
  })

  it('reports missing jira when command probes fail', async () => {
    setBunSpawnResolver((command) => {
      const key = command.join(' ')
      if (key === 'gh --version') return { stdout: 'gh version 2.0.0\n' }
      if (key === 'gh auth status') return { stdout: 'logged in\n' }
      if (key === 'jira --version') return { stderr: 'command not found', exitCode: 1 }
      if (key === 'jira version') return { stderr: 'command not found', exitCode: 1 }
      return { stderr: `unexpected command: ${key}`, exitCode: 1 }
    })

    const status = await checkDependencies()
    const jira = status.checks.find((check) => check.name === 'jira')
    expect(jira).toEqual({
      name: 'jira',
      required: true,
      installed: false,
      authenticated: null,
      version: null,
      error: 'command not found',
      authError: null
    })
  })

  it('treats unsupported auth command as unknown auth state', async () => {
    setBunSpawnResolver((command) => {
      const key = command.join(' ')
      if (key === 'gh --version') return { stdout: 'gh version 2.0.0\n' }
      if (key === 'gh auth status') return { stdout: 'logged in\n' }
      if (key === 'jira --version') return { stdout: 'jira version 1.0.0\n' }
      if (key === 'jira me --raw') return { stderr: 'unknown command "me"', exitCode: 1 }
      return { stderr: `unexpected command: ${key}`, exitCode: 1 }
    })

    const status = await checkDependencies()
    const jira = status.checks.find((check) => check.name === 'jira')
    expect(jira?.authenticated).toBeNull()
    expect(jira?.authError).toBeNull()
  })
})
