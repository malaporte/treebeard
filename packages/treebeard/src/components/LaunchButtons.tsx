import { useEffect, useState } from 'react'
import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { IconGhost } from '@tabler/icons-react'
import { IdeIcon } from './IdeIcon'
import { OpencodeIcon } from './OpencodeIcon'
import { IDE_REGISTRY } from '../shared/ide-registry'
import { rpc } from '../rpc'
import type { IdeId } from '../shared/types'

interface LaunchButtonsProps {
  worktreePath: string
  defaultIde: IdeId
}

export function LaunchButtons({ worktreePath, defaultIde }: LaunchButtonsProps) {
  const ide = IDE_REGISTRY[defaultIde]
  const [opencodePath, setOpencodePath] = useState<string | null>(null)

  useEffect(() => {
    rpc().request['system:opencodePath']({}).then(setOpencodePath).catch(() => setOpencodePath(null))
  }, [])

  const handleIde = async () => {
    await rpc().request['launch:ide']({ ideId: defaultIde, worktreePath })
  }

  const handleGhostty = async () => {
    await rpc().request['launch:ghostty']({ worktreePath })
  }

  const handleOpencode = async () => {
    await rpc().request['launch:opencode']({ worktreePath })
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
      {opencodePath && (
        <Tooltip label="Open in OpenCode">
          <ActionIcon variant="subtle" size="sm" onClick={handleOpencode}>
          <OpencodeIcon size={16} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  )
}
