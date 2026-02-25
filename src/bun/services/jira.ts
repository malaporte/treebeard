import type { JiraIssue } from '../../shared/types'

export async function getJiraIssue(issueKey: string): Promise<JiraIssue | null> {
  try {
    const proc = Bun.spawn(['jira', 'issue', 'view', issueKey, '--raw'], {
      stdout: 'pipe',
      stderr: 'pipe'
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
      url: `${getJiraBaseUrl(data.self)}browse/${data.key}`
    }
  } catch {
    return null
  }
}

function getJiraBaseUrl(selfUrl: string): string {
  try {
    const url = new URL(selfUrl)
    return `${url.protocol}//${url.host}/`
  } catch {
    return ''
  }
}
