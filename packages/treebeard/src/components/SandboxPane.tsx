interface SandboxPaneProps {
  controlUiPort: number
}

/** Leash sandbox control UI embedded via iframe. */
export function SandboxPane({ controlUiPort }: SandboxPaneProps) {
  return (
    <iframe
      src={`http://127.0.0.1:${controlUiPort}`}
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: 'var(--mantine-radius-sm)',
        background: '#1a1a2e',
      }}
    />
  )
}
