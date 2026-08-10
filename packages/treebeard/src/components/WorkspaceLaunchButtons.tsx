import { useEffect, useState } from 'react'
import { ActionIcon, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconGhost } from '@tabler/icons-react'
import { KiroCrewIcon } from './KiroCrewIcon'
import { rpc } from '../rpc'

interface WorkspaceLaunchButtonsProps {
  workspacePath: string
}

export function WorkspaceLaunchButtons({ workspacePath }: WorkspaceLaunchButtonsProps) {
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
    return () => { cancelled = true }
  }, [])

  const handleGhostty = async () => {
    await rpc().request['launch:ghostty']({ worktreePath: workspacePath })
  }

  const handleKiroCrew = async () => {
    setKiroCrewLoading(true)
    setKiroCrewError(null)
    try {
      const result = await rpc().request['launch:kiroCrew']({ worktreePath: workspacePath })
      if (!result.success) setKiroCrewError(result.error ?? 'Kiro Crew could not open this workspace.')
    } catch {
      setKiroCrewError('Kiro Crew could not open this workspace.')
    } finally {
      setKiroCrewLoading(false)
    }
  }

  return (
    <Stack gap={2} align="flex-end">
      <Group gap={4}>
        <Tooltip label="Open Ghostty terminal for this workspace">
          <ActionIcon variant="subtle" color="violet" size="sm" onClick={handleGhostty}>
            <IconGhost size={16} />
          </ActionIcon>
        </Tooltip>
        {kiroCrewAvailable && (
          <Tooltip label="Open Kiro Crew for this workspace">
            <ActionIcon variant="subtle" color="cyan" size="sm" loading={kiroCrewLoading} onClick={handleKiroCrew}>
              <KiroCrewIcon size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      {kiroCrewError && <Text size="xs" c="pink" ta="right">{kiroCrewError}</Text>}
    </Stack>
  )
}
