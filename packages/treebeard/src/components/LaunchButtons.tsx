import { useEffect, useState } from 'react'
import { ActionIcon, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconCopy, IconGhost } from '@tabler/icons-react'
import { IdeIcon } from './IdeIcon'
import { KiroCrewIcon } from './KiroCrewIcon'
import { IDE_REGISTRY } from '../shared/ide-registry'
import { rpc } from '../rpc'
import type { IdeId } from '../shared/types'

interface LaunchButtonsProps {
  worktreePath: string
  defaultIde: IdeId
}

export function LaunchButtons({ worktreePath, defaultIde }: LaunchButtonsProps) {
  const ide = IDE_REGISTRY[defaultIde]
  const [kiroCrewLoading, setKiroCrewLoading] = useState(false)
  const [kiroCrewError, setKiroCrewError] = useState<string | null>(null)
  const [kiroCrewAvailable, setKiroCrewAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false

    const checkKiroCrewAvailability = async () => {
      try {
        const available = await rpc().request['system:kiroCrewAvailable']({})
        if (!cancelled) setKiroCrewAvailable(available)
      } catch {
        if (!cancelled) setKiroCrewAvailable(false)
      }
    }

    void checkKiroCrewAvailability()

    return () => {
      cancelled = true
    }
  }, [])

  const handleIde = async () => {
    await rpc().request['launch:ide']({ ideId: defaultIde, worktreePath })
  }

  const handleGhostty = async () => {
    await rpc().request['launch:ghostty']({ worktreePath })
  }

  const handleCopyPath = () => {
    void navigator.clipboard.writeText(worktreePath)
  }

  const handleKiroCrew = async () => {
    setKiroCrewLoading(true)
    setKiroCrewError(null)
    try {
      const result = await rpc().request['launch:kiroCrew']({ worktreePath })
      if (!result.success) {
        setKiroCrewError(result.error ?? 'Kiro Crew could not open this worktree.')
      }
    } catch {
      setKiroCrewError('Kiro Crew could not open this worktree.')
    } finally {
      setKiroCrewLoading(false)
    }
  }

  return (
    <Stack gap={2} align="flex-end">
      <Group gap={4}>
        <Tooltip label={`Open in ${ide.label}`}>
          <ActionIcon variant="subtle" color={ide.color} size="sm" onClick={handleIde}>
            <IdeIcon ide={defaultIde} size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Open Ghostty terminal">
          <ActionIcon variant="subtle" color="violet" size="sm" onClick={handleGhostty}>
            <IconGhost size={16} />
          </ActionIcon>
        </Tooltip>
        {kiroCrewAvailable && (
          <Tooltip label="Open Kiro Crew">
            <ActionIcon
              variant="subtle"
              color="cyan"
              size="sm"
              loading={kiroCrewLoading}
              onClick={handleKiroCrew}
            >
              <KiroCrewIcon size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Copy path">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={handleCopyPath}>
            <IconCopy size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {kiroCrewError && <Text size="xs" c="pink" ta="right">{kiroCrewError}</Text>}
    </Stack>
  )
}
