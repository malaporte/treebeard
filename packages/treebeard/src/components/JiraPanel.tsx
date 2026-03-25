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
  onResize: (width: number) => void
}

export function JiraPanel({ issues, loading, onRefresh, draggingKey, onIssueMouseDown, onResize }: JiraPanelProps) {
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = (e.currentTarget as HTMLElement).parentElement!.offsetWidth

    const onMove = (me: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(600, startWidth - (me.clientX - startX)))
      onResize(newWidth)
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          cursor: 'ew-resize',
          zIndex: 10
        }}
      />
      <Group justify="space-between" align="center" px="xs" pt="xs" style={{ flexShrink: 0 }}>
        <Text size="xs" fw={600} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          My Issues
        </Text>
        <ActionIcon variant="subtle" color="neon" size="sm" onClick={onRefresh} loading={loading}>
          <IconRefresh size={14} />
        </ActionIcon>
      </Group>

      <ScrollArea scrollbars="y" style={{ flex: 1, minHeight: 0 }} px="xs" pb="xs">
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
