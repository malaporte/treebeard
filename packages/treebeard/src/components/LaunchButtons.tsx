import { useState } from 'react'
import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { IconBrandVscode, IconGhost, IconSparkles } from '@tabler/icons-react'
import { rpc } from '../rpc'

interface LaunchButtonsProps {
  worktreePath: string
}

export function LaunchButtons({ worktreePath }: LaunchButtonsProps) {
  const [launchingCodexDesktop, setLaunchingCodexDesktop] = useState(false)

  const handleVSCode = async () => {
    await rpc().request['launch:vscode']({ worktreePath })
  }

  const handleGhostty = async () => {
    await rpc().request['launch:ghostty']({ worktreePath })
  }

  const handleCodexDesktop = async () => {
    setLaunchingCodexDesktop(true)
    try {
      await rpc().request['launch:codexDesktop']({ worktreePath })
    } finally {
      setLaunchingCodexDesktop(false)
    }
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
      <Tooltip label="Open Codex desktop app">
        <ActionIcon
          variant="subtle"
          color="orange"
          size="sm"
          onClick={handleCodexDesktop}
          loading={launchingCodexDesktop}
          disabled={launchingCodexDesktop}
        >
          <IconSparkles size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
