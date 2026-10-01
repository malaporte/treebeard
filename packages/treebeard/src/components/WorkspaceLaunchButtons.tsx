import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { IconGhost } from '@tabler/icons-react'
import { rpc } from '../rpc'

interface WorkspaceLaunchButtonsProps {
  workspacePath: string
}

export function WorkspaceLaunchButtons({ workspacePath }: WorkspaceLaunchButtonsProps) {
  const handleGhostty = async () => {
    await rpc().request['launch:ghostty']({ worktreePath: workspacePath })
  }

  return (
    <Group gap={4}>
      <Tooltip label="Open Ghostty terminal for this workspace">
        <ActionIcon variant="subtle" color="violet" size="sm" onClick={handleGhostty}>
          <IconGhost size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
