import { Badge, Loader, Tooltip } from '@mantine/core'
import type { JiraIssue } from '../shared/types'

const STATUS_COLORS: Record<string, string> = {
  'To Do': 'gray',
  'Open': 'gray',
  'In Progress': 'cyan',
  'In Review': 'violet',
  'Done': 'teal',
  'Closed': 'teal',
  'Resolved': 'teal'
}

interface JiraBadgeProps {
  jiraKey: string | null
  issue: JiraIssue | null
  loading: boolean
}

export function JiraBadge({ jiraKey, issue, loading }: JiraBadgeProps) {
  if (!jiraKey) {
    return (
      <Badge variant="light" color="gray" size="sm">
        No JIRA
      </Badge>
    )
  }

  if (loading) {
    return (
      <Badge variant="light" color="gray" size="sm" leftSection={<Loader size={10} />}>
        {jiraKey}
      </Badge>
    )
  }

  if (!issue) {
    return (
      <Badge variant="light" color="pink" size="sm">
        {jiraKey} (not found)
      </Badge>
    )
  }

  const color = STATUS_COLORS[issue.status] ?? 'gray'

  return (
    <Tooltip label={`${issue.summary} — ${issue.status}`} multiline maw={300}>
      <Badge
        variant="light"
        color={color}
        size="sm"
        style={{ cursor: 'pointer' }}
        onClick={() => {
          if (issue.url) window.open(issue.url, '_blank')
        }}
      >
        {issue.key} · {issue.status}
      </Badge>
    </Tooltip>
  )
}
