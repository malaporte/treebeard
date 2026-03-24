import { useState } from 'react'
import { Group, Loader, Text, Tooltip } from '@mantine/core'
import { rpc } from '../rpc'
import type { WorktreeStatus } from '../shared/types'

interface DirtyBadgeProps {
  status: WorktreeStatus | null
  loading: boolean
  worktreePath?: string
  onPullComplete?: () => void
}

export function DirtyBadge({ status, loading, worktreePath, onPullComplete }: DirtyBadgeProps) {
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)

  const handlePull = async () => {
    if (!worktreePath || pulling) return
    setPulling(true)
    setPullError(null)
    try {
      const result = await rpc().request['git:pull']({ worktreePath })
      if (result.success) {
        onPullComplete?.()
      } else {
        setPullError(result.error ?? 'Pull failed')
      }
    } catch {
      setPullError('Pull failed')
    } finally {
      setPulling(false)
    }
  }

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
    pullError ? `Pull error: ${pullError}` : null,
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
          pulling
            ? <Loader size={10} color="cyan" />
            : (
              <Text
                size="xs"
                fw={600}
                c={pullError ? 'red' : 'cyan'}
                style={worktreePath ? { cursor: 'pointer' } : undefined}
                onClick={worktreePath ? handlePull : undefined}
              >
                ↓{status.unpulledCommits}
              </Text>
            )
        )}
      </Group>
    </Tooltip>
  )
}
