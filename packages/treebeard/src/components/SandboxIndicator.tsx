import { ActionIcon, Loader, Tooltip } from '@mantine/core'
import { IconBox, IconBoxOff } from '@tabler/icons-react'
import type { SandboxState, SandboxStatus } from '../shared/types'

interface SandboxIndicatorProps {
  status: SandboxStatus | null
  loading: boolean
  onStart: () => void
  onStop: () => void
}

const STATE_COLOR: Record<SandboxState, string> = {
  stopped: 'gray',
  starting: 'yellow',
  running: 'teal',
  stopping: 'yellow',
  error: 'pink'
}

const STATE_LABEL: Record<SandboxState, string> = {
  stopped: 'Sandbox stopped — click to start',
  starting: 'Sandbox starting...',
  running: 'Sandbox running — click to stop',
  stopping: 'Sandbox stopping...',
  error: 'Sandbox error — click to retry'
}

export function SandboxIndicator({ status, loading, onStart, onStop }: SandboxIndicatorProps) {
  const state = status?.state ?? 'stopped'
  const transitioning = state === 'starting' || state === 'stopping'
  const color = STATE_COLOR[state]
  const label = status?.error ? `${STATE_LABEL[state]}: ${status.error}` : STATE_LABEL[state]

  const handleClick = () => {
    if (loading || transitioning) return
    if (state === 'running') {
      onStop()
    } else {
      onStart()
    }
  }

  const icon = transitioning || loading
    ? <Loader size={14} color={color} />
    : state === 'running'
      ? <IconBox size={16} />
      : <IconBoxOff size={16} />

  return (
    <Tooltip label={label} multiline maw={300}>
      <ActionIcon
        variant="subtle"
        color={color}
        size="sm"
        onClick={handleClick}
        disabled={loading || transitioning}
        style={{
          opacity: loading || transitioning ? 0.6 : 1
        }}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  )
}
