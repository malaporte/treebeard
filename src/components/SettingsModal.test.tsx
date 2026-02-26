import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from './SettingsModal'
import { renderWithMantine } from '../test/render'
import type { AppConfig, DependencyStatus } from '../shared/types'

const systemDependenciesRequest = vi.fn()
const openDirectoryRequest = vi.fn()
const checkForUpdatesRequest = vi.fn()
const mobileGetStatusRequest = vi.fn()
const mobileSetEnabledRequest = vi.fn()
const mobileRotatePairingCodeRequest = vi.fn()
const mobileCreatePairingTokenRequest = vi.fn()

const qrcodeToDataUrl = vi.fn()

vi.mock('qrcode', () => ({
  default: {
    toDataURL: (...args: unknown[]) => qrcodeToDataUrl(...args)
  }
}))

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'system:dependencies': systemDependenciesRequest,
      'dialog:openDirectory': openDirectoryRequest,
      'app:checkForUpdates': checkForUpdatesRequest,
      'mobile:getStatus': mobileGetStatusRequest,
      'mobile:setEnabled': mobileSetEnabledRequest,
      'mobile:rotatePairingCode': mobileRotatePairingCodeRequest,
      'mobile:createPairingToken': mobileCreatePairingTokenRequest
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
  opencodeServers: {},
  mobileBridge: {
    enabled: false,
    host: '0.0.0.0',
    port: 8787,
    pairingCode: '123456'
  }
}

describe('SettingsModal', () => {
  beforeEach(() => {
    systemDependenciesRequest.mockReset()
    openDirectoryRequest.mockReset()
    checkForUpdatesRequest.mockReset()
    mobileGetStatusRequest.mockReset()
    mobileSetEnabledRequest.mockReset()
    mobileRotatePairingCodeRequest.mockReset()
    mobileCreatePairingTokenRequest.mockReset()
    qrcodeToDataUrl.mockReset()

    mobileGetStatusRequest.mockResolvedValue({
      enabled: false,
      running: false,
      host: '0.0.0.0',
      port: 8787,
      pairingCode: '123456',
      urls: ['http://localhost:8787']
    })
    mobileSetEnabledRequest.mockImplementation(async ({ enabled }: { enabled: boolean }) => ({
      enabled,
      running: enabled,
      host: '0.0.0.0',
      port: 8787,
      pairingCode: '123456',
      urls: enabled ? ['http://localhost:8787'] : []
    }))
    mobileRotatePairingCodeRequest.mockResolvedValue({
      enabled: true,
      running: true,
      host: '0.0.0.0',
      port: 8787,
      pairingCode: '654321',
      urls: ['http://localhost:8787']
    })
    mobileCreatePairingTokenRequest.mockResolvedValue({
      token: 'token-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      bridgeUrl: 'http://localhost:8787',
      deepLink: 'treebeard://pair?data=test'
    })
    qrcodeToDataUrl.mockResolvedValue('data:image/png;base64,abc123')
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

  it('shows and updates mobile bridge controls', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }))

    expect(screen.queryByText(/Pairing code:/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Generate pairing QR' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rotate pairing code' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refresh bridge status' })).toBeNull()

    fireEvent.click(screen.getByLabelText('Enable LAN bridge for mobile app'))

    await waitFor(() => {
      expect(mobileSetEnabledRequest).toHaveBeenCalledWith({ enabled: true })
      expect(screen.getByText(/Pairing code:/)).toBeTruthy()
      expect(screen.getByText('123456')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Rotate pairing code' }))

    await waitFor(() => {
      expect(mobileRotatePairingCodeRequest).toHaveBeenCalledWith({})
      expect(screen.getByText('654321')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Generate pairing QR' }))

    await waitFor(() => {
      expect(mobileCreatePairingTokenRequest).toHaveBeenCalledWith({})
      expect(qrcodeToDataUrl).toHaveBeenCalled()
      expect(screen.getByAltText('Mobile pairing QR')).toBeTruthy()
    })

    fireEvent.click(screen.getByLabelText('Enable LAN bridge for mobile app'))

    await waitFor(() => {
      expect(mobileSetEnabledRequest).toHaveBeenCalledWith({ enabled: false })
      expect(screen.queryByText(/Pairing code:/)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Generate pairing QR' })).toBeNull()
      expect(screen.queryByAltText('Mobile pairing QR')).toBeNull()
    })
  })
})
