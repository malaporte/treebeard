import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
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
  Switch,
  Alert
} from '@mantine/core'
import { IconTrash, IconPlus, IconFolderOpen, IconCheck, IconX, IconRefresh } from '@tabler/icons-react'
import { useHomedir } from '../hooks/useHomedir'
import { rpc } from '../rpc'
import type {
  AppConfig,
  DependencyStatus,
  MobileBridgeStatus,
  MobilePairingInfo,
  RepoConfig
} from '../shared/types'

interface SettingsModalProps {
  opened: boolean
  onClose: () => void
  config: AppConfig
  onDependencyStatusChange: (status: DependencyStatus | null) => void
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
  onDependencyStatusChange,
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
  const [dependencyStatus, setDependencyStatus] = useState<DependencyStatus | null>(null)
  const [checkingDependencies, setCheckingDependencies] = useState(false)
  const [mobileBridgeStatus, setMobileBridgeStatus] = useState<MobileBridgeStatus | null>(null)
  const [mobileBridgeBusy, setMobileBridgeBusy] = useState(false)
  const [mobilePairingInfo, setMobilePairingInfo] = useState<MobilePairingInfo | null>(null)
  const [mobilePairingQr, setMobilePairingQr] = useState<string | null>(null)
  const { shortenPath } = useHomedir()

  const loadDependencies = async (refresh: boolean) => {
    setCheckingDependencies(true)
    try {
      const status = await rpc().request['system:dependencies']({ refresh })
      setDependencyStatus(status)
      onDependencyStatusChange(status)
    } catch {
      setDependencyStatus(null)
      onDependencyStatusChange(null)
    } finally {
      setCheckingDependencies(false)
    }
  }

  const loadMobileBridgeStatus = async () => {
    setMobileBridgeBusy(true)
    try {
      const status = await rpc().request['mobile:getStatus']({})
      setMobileBridgeStatus(status)
    } catch {
      setMobileBridgeStatus(null)
    } finally {
      setMobileBridgeBusy(false)
    }
  }

  useEffect(() => {
    if (!opened) return
    loadDependencies(false)
    loadMobileBridgeStatus()
  }, [opened])

  const handleMobileBridgeEnabledChange = async (enabled: boolean) => {
    setMobileBridgeBusy(true)
    try {
      const status = await rpc().request['mobile:setEnabled']({ enabled })
      setMobileBridgeStatus(status)
    } catch {
      // Keep existing status if RPC fails
    } finally {
      setMobileBridgeBusy(false)
    }
  }

  const handleRotatePairingCode = async () => {
    setMobileBridgeBusy(true)
    try {
      const status = await rpc().request['mobile:rotatePairingCode']({})
      setMobileBridgeStatus(status)
    } catch {
      // Keep existing status if RPC fails
    } finally {
      setMobileBridgeBusy(false)
    }
  }

  const handleCreatePairingQr = async () => {
    setMobileBridgeBusy(true)
    try {
      const pairingInfo = await rpc().request['mobile:createPairingToken']({})
      setMobilePairingInfo(pairingInfo)
      const qrDataUrl = await QRCode.toDataURL(pairingInfo.deepLink, {
        margin: 1,
        scale: 5,
        color: {
          dark: '#0f1115',
          light: '#f8fafc'
        }
      })
      setMobilePairingQr(qrDataUrl)
    } catch {
      setMobilePairingInfo(null)
      setMobilePairingQr(null)
    } finally {
      setMobileBridgeBusy(false)
    }
  }

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

  const missingDependencies = dependencyStatus
    ? dependencyStatus.checks.filter((check) => check.required && !check.installed)
    : []

  const unauthenticatedDependencies = dependencyStatus
    ? dependencyStatus.checks.filter((check) => check.required && check.installed && check.authenticated === false)
    : []

  const unknownAuthDependencies = dependencyStatus
    ? dependencyStatus.checks.filter((check) => check.required && check.installed && check.authenticated === null)
    : []

