import { useState } from 'react'
import {
  Modal,
  TextInput,
  Button,
  Stack,
  Group,
  Text,
  ActionIcon,
  Table,
  NumberInput,
  Divider,
  Switch
} from '@mantine/core'
import { IconTrash, IconPlus, IconFolderOpen, IconCheck, IconX } from '@tabler/icons-react'
import { useHomedir } from '../hooks/useHomedir'
import { rpc } from '../rpc'
import type { AppConfig, RepoConfig } from '../shared/types'

interface SettingsModalProps {
  opened: boolean
  onClose: () => void
  config: AppConfig
  onAddRepo: (name: string, path: string) => Promise<void>
  onRemoveRepo: (id: string) => Promise<void>
  onSetPollInterval: (sec: number) => Promise<void>
  onSetAutoUpdateEnabled: (enabled: boolean) => Promise<void>
  onSetUpdateCheckInterval: (minutes: number) => Promise<void>
}

export function SettingsModal({
  opened,
  onClose,
  config,
  onAddRepo,
  onRemoveRepo,
  onSetPollInterval,
  onSetAutoUpdateEnabled,
  onSetUpdateCheckInterval
}: SettingsModalProps) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [pendingDelete, setPendingDelete] = useState<RepoConfig | null>(null)
  const [checkingForUpdates, setCheckingForUpdates] = useState(false)
  const [updateCheckMessage, setUpdateCheckMessage] = useState<string | null>(null)
  const { shortenPath } = useHomedir()

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    await onRemoveRepo(pendingDelete.id)
    setPendingDelete(null)
  }

  const handleAdd = async () => {
    const trimmedName = name.trim()
    const trimmedPath = path.trim()
    if (!trimmedName || !trimmedPath) return

    await onAddRepo(trimmedName, trimmedPath)
    setName('')
    setPath('')
  }

  const handleBrowse = async () => {
    try {
      const selected = await rpc().request['dialog:openDirectory']({})
      if (!selected) return
      setPath(selected)
      // Auto-fill name from directory basename if empty
      if (!name.trim()) {
        const basename = selected.split('/').filter(Boolean).pop() ?? ''
        setName(basename)
      }
    } catch {
      // Native dialog was cancelled or RPC failed
    }
  }

  const handleCheckForUpdates = async () => {
    setCheckingForUpdates(true)
    setUpdateCheckMessage(null)
    try {
      const result = await rpc().request['app:checkForUpdates']({})
      if (!result.success) {
        setUpdateCheckMessage(result.error || 'Unable to check for updates right now.')
      } else if (result.updateAvailable) {
        setUpdateCheckMessage('Update ready. You can restart now or later when prompted.')
      } else {
        setUpdateCheckMessage('You are on the latest version.')
      }
    } catch {
      setUpdateCheckMessage('Unable to check for updates right now.')
    } finally {
      setCheckingForUpdates(false)
    }
  }

  return (
    <Modal opened={opened} onClose={() => { setPendingDelete(null); onClose() }} title="Settings" size="lg">
      <Stack gap="lg">
        <div>
          <Text fw={600} size="sm" mb="xs">
            Repositories
          </Text>
          {config.repositories.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Path</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {config.repositories.map((repo) => (
                  <Table.Tr key={repo.id}>
                    <Table.Td>
                      <Text size="sm" style={{ fontFamily: 'monospace' }}>{repo.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" truncate style={{ maxWidth: 300 }}>
                        {shortenPath(repo.path)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {pendingDelete?.id === repo.id ? (
                        <Group gap={4} wrap="nowrap">
                          <Text size="xs" c="pink">Remove?</Text>
                          <ActionIcon variant="filled" color="pink" size="sm" onClick={handleConfirmDelete}>
                            <IconCheck size={12} />
                          </ActionIcon>
                          <ActionIcon variant="subtle" color="dimmed" size="sm" onClick={() => setPendingDelete(null)}>
                            <IconX size={12} />
                          </ActionIcon>
                        </Group>
                      ) : (
                        <ActionIcon
                          variant="subtle"
                          color="pink"
                          size="sm"
                          onClick={() => setPendingDelete(repo)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              No repositories configured. Add one below.
            </Text>
          )}
        </div>

        <div>
          <Text fw={600} size="sm" mb="xs">
            Add Repository
          </Text>
          <Group align="flex-end">
            <TextInput
              label="Name"
              placeholder="my-repo"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              style={{ flex: 1 }}
              size="sm"
            />
            <TextInput
              label="Path"
              placeholder="/path/to/repo"
              value={path}
              onChange={(e) => setPath(e.currentTarget.value)}
              style={{ flex: 2 }}
              size="sm"
              rightSection={
                <ActionIcon variant="subtle" color="neon" size="sm" onClick={handleBrowse}>
                  <IconFolderOpen size={14} />
                </ActionIcon>
              }
            />
            <Button
              leftSection={<IconPlus size={14} />}
              size="sm"
              onClick={handleAdd}
              disabled={!name.trim() || !path.trim()}
            >
              Add
            </Button>
          </Group>
        </div>

        <Divider />

        <div>
          <Text fw={600} size="sm" mb="xs">
            Polling
          </Text>
          <NumberInput
            label="Refresh interval (seconds)"
            value={config.pollIntervalSec}
            onChange={(val) => {
              if (typeof val === 'number' && val >= 10) {
                onSetPollInterval(val)
              }
            }}
            min={10}
            max={600}
            step={10}
            style={{ maxWidth: 200 }}
            size="sm"
          />
        </div>

        <Divider />

        <div>
          <Text fw={600} size="sm" mb="xs">
            Updates
          </Text>
          <Stack gap="sm">
            <Switch
              label="Automatically check for updates"
              checked={config.autoUpdateEnabled}
              onChange={(e) => {
                onSetAutoUpdateEnabled(e.currentTarget.checked)
              }}
              size="sm"
            />
            <NumberInput
              label="Check interval (minutes)"
              value={config.updateCheckIntervalMin}
              onChange={(val) => {
                if (typeof val === 'number' && val >= 5) {
                  onSetUpdateCheckInterval(val)
                }
              }}
              min={5}
              max={1440}
              step={5}
              style={{ maxWidth: 220 }}
              size="sm"
              disabled={!config.autoUpdateEnabled}
            />
            <Group gap="sm">
              <Button size="xs" variant="light" onClick={handleCheckForUpdates} loading={checkingForUpdates}>
                Check for updates now
              </Button>
              {updateCheckMessage && (
                <Text size="xs" c="dimmed">
                  {updateCheckMessage}
                </Text>
              )}
            </Group>
          </Stack>
        </div>
      </Stack>
    </Modal>
  )
}
