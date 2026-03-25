import { getShellEnv } from './shell-env'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { JiraIssue } from '../../shared/types'

const DONE_STATUSES = new Set(['done', 'closed', 'resolved', 'completed', 'cancelled', 'canceled', 'rejected'])

/** Fetch all open Jira issues assigned to the current user. */
export async function getMyJiraIssues(): Promise<JiraIssue[]> {
  try {
    const env = await getShellEnv()
    const me = await getJiraMe(env)
    if (!me) return []

    const proc = Bun.spawn([
      'jira', 'issue', 'list',
      `--assignee=${me}`,
      '-qproject IS NOT EMPTY',
      '--paginate', '0:100',
      '--raw'
    ], {
      stdout: 'pipe',
      stderr: 'pipe',
      env
    })

    const timer = setTimeout(() => proc.kill(), 15000)
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    clearTimeout(timer)

    if (exitCode !== 0) return []

    const data = JSON.parse(stdout)
    if (!Array.isArray(data)) return []

    return data
      .filter((item) => {
        const status: string = item.fields?.status?.name ?? ''
        return !DONE_STATUSES.has(status.toLowerCase())
      })
      .map((item) => ({
        key: item.key,
        summary: item.fields?.summary || '',
        status: item.fields?.status?.name || 'Unknown',
        assignee: item.fields?.assignee?.displayName || null,
        issueType: item.fields?.issueType?.name || item.fields?.issuetype?.name || 'Unknown',
        url: `${getJiraBaseUrl()}browse/${item.key}`
      }))
  } catch {
    return []
  }
}

async function getJiraMe(env: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    const proc = Bun.spawn(['jira', 'me'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env
    })
    const timer = setTimeout(() => proc.kill(), 5000)
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    clearTimeout(timer)
    if (exitCode !== 0) return null
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function getJiraIssue(issueKey: string): Promise<JiraIssue | null> {
  try {
    const env = await getShellEnv()
    const proc = Bun.spawn(['jira', 'issue', 'view', issueKey, '--raw'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env
    })

    const timer = setTimeout(() => proc.kill(), 15000)
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    clearTimeout(timer)

    if (exitCode !== 0) return null

    const data = JSON.parse(stdout)
    const fields = data.fields

    return {
      key: data.key,
      summary: fields.summary || '',
      status: fields.status?.name || 'Unknown',
      assignee: fields.assignee?.displayName || null,
      issueType: fields.issuetype?.name || 'Unknown',
      url: `${getJiraBaseUrl()}browse/${data.key}`
    }
  } catch {
    return null
  }
}

function getJiraBaseUrl(): string {
  try {
    const config = readFileSync(join(homedir(), '.config', '.jira', '.config.yml'), 'utf-8')
    const match = config.match(/^server:\s*(.+)$/m)
    const server = match?.[1]?.trim()
    return server ? (server.endsWith('/') ? server : `${server}/`) : ''
  } catch {
    return ''
  }
}
