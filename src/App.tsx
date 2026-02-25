import { useState, useEffect } from 'react'
import {
  MantineProvider,
  AppShell,
  ActionIcon,
  Loader,
  Text,
  TextInput,
  Stack,
  Group,
  createTheme
} from '@mantine/core'
import { IconSettings, IconSearch, IconX } from '@tabler/icons-react'
import { RepoDashboard } from './components/RepoDashboard'
import { SettingsModal } from './components/SettingsModal'
import { useConfig } from './hooks/useConfig'
import { rpc } from './rpc'

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
  const { config, loading, addRepo, removeRepo, setPollInterval, reorderRepos } = useConfig()
  const [settingsOpened, setSettingsOpened] = useState(false)
  const [search, setSearch] = useState('')

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
          <RepoDashboard
            repos={config.repositories}
            pollIntervalSec={config.pollIntervalSec}
            search={search}
            onReorder={reorderRepos}
          />
        </AppShell.Main>
      </AppShell>

      <SettingsModal
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        config={config}
        onAddRepo={addRepo}
        onRemoveRepo={removeRepo}
        onSetPollInterval={setPollInterval}
      />
    </MantineProvider>
  )
}
