import { Badge, Loader, Tooltip, Group } from '@mantine/core'
import {
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconGitPullRequest
} from '@tabler/icons-react'
import type { PRInfo } from '../../electron/types'

interface PRBadgeProps {
  pr: PRInfo | null
  loading: boolean
}

const CI_ICON = {
  SUCCESS: <IconCircleCheck size={12} />,
  FAILURE: <IconCircleX size={12} />,
  PENDING: <IconClock size={12} />
}

const CI_COLOR = {
  SUCCESS: 'teal',
  FAILURE: 'pink',
  PENDING: 'yellow'
}

const STATE_COLOR = {
  OPEN: 'cyan',
  CLOSED: 'pink',
  MERGED: 'violet'
}

export function PRBadge({ pr, loading }: PRBadgeProps) {
  if (loading) {
    return (
      <Badge variant="light" color="gray" size="sm" leftSection={<Loader size={10} />}>
        PR...
      </Badge>
    )
  }

  if (!pr) {
    return (
      <Badge variant="light" color="gray" size="sm">
        No PR
      </Badge>
    )
  }

  return (
    <Group gap={4}>
      <Tooltip label={`${pr.title}${pr.isDraft ? ' (Draft)' : ''}`} multiline maw={300}>
        <Badge
          variant="light"
          color={STATE_COLOR[pr.state]}
          size="sm"
          leftSection={<IconGitPullRequest size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={() => window.open(pr.url, '_blank')}
        >
          #{pr.number} {pr.state.toLowerCase()}
          {pr.isDraft ? ' (draft)' : ''}
        </Badge>
      </Tooltip>

      {pr.ciStatus && (
        <Tooltip label={`CI: ${pr.ciStatus === 'FAILURE' ? `${pr.ciFailed} failed of ${pr.ciTotal}` : pr.ciStatus.toLowerCase()}`}>
          <Badge variant="light" color={CI_COLOR[pr.ciStatus]} size="sm" leftSection={CI_ICON[pr.ciStatus]}>
            {pr.ciStatus === 'FAILURE' ? `${pr.ciFailed}/${pr.ciTotal}` : 'CI'}
          </Badge>
        </Tooltip>
      )}
    </Group>
  )
}
