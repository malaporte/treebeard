import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function TerminalWindow() {
  const containerRef = useRef<HTMLDivElement>(null)
  const worktreePath = new URLSearchParams(window.location.search).get('worktreePath') ?? ''
  const worktreeName = worktreePath.split('/').filter(Boolean).at(-1) ?? ''

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#0088ff',
        selectionBackground: 'rgba(0, 136, 255, 0.3)'
      },
      fontFamily: 'Menlo, Monaco, monospace',
      fontSize: 15,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    // Use a box so closures always read the current value after the async create resolves
    const ptyIdBox = { current: '' }

    const unsubData = window.treebeard.pty.onData((id, data) => {
      if (id === ptyIdBox.current) term.write(data)
    })
    const unsubExit = window.treebeard.pty.onExit((id) => {
      if (id === ptyIdBox.current) window.close()
    })

    const { cols, rows } = term
    window.treebeard.pty.create(worktreePath, cols, rows).then((id) => {
      ptyIdBox.current = id
    })

    const dataDispose = term.onData((data) => {
      if (ptyIdBox.current) window.treebeard.pty.write(ptyIdBox.current, data)
    })

    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      if (ptyIdBox.current) window.treebeard.pty.resize(ptyIdBox.current, term.cols, term.rows)
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      dataDispose.dispose()
      unsubData()
      unsubExit()
      if (ptyIdBox.current) {
        window.treebeard.pty.close(ptyIdBox.current)
        ptyIdBox.current = ''
      }
      term.dispose()
    }
  }, [worktreePath])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div
        style={{
          height: 40,
          backgroundColor: '#161b22',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          paddingLeft: 72, // Reserve space for traffic lights
          WebkitAppRegion: 'drag',
          userSelect: 'none',
        } as React.CSSProperties}
      >
        <span style={{ color: '#8b949e', fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>
          opencode — {worktreeName}
        </span>
      </div>
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, padding: '6px 8px' }}
      />
    </div>
  )
}
