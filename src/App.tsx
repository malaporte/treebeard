import { useState, useEffect, useCallback } from 'react'
import {
  MantineProvider,
  AppShell,
  Box,
  ActionIcon,
  Loader,
  Text,
  TextInput,
  Alert,
  Stack,
  Group,
  Paper,
  createTheme
} from '@mantine/core'
import { IconSettings, IconSearch, IconX } from '@tabler/icons-react'
import { CodexSessionPane } from './components/CodexSessionPane'
import { RepoDashboard } from './components/RepoDashboard'
import { SettingsModal } from './components/SettingsModal'
import { useConfig } from './hooks/useConfig'
import { rpc } from './rpc'
import type { DependencyStatus, Worktree } from './shared/types'

const MIN_CODEX_PANE_WIDTH = 320
const MIN_DASHBOARD_WIDTH = 360

function clampCodexPaneWidth(width: number): number {
  const maxWidth = Math.max(MIN_CODEX_PANE_WIDTH, window.innerWidth - MIN_DASHBOARD_WIDTH)
  return Math.min(Math.max(Math.round(width), MIN_CODEX_PANE_WIDTH), maxWidth)
}

// Neon-blue palette tuned for dark backgrounds
const neon: [string, string, string, string, string, string, string, string, string, string] = [
  '#e0f4ff',
  '#b3e0ff',
  '#80cbff',
  '#4db5ff',
  '#1a9fff',
  '#0088ff',
  '#006cd9',
  '#0050b3',
  '#00368c',
  '#001d66'
]

const theme = createTheme({
  primaryColor: 'neon',
  colors: { neon },
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  headings: { fontFamily: 'Inter, system-ui, -apple-system, sans-serif' },
  other: {
    // Neon glow color tokens for use in inline styles
    glowBlue: '#0088ff',
    glowCyan: '#00e5ff',
    glowViolet: '#b84dff',
    glowPink: '#ff4da6',
    glowGreen: '#00ff88'
  }
})

