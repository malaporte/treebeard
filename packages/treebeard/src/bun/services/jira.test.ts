import { describe, expect, it, vi } from 'vitest'
import { getJiraIssue } from './jira'
import { setBunSpawnQueue } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

describe('jira service', () => {
  it('parses issue fields and computes browse URL', async () => {
    setBunSpawnQueue([
      {
        stdout: JSON.stringify({
          key: 'TB-22',
          self: 'https://acme.atlassian.net/rest/api/2/issue/TB-22',
          fields: {
            summary: 'Fix worktree delete flow',
            status: { name: 'In Progress' },
            assignee: { displayName: 'Frodo Baggins' },
            issuetype: { name: 'Task' }
          }
        })
      }
    ])

    await expect(getJiraIssue('TB-22')).resolves.toEqual({
      key: 'TB-22',
      summary: 'Fix worktree delete flow',
      status: 'In Progress',
      assignee: 'Frodo Baggins',
      issueType: 'Task',
      url: 'https://acme.atlassian.net/browse/TB-22'
    })
  })

  it('returns null for non-zero exit or invalid payload', async () => {
    setBunSpawnQueue([{ stderr: 'not found', exitCode: 1 }])
    await expect(getJiraIssue('TB-404')).resolves.toBeNull()

    setBunSpawnQueue([{ stdout: 'not-json' }])
    await expect(getJiraIssue('TB-22')).resolves.toBeNull()
  })
})
