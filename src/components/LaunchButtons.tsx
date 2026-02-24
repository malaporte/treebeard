import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { IconBrandVscode, IconGhost, IconRobot } from '@tabler/icons-react'
import { rpc } from '../rpc'

interface LaunchButtonsProps {
  worktreePath: string
}

export function LaunchButtons({ worktreePath }: LaunchButtonsProps) {
  const handleVSCode = async () => {
    await rpc().request['launch:vscode']({ worktreePath })
  }

  const handleGhostty = async () => {
    await rpc().request['launch:ghostty']({ worktreePath })
  }

  const handleOpenCode = async () => {
    await rpc().request['launch:opencode']({ worktreePath })
  }

  return (
    <Group gap={4}>
      <Tooltip label="Open in VS Code">
        <ActionIcon variant="subtle" color="neon" size="sm" onClick={handleVSCode}>
          <IconBrandVscode size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Open Ghostty terminal">
        <ActionIcon variant="subtle" color="violet" size="sm" onClick={handleGhostty}>
          <IconGhost size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Open in OpenCode">
        <ActionIcon variant="subtle" color="cyan" size="sm" onClick={handleOpenCode}>
          <IconRobot size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