export default function App() {
  const {
    config,
    loading,
    addRepo,
    removeRepo,
    setPollInterval,
    setAutoUpdateEnabled,
    setUpdateCheckInterval,
    reorderRepos,
    setDesktopCodexPaneWidth,
    setMobileBridgeEnabled
  } = useConfig()
  const [settingsOpened, setSettingsOpened] = useState(false)
  const [search, setSearch] = useState('')
  const [dependencyStatus, setDependencyStatus] = useState<DependencyStatus | null>(null)
  const [selectedCodexWorktree, setSelectedCodexWorktree] = useState<Worktree | null>(null)
  const [codexPaneWidth, setCodexPaneWidth] = useState(420)
  const [resizingCodexPane, setResizingCodexPane] = useState(false)
  const embeddedCodexEnabled = config?.mobileBridge.enabled === true
  const codexPaneOpened = embeddedCodexEnabled && selectedCodexWorktree !== null

  const handleOpenCodex = useCallback((worktree: Worktree) => {
    if (!embeddedCodexEnabled) return
    setSelectedCodexWorktree(worktree)
  }, [embeddedCodexEnabled])

  const loadDependencies = useCallback(async () => {
    try {
      const status = await rpc().request['system:dependencies']({})
      setDependencyStatus(status)
    } catch {
      setDependencyStatus(null)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      if (e.key === 'q') {
        e.preventDefault()
        rpc().request['app:quit']({})
      } else if (e.key === 'w') {
        e.preventDefault()
        rpc().request['app:closeWindow']({})
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handleOpenSettings = () => {
      setSettingsOpened(true)
    }
    window.addEventListener('treebeard:open-settings', handleOpenSettings)
    return () => window.removeEventListener('treebeard:open-settings', handleOpenSettings)
  }, [])

  useEffect(() => {
    loadDependencies()
  }, [loadDependencies])

  useEffect(() => {
    if (!config) return
    setCodexPaneWidth(clampCodexPaneWidth(config.desktopCodexPaneWidth))
  }, [config])

  useEffect(() => {
    if (embeddedCodexEnabled) return
    setSelectedCodexWorktree(null)
  }, [embeddedCodexEnabled])

  useEffect(() => {
    const handleResize = () => {
      setCodexPaneWidth((current) => clampCodexPaneWidth(current))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!resizingCodexPane) return

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = window.innerWidth - event.clientX
      setCodexPaneWidth(clampCodexPaneWidth(nextWidth))
    }

    const handleMouseUp = () => {
      setResizingCodexPane(false)
      void setDesktopCodexPaneWidth(codexPaneWidth)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [codexPaneWidth, resizingCodexPane, setDesktopCodexPaneWidth])

  const missingDependencies = dependencyStatus
    ? dependencyStatus.checks.filter((check) => check.required && !check.installed)
    : []

  const unauthenticatedDependencies = dependencyStatus
    ? dependencyStatus.checks.filter((check) => check.required && check.installed && check.authenticated === false)
    : []

  const missingDependencyMessage = missingDependencies
    .map((check) => {
      if (check.name === 'gh') return 'gh CLI missing (PR badges unavailable)'
      if (check.name === 'jira') return 'jira CLI missing (Jira badges unavailable)'
      return `${check.name} missing`
    })
    .join(' | ')

  const authDependencyMessage = unauthenticatedDependencies
    .map((check) => {
      if (check.name === 'gh') return 'gh CLI not authenticated (PR badges unavailable)'
      if (check.name === 'jira') return 'jira CLI not authenticated (Jira badges unavailable)'
      return `${check.name} not authenticated`
    })
    .join(' | ')

  if (loading || !config) {
    return (
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <Stack align="center" justify="center" h="100vh">
          <Loader color="neon" />
          <Text size="sm" c="dimmed">
            Loading...
          </Text>
        </Stack>
      </MantineProvider>
    )
  }

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
        <AppShell header={{ height: 38 }} padding="md">
        <AppShell.Header
          px="md"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: '1px solid rgba(0, 136, 255, 0.15)'
          }}
          className="electrobun-webkit-app-region-drag"
        >
          <Group gap="xs" className="electrobun-webkit-app-region-no-drag">
            <TextInput
              placeholder="Filter worktrees..."
              size="xs"
              variant="unstyled"
              leftSection={<IconSearch size={14} />}
              rightSection={search ? (
                <ActionIcon variant="subtle" color="neon" size="xs" onClick={() => setSearch('')}>
                  <IconX size={12} />
                </ActionIcon>
              ) : null}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ width: 220 }}
            />
            <ActionIcon
              variant="subtle"
              color="neon"
              size="sm"
              onClick={() => setSettingsOpened(true)}
            >
              <IconSettings size={16} />
            </ActionIcon>
          </Group>
        </AppShell.Header>

        <AppShell.Main>
          <Group gap={0} align="stretch" wrap="nowrap" style={{ height: 'calc(100vh - 70px)' }}>
            <Box
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'auto',
                paddingRight: codexPaneOpened ? 16 : 0
              }}
            >
              <Stack gap="md">
                {missingDependencies.length > 0 && (
                  <Alert color="yellow" variant="light" title="Missing CLI dependencies">
                    {missingDependencyMessage}
                  </Alert>
                )}
                {unauthenticatedDependencies.length > 0 && (
                  <Alert color="orange" variant="light" title="CLI authentication required">
                    {authDependencyMessage}
                  </Alert>
                )}
                <RepoDashboard
                  repos={config.repositories}
                  pollIntervalSec={config.pollIntervalSec}
                  search={search}
                  embeddedCodexEnabled={embeddedCodexEnabled}
                  onReorder={reorderRepos}
                  onOpenCodex={handleOpenCodex}
                />
              </Stack>
            </Box>

            {selectedCodexWorktree && (
              <>
                <Box
                  role="separator"
                  aria-orientation="vertical"
                  onMouseDown={() => setResizingCodexPane(true)}
                  style={{
                    width: 10,
                    cursor: 'col-resize',
                    flexShrink: 0,
                    background: resizingCodexPane ? 'rgba(0, 136, 255, 0.18)' : 'transparent',
                    borderLeft: '1px solid rgba(0, 136, 255, 0.08)',
                    borderRight: '1px solid rgba(0, 136, 255, 0.08)'
                  }}
                />

                <Paper
                  withBorder
                  p="md"
                  radius="md"
                  style={{
                    width: codexPaneWidth,
                    minWidth: MIN_CODEX_PANE_WIDTH,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'linear-gradient(180deg, rgba(0, 136, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%)',
                    borderColor: 'rgba(0, 136, 255, 0.18)'
                  }}
                >
                <CodexSessionPane
                  worktreePath={selectedCodexWorktree.path}
                  branch={selectedCodexWorktree.branch}
                  onClose={() => setSelectedCodexWorktree(null)}
                />
                </Paper>
              </>
            )}
          </Group>
        </AppShell.Main>
      </AppShell>

      <SettingsModal
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        config={config}
        onDependencyStatusChange={setDependencyStatus}
        onAddRepo={addRepo}
        onRemoveRepo={removeRepo}
        onSetPollInterval={setPollInterval}
        onSetAutoUpdateEnabled={setAutoUpdateEnabled}
        onSetUpdateCheckInterval={setUpdateCheckInterval}
        onSetMobileBridgeEnabled={setMobileBridgeEnabled}
      />
    </MantineProvider>
  )
}
