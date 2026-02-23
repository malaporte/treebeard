import { useEffect, useRef, useCallback } from 'react'
import { ActionIcon, Group, Text, Box } from '@mantine/core'
import { IconX, IconMinus } from '@tabler/icons-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface OpenCodePanelProps {
  worktreePath: string
  onClose: () => void
}

export function OpenCodePanel({ worktreePath, onClose }: OpenCodePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const unsubDataRef = useRef<(() => void) | null>(null)
  const unsubExitRef = useRef<(() => void) | null>(null)

  const worktreeName = worktreePath.split('/').at(-1) ?? worktreePath

  const handleClose = useCallback(() => {
    if (ptyIdRef.current) {
      window.treebeard.pty.close(ptyIdRef.current)
      ptyIdRef.current = null
    }
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#0088ff',
        selectionBackground: 'rgba(0, 136, 255, 0.3)'
      },
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    const { cols, rows } = term

    // Subscribe to PTY data and exit events before creating the PTY
    const unsubData = window.treebeard.pty.onData((id, data) => {
      if (id === ptyIdRef.current) {
        term.write(data)
      }
    })
    const unsubExit = window.treebeard.pty.onExit((id) => {
      if (id === ptyIdRef.current) {
        ptyIdRef.current = null
        onClose()
      }
    })
    unsubDataRef.current = unsubData
    unsubExitRef.current = unsubExit

    window.treebeard.pty.create(worktreePath, cols, rows).then((id) => {
      ptyIdRef.current = id
    })

    // Forward user keystrokes to the PTY
    const dataDispose = term.onData((data) => {
      if (ptyIdRef.current) {
        window.treebeard.pty.write(ptyIdRef.current, data)
      }
    })

    // Fit terminal on container resize
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      if (ptyIdRef.current) {
        window.treebeard.pty.resize(ptyIdRef.current, term.cols, term.rows)
      }
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      dataDispose.dispose()
      unsubDataRef.current?.()
      unsubExitRef.current?.()
      if (ptyIdRef.current) {
        window.treebeard.pty.close(ptyIdRef.current)
        ptyIdRef.current = null
      }
      term.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worktreePath])

  return (
    <Box
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 420,
        background: '#0d1117',
        borderTop: '1px solid rgba(0, 136, 255, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200
      }}
    >
      {/* Title bar */}
      <Group
        px="sm"
        py={6}
        justify="space-between"
        style={{ borderBottom: '1px solid rgba(0, 136, 255, 0.12)', flexShrink: 0 }}
      >
        <Group gap="xs">
          <IconMinus size={14} color="rgba(0,136,255,0.6)" />
          <Text size="xs" c="dimmed" ff="monospace">
            opencode — {worktreeName}
          </Text>
        </Group>
        <ActionIcon variant="subtle" color="gray" size="xs" onClick={handleClose}>
          <IconX size={12} />
        </ActionIcon>
      </Group>

      {/* Terminal container */}
      <Box
        ref={containerRef}
        style={{ flex: 1, overflow: 'hidden', padding: '4px 8px' }}
      />
    </Box>
  )
}
