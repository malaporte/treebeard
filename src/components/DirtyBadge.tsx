import { Group, Loader, Text, Tooltip } from '@mantine/core'
import type { WorktreeStatus } from '../../electron/types'

interface DirtyBadgeProps {
  status: WorktreeStatus | null
  loading: boolean
}

export function DirtyBadge({ status, loading }: DirtyBadgeProps) {
  if (loading) {
    return <Loader size={10} color="gray" />
  }

  const hasContent =
    status &&
    (status.linesAdded > 0 ||
      status.linesDeleted > 0 ||
      status.unpushedCommits > 0 ||
      status.unpulledCommits > 0)

  if (!hasContent) {
    return null
  }

  const tooltipParts = [
    status.linesAdded > 0 ? `${status.linesAdded} lines added` : null,
    status.linesDeleted > 0 ? `${status.linesDeleted} lines deleted` : null,
    status.unpushedCommits > 0 ? `${status.unpushedCommits} unpushed` : null,
    status.unpulledCommits > 0 ? `${status.unpulledCommits} unpulled` : null,
  ].filter(Boolean).join(', ')

  return (
    <Tooltip label={tooltipParts}>
      <Group gap={4} wrap="nowrap" style={{ cursor: 'default' }}>
        {status.linesAdded > 0 && (
          <Text size="xs" fw={600} c="teal">+{status.linesAdded}</Text>
        )}
        {status.linesDeleted > 0 && (
          <Text size="xs" fw={600} c="red">-{status.linesDeleted}</Text>
        )}
        {status.unpushedCommits > 0 && (
          <Text size="xs" fw={600} c="yellow">↑{status.unpushedCommits}</Text>
        )}
        {status.unpulledCommits > 0 && (
          <Text size="xs" fw={600} c="cyan">↓{status.unpulledCommits}</Text>
        )}
      </Group>
    </Tooltip>
  )
}
