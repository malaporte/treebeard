import { getShellEnv } from './shell-env'
import type { JiraIssue } from '../../shared/types'

const TWG_TIMEOUT_MS = 15000
const ISSUE_FIELDS = 'summary,status,assignee,issuetype'
const MY_ISSUES_JQL = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
const MY_ISSUES_LIMIT = '100'

interface TwgIssue {
  key?: string
  summary?: string
  url?: string
  status?: { name?: string }
  assignee?: { displayName?: string } | null
  issuetype?: { name?: string }
  issueType?: { name?: string }
}

// twg wraps JSON in a YAML envelope when it detects an agent caller, so the summary is always disabled.
async function runTwg(args: string[]): Promise<unknown | null> {
  const env = await getShellEnv()
  const proc = Bun.spawn(['twg', ...args, '-o', 'json', '--output-summary', 'none'], {
    stdout: 'pipe',
    stderr: 'pipe',
    env
  })

  const timer = setTimeout(() => proc.kill(), TWG_TIMEOUT_MS)
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  clearTimeout(timer)

  if (exitCode !== 0) return null
  return JSON.parse(stdout)
}

function toJiraIssue(item: TwgIssue): JiraIssue | null {
  if (!item.key) return null
  return {
    key: item.key,
    summary: item.summary || '',
    status: item.status?.name || 'Unknown',
    assignee: item.assignee?.displayName || null,
    issueType: item.issuetype?.name || item.issueType?.name || 'Unknown',
    url: item.url || ''
  }
}

/** Fetch all open Jira issues assigned to the current user. */
export async function getMyJiraIssues(): Promise<JiraIssue[]> {
  try {
    const result = await runTwg([
      'jira', 'workitem', 'query',
      '--jql', MY_ISSUES_JQL,
      '--limit', MY_ISSUES_LIMIT,
      '--fields', ISSUE_FIELDS
    ]) as { data?: { issues?: TwgIssue[] } } | null

    const issues = result?.data?.issues
    if (!Array.isArray(issues)) return []

    return issues
      .map(toJiraIssue)
      .filter((issue): issue is JiraIssue => issue !== null)
  } catch {
    return []
  }
}

/** Fetch a single Jira issue by key. */
export async function getJiraIssue(issueKey: string): Promise<JiraIssue | null> {
  try {
    const result = await runTwg([
      'jira', 'workitem', 'get', issueKey,
      '--fields', ISSUE_FIELDS
    ]) as { data?: TwgIssue[] } | null

    const item = Array.isArray(result?.data) ? result.data[0] : null
    return item ? toJiraIssue(item) : null
  } catch {
    return null
  }
}
