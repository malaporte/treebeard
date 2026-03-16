import { useState } from 'react'
import { ActionIcon, Box, Group, Loader, Popover, Text, Tooltip } from '@mantine/core'
import { IconActivity, IconBox, IconBoxOff, IconInfoCircle } from '@tabler/icons-react'
import type { SandboxState, SandboxStatus } from '../shared/types'

interface SandboxIndicatorProps {
  status: SandboxStatus | null
  loading: boolean
  onStart: () => void
  onStop: () => void
  onOpenMonitor: () => void
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

export function SandboxIndicator({ status, loading, onStart, onStop, onOpenMonitor }: SandboxIndicatorProps) {
  const [logOpened, setLogOpened] = useState(false)
  const state = status?.state ?? 'stopped'
  const transitioning = state === 'starting' || state === 'stopping'
  const color = STATE_COLOR[state]
  const label = status?.error ? `${STATE_LABEL[state]}: ${status.error}` : STATE_LABEL[state]
  const hasLog = status?.log && status.log.length > 0

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
    <Group gap={2}>
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

      {state === 'running' && (
        <Tooltip label="Open sandbox monitor">
          <ActionIcon
            variant="subtle"
            color="teal"
            size="sm"
            onClick={onOpenMonitor}
          >
            <IconActivity size={14} />
          </ActionIcon>
        </Tooltip>
      )}

      {state === 'error' && hasLog && (
        <Popover
          opened={logOpened}
          onChange={setLogOpened}
          width={480}
          position="bottom-end"
          shadow="lg"
          withArrow
        >
          <Popover.Target>
            <Tooltip label="View sandbox log">
              <ActionIcon
                variant="subtle"
                color="pink"
                size="sm"
                onClick={() => setLogOpened((prev) => !prev)}
              >
                <IconInfoCircle size={14} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            {status?.error && (
              <Text size="xs" c="pink" fw={600} mb={4}>
                {status.error}
              </Text>
            )}
            <Box
              style={{
                maxHeight: 240,
                overflow: 'auto',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 4,
                padding: 8
              }}
            >
              <Text
                size="xs"
                ff="monospace"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'text' }}
              >
                {status?.log?.join('\n') ?? ''}
              </Text>
            </Box>
          </Popover.Dropdown>
        </Popover>
      )}
    </Group>
  )
}
