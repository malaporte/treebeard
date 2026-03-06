import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { renderWithMantine } from './test/render'
import type { AppConfig } from './shared/types'

const useConfigMock = vi.fn()
const systemDependenciesRequest = vi.fn()
const appQuitRequest = vi.fn()
const appCloseWindowRequest = vi.fn()

vi.mock('./hooks/useConfig', () => ({
  useConfig: () => useConfigMock()
}))

vi.mock('./rpc', () => ({
  rpc: () => ({
    request: {
      'system:dependencies': systemDependenciesRequest,
      'app:quit': appQuitRequest,
      'app:closeWindow': appCloseWindowRequest
    }
  })
}))

interface RepoDashboardProps {
  search: string
  embeddedCodexEnabled: boolean
  onOpenCodex: (worktree: { path: string; branch: string }) => void
}

interface SettingsModalProps {
  opened: boolean
}

vi.mock('./components/RepoDashboard', () => ({
  RepoDashboard: ({ search, embeddedCodexEnabled, onOpenCodex }: RepoDashboardProps) => (
    <div>
      <div data-testid="repo-dashboard">search:{search}</div>
      <div data-testid="embedded-codex-enabled">{String(embeddedCodexEnabled)}</div>
      <button onClick={() => onOpenCodex({ path: '/repo/worktrees/main', branch: 'main' })}>open-codex</button>
    </div>
  )
}))

vi.mock('./components/SettingsModal', () => ({
  SettingsModal: ({ opened }: SettingsModalProps) => <div data-testid="settings-modal">{String(opened)}</div>
}))

interface CodexSessionPaneProps {
  branch: string
  onClose: () => void
}

vi.mock('./components/CodexSessionPane', () => ({
  CodexSessionPane: ({ branch, onClose }: CodexSessionPaneProps) => (
    <div>
      <div data-testid="codex-session-pane">{branch}</div>
      <button onClick={onClose}>close-codex</button>
    </div>
  )
}))

const config: AppConfig = {
  repositories: [{ id: 'repo-1', name: 'treebeard', path: '/repo' }],
  pollIntervalSec: 60,
  autoUpdateEnabled: true,
  updateCheckIntervalMin: 30,
  collapsedRepos: [],
  codexServerEnabled: false,
  desktopCodexPaneWidth: 420,
  mobileBridge: {
    enabled: false,
    host: '0.0.0.0',
    port: 8787,
    pairingCode: '123456'
  }
}

describe('App', () => {
  beforeEach(() => {
    useConfigMock.mockReset()
    systemDependenciesRequest.mockReset()
    appQuitRequest.mockReset()
    appCloseWindowRequest.mockReset()

    useConfigMock.mockReturnValue({
      config,
      loading: false,
      addRepo: vi.fn(async () => {}),
      removeRepo: vi.fn(async () => {}),
      setPollInterval: vi.fn(async () => {}),
      setAutoUpdateEnabled: vi.fn(async () => {}),
      setUpdateCheckInterval: vi.fn(async () => {}),
      reorderRepos: vi.fn(async () => {}),
      setDesktopCodexPaneWidth: vi.fn(async () => {}),
      setMobileBridgeEnabled: vi.fn(async () => {})
    })
  })

  it('shows loading state while config is loading', () => {
    useConfigMock.mockReturnValue({ config: null, loading: true })
    renderWithMantine(<App />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('renders dependency warnings and handles keyboard shortcuts', async () => {
    systemDependenciesRequest.mockResolvedValue({
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
          authenticated: false,
          version: 'jira version',
          error: null,
          authError: 'auth required'
        }
      ]
    })

    renderWithMantine(<App />)

    await waitFor(() => {
      expect(screen.getByText('Missing CLI dependencies')).toBeTruthy()
      expect(screen.getByText('CLI authentication required')).toBeTruthy()
    })

    expect(screen.getByTestId('settings-modal').textContent).toBe('false')
    window.dispatchEvent(new CustomEvent('treebeard:open-settings'))
    await waitFor(() => {
      expect(screen.getByTestId('settings-modal').textContent).toBe('true')
    })

    fireEvent.keyDown(window, { key: 'q', metaKey: true })
    fireEvent.keyDown(window, { key: 'w', metaKey: true })

    expect(appQuitRequest).toHaveBeenCalledWith({})
    expect(appCloseWindowRequest).toHaveBeenCalledWith({})
  })

  it('keeps the codex pane hidden by default and allows opening and closing it', async () => {
    useConfigMock.mockReturnValue({
      config: {
        ...config,
        mobileBridge: {
          ...config.mobileBridge,
          enabled: true
        }
      },
      loading: false,
      addRepo: vi.fn(async () => {}),
      removeRepo: vi.fn(async () => {}),
      setPollInterval: vi.fn(async () => {}),
      setAutoUpdateEnabled: vi.fn(async () => {}),
      setUpdateCheckInterval: vi.fn(async () => {}),
      reorderRepos: vi.fn(async () => {}),
      setDesktopCodexPaneWidth: vi.fn(async () => {}),
      setMobileBridgeEnabled: vi.fn(async () => {})
    })

    systemDependenciesRequest.mockResolvedValue({
      checkedAt: new Date().toISOString(),
      checks: []
    })

    renderWithMantine(<App />)

    expect(screen.queryByTestId('codex-session-pane')).toBeNull()

    fireEvent.click(screen.getByText('open-codex'))

    await waitFor(() => {
      expect(screen.getByTestId('codex-session-pane').textContent).toBe('main')
    })

    fireEvent.click(screen.getByText('close-codex'))

    await waitFor(() => {
      expect(screen.queryByTestId('codex-session-pane')).toBeNull()
    })
  })

  it('disables embedded codex when the mobile bridge is disabled', async () => {
    systemDependenciesRequest.mockResolvedValue({
      checkedAt: new Date().toISOString(),
      checks: []
    })

    renderWithMantine(<App />)

    expect(screen.getByTestId('embedded-codex-enabled').textContent).toBe('false')
    fireEvent.click(screen.getByText('open-codex'))
    await waitFor(() => {
      expect(screen.queryByTestId('codex-session-pane')).toBeNull()
    })
  })
})
