import { useState, useEffect, useCallback } from 'react'
import {
  MantineProvider,
  AppShell,
  Anchor,
  Box,
  ActionIcon,
  Loader,
  Text,
  TextInput,
  Alert,
  Stack,
  Group,
  createTheme
} from '@mantine/core'
import { IconSettings, IconSearch, IconX, IconTicket } from '@tabler/icons-react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { RepoDashboard } from './components/RepoDashboard'
import { SettingsModal } from './components/SettingsModal'
import { JiraPanel } from './components/JiraPanel'
import { useConfig } from './hooks/useConfig'
import { useMyJiraIssues } from './hooks/useMyJiraIssues'
import { useJiraDrag } from './hooks/useJiraDrag'
import { rpc } from './rpc'
import type { DragEndEvent } from '@dnd-kit/core'
import type { DependencyStatus, RepoConfig } from './shared/types'
import type { JiraIssueDragData } from './components/JiraIssueCard'

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
    glowBlue: '#0088ff',
    glowCyan: '#00e5ff',
    glowViolet: '#b84dff',
    glowPink: '#ff4da6',
    glowGreen: '#00ff88'
  }
})

const INSTALL_URLS: Record<string, string> = {
  gh: 'https://cli.github.com/',
  jira: 'https://github.com/ankitpokhrel/jira-cli'
}

const JIRA_PANEL_WIDTH = 260

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
    setDefaultIde,
    setRepoSetupCommands,
    setJiraPanelOpen
  } = useConfig()
  const [settingsOpened, setSettingsOpened] = useState(false)
  const [search, setSearch] = useState('')
  const [dependencyStatus, setDependencyStatus] = useState<DependencyStatus | null>(null)
  const [jiraDropTargets, setJiraDropTargets] = useState<Record<string, string | null>>({})
  const [orderedRepos, setOrderedRepos] = useState<RepoConfig[]>([])

  const jiraPanelOpen = config?.jiraPanelOpen ?? false
  const pollIntervalSec = config?.pollIntervalSec ?? 60

  const { issues: jiraIssues, loading: jiraLoading, refresh: refreshJira } = useMyJiraIssues(pollIntervalSec)

  // Keep ordered repos in sync with config
  useEffect(() => {
    if (config) setOrderedRepos(config.repositories)
  }, [config])

  // Native mouse drag for Jira issues — works across AppShell panels
  const handleJiraDrop = useCallback((repoId: string, data: JiraIssueDragData) => {
    setJiraDropTargets((prev) => ({ ...prev, [repoId]: `${data.issueKey}-` }))
  }, [])

  const { isDragging: isDraggingJira, draggingKey, overRepoId, onMouseDown: onIssueMouseDown } =
    useJiraDrag(handleJiraDrop)

  // @dnd-kit only for repo section reordering
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedRepos.findIndex((r) => r.id === active.id)
    const newIndex = orderedRepos.findIndex((r) => r.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(orderedRepos, oldIndex, newIndex)
    setOrderedRepos(reordered)
    void reorderRepos(reordered)
  }, [orderedRepos, reorderRepos])

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
      if (e.key === 'q') { e.preventDefault(); rpc().request['app:quit']({}) }
      else if (e.key === 'w') { e.preventDefault(); rpc().request['app:closeWindow']({}) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handleOpenSettings = () => setSettingsOpened(true)
    window.addEventListener('treebeard:open-settings', handleOpenSettings)
    return () => window.removeEventListener('treebeard:open-settings', handleOpenSettings)
  }, [])

  useEffect(() => { loadDependencies() }, [loadDependencies])

  const missingDependencies = dependencyStatus
    ? dependencyStatus.checks.filter((c) => c.required && !c.installed)
    : []

  const unauthenticatedDependencies = dependencyStatus
    ? dependencyStatus.checks.filter((c) => c.required && c.installed && c.authenticated === false)
    : []

  const MISSING_LABELS: Record<string, string> = {
    gh: 'gh CLI missing (PR badges unavailable)',
    jira: 'jira CLI missing (Jira badges unavailable)'
  }

  const authDependencyMessage = unauthenticatedDependencies
    .map((c) => {
      if (c.name === 'gh') return 'gh CLI not authenticated (PR badges unavailable)'
      if (c.name === 'jira') return 'jira CLI not authenticated (Jira badges unavailable)'
      return `${c.name} not authenticated`
    })
    .join(' | ')

  if (loading || !config) {
    return (
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <Stack align="center" justify="center" h="100vh">
          <Loader color="neon" />
          <Text size="sm" c="dimmed">Loading...</Text>
        </Stack>
      </MantineProvider>
    )
  }

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <AppShell
          header={{ height: 38 }}
          aside={jiraPanelOpen ? { width: JIRA_PANEL_WIDTH, breakpoint: 'xs' } : undefined}
          padding="md"
        >
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
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                style={{ width: 220 }}
              />
              <ActionIcon
                variant={jiraPanelOpen ? 'light' : 'subtle'}
                color="neon"
                size="sm"
                onClick={() => setJiraPanelOpen(!jiraPanelOpen)}
                title="Toggle Jira panel"
              >
                <IconTicket size={16} />
              </ActionIcon>
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
            <Box style={{ height: 'calc(100vh - 70px)', overflow: 'auto' }}>
              <Stack gap="md">
                {missingDependencies.length > 0 && (
                  <Alert color="yellow" variant="light" title="Missing CLI dependencies">
                    <Stack gap={4}>
                      {missingDependencies.map((check) => (
                        <Text key={check.name} size="sm">
                          {MISSING_LABELS[check.name] ?? `${check.name} missing`}
                          {INSTALL_URLS[check.name] && (
                            <> — Install from <Anchor href={INSTALL_URLS[check.name]} target="_blank" size="sm">{INSTALL_URLS[check.name]}</Anchor></>
                          )}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                )}
                {unauthenticatedDependencies.length > 0 && (
                  <Alert color="orange" variant="light" title="CLI authentication required">
                    {authDependencyMessage}
                  </Alert>
                )}
                <RepoDashboard
                  repos={orderedRepos}
                  pollIntervalSec={config.pollIntervalSec}
                  search={search}
                  defaultIde={config.defaultIde}
                  onReorder={(repos) => { setOrderedRepos(repos); void reorderRepos(repos) }}
                  isDraggingJira={isDraggingJira}
                  overRepoId={overRepoId}
                  jiraDropTargets={jiraDropTargets}
                  onJiraDropBranchClear={(repoId) =>
                    setJiraDropTargets((prev) => ({ ...prev, [repoId]: null }))
                  }
                />
              </Stack>
            </Box>
          </AppShell.Main>

          {jiraPanelOpen && (
            <AppShell.Aside style={{ borderLeft: '1px solid rgba(0, 136, 255, 0.15)' }}>
              <JiraPanel
                issues={jiraIssues}
                loading={jiraLoading}
                onRefresh={refreshJira}
                draggingKey={draggingKey}
                onIssueMouseDown={onIssueMouseDown}
              />
            </AppShell.Aside>
          )}
        </AppShell>
      </DndContext>

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
        onSetDefaultIde={setDefaultIde}
        onSetRepoSetupCommands={setRepoSetupCommands}
      />
    </MantineProvider>
  )
}