  const dependencySummary = dependencyStatus
    ? dependencyStatus.checks
        .map((check) => {
          if (check.installed) {
            if (check.authenticated === false) {
              return `${check.name}: auth required`
            }
            if (check.authenticated === null) {
              return `${check.name}: ok (auth unknown)`
            }
            return `${check.name}: ready${check.version ? ` (${check.version})` : ''}`
          }
          return `${check.name}: missing`
        })
        .join(' | ')
    : 'Unable to read dependency status.'

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
            Mobile Bridge
          </Text>
          <Stack gap="sm">
            <Switch
              label="Enable LAN bridge for mobile app"
              checked={mobileBridgeStatus?.enabled ?? config.mobileBridge.enabled}
              onChange={(e) => {
                handleMobileBridgeEnabledChange(e.currentTarget.checked)
              }}
              disabled={mobileBridgeBusy}
              size="sm"
            />
            <Group gap="sm" align="center">
              <Button
                size="xs"
                variant="filled"
                onClick={handleCreatePairingQr}
                loading={mobileBridgeBusy}
              >
                Generate pairing QR
              </Button>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconRefresh size={12} />}
                onClick={handleRotatePairingCode}
                loading={mobileBridgeBusy}
              >
                Rotate pairing code
              </Button>
              <Button
                size="xs"
                variant="subtle"
                onClick={loadMobileBridgeStatus}
                loading={mobileBridgeBusy}
              >
                Refresh bridge status
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Pairing code: <Text span c="white" style={{ fontFamily: 'monospace' }}>{mobileBridgeStatus?.pairingCode || 'Unavailable'}</Text>
            </Text>
            <Text size="xs" c="dimmed">
              Status: {mobileBridgeStatus?.running ? 'Running' : 'Stopped'}
              {mobileBridgeStatus ? ` on ${mobileBridgeStatus.host}:${mobileBridgeStatus.port}` : ''}
            </Text>
            {mobilePairingInfo && (
              <Text size="xs" c="dimmed">
                Pairing token expires at {new Date(mobilePairingInfo.expiresAt).toLocaleTimeString()}
              </Text>
            )}
            {mobilePairingQr && (
              <img
                src={mobilePairingQr}
                alt="Mobile pairing QR"
                style={{ width: 180, height: 180, borderRadius: 8 }}
              />
            )}
            {(mobileBridgeStatus?.urls.length ?? 0) > 0 && (
              <Stack gap={2}>
                <Text size="xs" c="dimmed">Connect from mobile:</Text>
                {mobileBridgeStatus?.urls.map((url) => (
                  <Text key={url} size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                    {url}
                  </Text>
                ))}
              </Stack>
            )}
          </Stack>
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

        <Divider />

        <div>
          <Text fw={600} size="sm" mb="xs">
            Dependencies
          </Text>
          <Stack gap="sm">
            {missingDependencies.length > 0 ? (
              <Alert color="yellow" variant="light" title="Missing required CLIs">
                {missingDependencies.map((check) => check.name).join(', ')}
              </Alert>
            ) : unauthenticatedDependencies.length > 0 ? (
              <Alert color="orange" variant="light" title="CLI authentication required">
                {unauthenticatedDependencies.map((check) => check.name).join(', ')}
              </Alert>
            ) : unknownAuthDependencies.length > 0 ? (
              <Alert color="blue" variant="light" title="Auth check unavailable for some CLIs">
                {unknownAuthDependencies.map((check) => check.name).join(', ')}
              </Alert>
            ) : (
              <Alert color="teal" variant="light" title="All required CLIs are available">
                Treebeard can reach required CLIs and auth checks are passing.
              </Alert>
            )}
            <Group gap="sm">
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  loadDependencies(true)
                }}
                loading={checkingDependencies}
              >
                Re-check dependencies
              </Button>
              <Text size="xs" c="dimmed">
                {dependencySummary}
              </Text>
            </Group>
          </Stack>
        </div>
      </Stack>
    </Modal>
  )
}
