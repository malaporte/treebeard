import { describe, expect, it, vi } from 'vitest'
import { getJiraIssue, getMyJiraIssues } from './jira'
import { setBunSpawnQueue } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

const ISSUE = {
  key: 'TB-22',
  summary: 'Fix worktree delete flow',
  status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
  assignee: { displayName: 'Frodo Baggins' },
  issuetype: { name: 'Task' },
  url: 'https://acme.atlassian.net/browse/TB-22'
}

const EXPECTED = {
  key: 'TB-22',
  summary: 'Fix worktree delete flow',
  status: 'In Progress',
  assignee: 'Frodo Baggins',
  issueType: 'Task',
  url: 'https://acme.atlassian.net/browse/TB-22'
}

describe('jira service', () => {
  it('parses a twg work item', async () => {
    const spawn = setBunSpawnQueue([{ stdout: JSON.stringify({ data: [ISSUE] }) }])

    await expect(getJiraIssue('TB-22')).resolves.toEqual(EXPECTED)
    expect((spawn.mock.calls[0] as unknown as [string[]])[0]).toEqual([
      'twg', 'jira', 'workitem', 'get', 'TB-22',
      '--fields', 'summary,status,assignee,issuetype',
      '-o', 'json', '--output-summary', 'none'
    ])
  })

  it('returns null for non-zero exit, invalid payload, or empty data', async () => {
    setBunSpawnQueue([{ stdout: '{"ok":false}', exitCode: 1 }])
    await expect(getJiraIssue('TB-404')).resolves.toBeNull()

    setBunSpawnQueue([{ stdout: 'not-json' }])
    await expect(getJiraIssue('TB-22')).resolves.toBeNull()

    setBunSpawnQueue([{ stdout: JSON.stringify({ data: [] }) }])
    await expect(getJiraIssue('TB-22')).resolves.toBeNull()
  })

  it('lists open issues assigned to the current user', async () => {
    const unassigned = { ...ISSUE, key: 'TB-23', assignee: null, issuetype: undefined, issueType: { name: 'Bug' } }
    const spawn = setBunSpawnQueue([{ stdout: JSON.stringify({ data: { issues: [ISSUE, unassigned] } }) }])

    await expect(getMyJiraIssues()).resolves.toEqual([
      EXPECTED,
      { ...EXPECTED, key: 'TB-23', assignee: null, issueType: 'Bug' }
    ])

    const [command] = spawn.mock.calls[0] as unknown as [string[]]
    expect(command.slice(0, 4)).toEqual(['twg', 'jira', 'workitem', 'query'])
    expect(command[command.indexOf('--jql') + 1]).toContain('assignee = currentUser()')
    expect(command[command.indexOf('--jql') + 1]).toContain('statusCategory != Done')
    expect(command.slice(-4)).toEqual(['-o', 'json', '--output-summary', 'none'])
  })

  it('returns an empty list when the query fails', async () => {
    setBunSpawnQueue([{ stderr: 'auth required', exitCode: 1 }])
    await expect(getMyJiraIssues()).resolves.toEqual([])

    setBunSpawnQueue([{ stdout: 'not-json' }])
    await expect(getMyJiraIssues()).resolves.toEqual([])
  })
})
