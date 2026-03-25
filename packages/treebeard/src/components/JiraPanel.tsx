import { Stack, Text, Group, ActionIcon, Loader, ScrollArea } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { JiraIssueCard } from './JiraIssueCard'
import type { JiraIssue } from '../shared/types'
import type { JiraIssueDragData } from './JiraIssueCard'

interface JiraPanelProps {
  issues: JiraIssue[]
  loading: boolean
  onRefresh: () => void
  draggingKey: string | null
  onIssueMouseDown: (e: React.MouseEvent, data: JiraIssueDragData) => void
}

export function JiraPanel({ issues, loading, onRefresh, draggingKey, onIssueMouseDown }: JiraPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Group justify="space-between" align="center" px="xs" pt="xs" style={{ flexShrink: 0 }}>
        <Text size="xs" fw={600} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          My Issues
        </Text>
        <ActionIcon variant="subtle" color="neon" size="sm" onClick={onRefresh} loading={loading}>
          <IconRefresh size={14} />
        </ActionIcon>
      </Group>

      <ScrollArea style={{ flex: 1, minHeight: 0 }} px="xs" pb="xs">
        {loading && issues.length === 0 ? (
          <Group justify="center" pt="xl">
            <Loader size="sm" color="neon" />
          </Group>
        ) : issues.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" pt="xl">
            No open issues assigned to you
          </Text>
        ) : (
          <Stack gap="xs">
            {issues.map((issue) => (
              <JiraIssueCard
                key={issue.key}
                issue={issue}
                isDragging={draggingKey === issue.key}
                onMouseDown={onIssueMouseDown}
              />
            ))}
          </Stack>
        )}
      </ScrollArea>
    </div>
  )
}
