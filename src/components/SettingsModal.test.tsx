import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from './SettingsModal'
import { renderWithMantine } from '../test/render'
import type { AppConfig, DependencyStatus } from '../shared/types'

const systemDependenciesRequest = vi.fn()
const openDirectoryRequest = vi.fn()
const checkForUpdatesRequest = vi.fn()
const codexGetStatusRequest = vi.fn()
const codexSetEnabledRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'system:dependencies': systemDependenciesRequest,
      'dialog:openDirectory': openDirectoryRequest,
      'app:checkForUpdates': checkForUpdatesRequest,
      'codex:getStatus': codexGetStatusRequest,
      'codex:setEnabled': codexSetEnabledRequest
    }
  })
}))

vi.mock('../hooks/useHomedir', () => ({
  useHomedir: () => ({
    shortenPath: (value: string) => value
  })
}))

const config: AppConfig = {
  repositories: [{ id: 'repo-1', name: 'treebeard', path: '/repo' }],
  pollIntervalSec: 60,
  autoUpdateEnabled: true,
  updateCheckIntervalMin: 30,
  collapsedRepos: [],
  codexServerEnabled: false,
  desktopCodexPaneWidth: 420
}

describe('SettingsModal', () => {
  beforeEach(() => {
    systemDependenciesRequest.mockReset()
    openDirectoryRequest.mockReset()
    checkForUpdatesRequest.mockReset()
    codexGetStatusRequest.mockReset()
    codexSetEnabledRequest.mockReset()

    codexGetStatusRequest.mockResolvedValue({
      enabled: false,
      running: false,
      pid: null,
      error: null
    })
    codexSetEnabledRequest.mockResolvedValue({
      enabled: true,
      running: true,
      pid: 4096,
      error: null
    })
  })

  it('loads dependency status and notifies parent', async () => {
    const status: DependencyStatus = {
      checkedAt: new Date().toISOString(),
      checks: [
        {
          name: 'gh',
          required: true,
          installed: false,
          authenticated: null,
          version: null,
          error: 'missing',
          authError: null
        },
        {
          name: 'jira',
          required: true,
          installed: true,
          authenticated: true,
          version: 'jira version',
          error: null,
          authError: null
        }
      ]
    }
    systemDependenciesRequest.mockResolvedValue(status)

    const onDependencyStatusChange = vi.fn()

    renderWithMantine(
      <SettingsModal
        opened={true}
        onClose={() => {}}
        config={config}
        onDependencyStatusChange={onDependencyStatusChange}
        onAddRepo={async () => {}}
        onRemoveRepo={async () => {}}
        onSetPollInterval={async () => {}}
        onSetAutoUpdateEnabled={async () => {}}
        onSetUpdateCheckInterval={async () => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dependencies' }))

    await waitFor(() => {
      expect(screen.getByText('Missing required CLIs')).toBeTruthy()
      expect(screen.getByText('gh')).toBeTruthy()
      expect(onDependencyStatusChange).toHaveBeenCalledWith(status)
    })
  })

  it('adds repository with trimmed fields and checks for updates', async () => {
    systemDependenciesRequest.mockResolvedValue({
      checkedAt: new Date().toISOString(),
      checks: []
    })
    checkForUpdatesRequest.mockResolvedValue({
      success: true,
      updateAvailable: false
    })

    const onAddRepo = vi.fn(async () => {})

    renderWithMantine(
      <SettingsModal
        opened={true}
        onClose={() => {}}
        config={config}
        onDependencyStatusChange={() => {}}
        onAddRepo={onAddRepo}
        onRemoveRepo={async () => {}}
        onSetPollInterval={async () => {}}
        onSetAutoUpdateEnabled={async () => {}}
        onSetUpdateCheckInterval={async () => {}}
      />
    )

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  new-repo  ' } })
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: '  /tmp/new-repo  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(onAddRepo).toHaveBeenCalledWith('new-repo', '/tmp/new-repo')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Updates' }))
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates now' }))

    await waitFor(() => {
      expect(screen.getByText('You are on the latest version.')).toBeTruthy()
    })
  })

  it('shows and updates codex controls', async () => {
    systemDependenciesRequest.mockResolvedValue({
      checkedAt: new Date().toISOString(),
      checks: []
    })

    renderWithMantine(
      <SettingsModal
        opened={true}
        onClose={() => {}}
        config={config}
        onDependencyStatusChange={() => {}}
        onAddRepo={async () => {}}
        onRemoveRepo={async () => {}}
        onSetPollInterval={async () => {}}
        onSetAutoUpdateEnabled={async () => {}}
        onSetUpdateCheckInterval={async () => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Enable Codex sessions from Treebeard')).toBeTruthy()
    })

    fireEvent.click(screen.getByLabelText('Enable Codex sessions from Treebeard'))

    await waitFor(() => {
      expect(codexSetEnabledRequest).toHaveBeenCalledWith({ enabled: true })
      expect(screen.getByText(/Status: Running/)).toBeTruthy()
    })
  })
})
