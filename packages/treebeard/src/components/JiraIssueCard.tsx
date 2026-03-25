import { Box, Text, Badge, Group } from '@mantine/core'
import { rpc } from '../rpc'
import type { JiraIssue } from '../shared/types'

const STATUS_COLORS: Record<string, string> = {
  'To Do': 'gray',
  'Open': 'gray',
  'New': 'gray',
  'In Progress': 'cyan',
  'In Review': 'violet',
  'Done': 'teal',
  'Closed': 'teal',
  'Resolved': 'teal'
}

const TYPE_COLORS: Record<string, string> = {
  'Bug': 'pink',
  'User Story': 'neon',
  'Story': 'neon',
  'Task': 'cyan',
  'Sub-task': 'gray',
  'Epic': 'violet'
}

export interface JiraIssueDragData {
  type: 'jira-issue'
  issueKey: string
  issueSummary: string
}

interface JiraIssueCardProps {
  issue: JiraIssue
  isDragging?: boolean
  onMouseDown?: (e: React.MouseEvent, data: JiraIssueDragData) => void
}

export function JiraIssueCard({ issue, isDragging, onMouseDown }: JiraIssueCardProps) {
  const statusColor = STATUS_COLORS[issue.status] ?? 'gray'
  const typeColor = TYPE_COLORS[issue.issueType] ?? 'gray'

  const dragData: JiraIssueDragData = {
    type: 'jira-issue',
    issueKey: issue.key,
    issueSummary: issue.summary
  }

  return (
    <Box
      p="xs"
      onMouseDown={onMouseDown ? (e) => onMouseDown(e, dragData) : undefined}
      onDoubleClick={() => {
        if (issue.url) rpc().request['launch:url']({ url: issue.url })
      }}
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
        touchAction: 'none',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.04)',
        userSelect: 'none'
      }}
    >
      <Group gap={6} mb={4} wrap="nowrap">
        <Badge size="xs" variant="light" color={typeColor} style={{ flexShrink: 0 }}>
          {issue.issueType}
        </Badge>
        <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', flexShrink: 0 }}>
          {issue.key}
        </Text>
        <Badge size="xs" variant="dot" color={statusColor} style={{ flexShrink: 0, marginLeft: 'auto' }}>
          {issue.status}
        </Badge>
      </Group>
      <Text size="xs" lineClamp={2} style={{ lineHeight: 1.4 }}>
        {issue.summary}
      </Text>
    </Box>
  )
}
