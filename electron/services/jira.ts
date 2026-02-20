import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { JiraIssue } from '../types'

const execFileAsync = promisify(execFile)

export async function getJiraIssue(issueKey: string): Promise<JiraIssue | null> {
  try {
    const { stdout } = await execFileAsync('jira', ['issue', 'view', issueKey, '--raw'], {
      timeout: 15000
    })

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
