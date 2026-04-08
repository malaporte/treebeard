import { useEffect, useState } from 'react'
import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { IconGhost, IconPrison } from '@tabler/icons-react'
import { IdeIcon } from './IdeIcon'
import { IDE_REGISTRY } from '../shared/ide-registry'
import { rpc } from '../rpc'
import type { IdeId } from '../shared/types'

interface LaunchButtonsProps {
  worktreePath: string
  defaultIde: IdeId
}

export function LaunchButtons({ worktreePath, defaultIde }: LaunchButtonsProps) {
  const ide = IDE_REGISTRY[defaultIde]
  const [pippinPath, setPippinPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadPippinPath = async () => {
      try {
        const result = await rpc().request['system:pippinPath']({})
        if (!cancelled) {
          setPippinPath(result)
        }
      } catch {
        if (!cancelled) {
          setPippinPath(null)
        }
      }
    }

    void loadPippinPath()

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

  const handlePippinShell = async () => {
    await rpc().request['launch:pippinShell']({ worktreePath })
  }

  return (
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
      {pippinPath && (
        <Tooltip label="Open Pippin shell">
          <ActionIcon variant="subtle" color="grape" size="sm" onClick={handlePippinShell}>
            <IconPrison size={16} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  )
}
