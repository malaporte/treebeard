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
}

interface SettingsModalProps {
  opened: boolean
}

vi.mock('./components/RepoDashboard', () => ({
  RepoDashboard: ({ search }: RepoDashboardProps) => <div data-testid="repo-dashboard">search:{search}</div>
}))

vi.mock('./components/SettingsModal', () => ({
  SettingsModal: ({ opened }: SettingsModalProps) => <div data-testid="settings-modal">{String(opened)}</div>
}))

const config: AppConfig = {
  repositories: [{ id: 'repo-1', name: 'treebeard', path: '/repo' }],
  pollIntervalSec: 60,
  autoUpdateEnabled: true,
  updateCheckIntervalMin: 30,
  collapsedRepos: []
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
      reorderRepos: vi.fn(async () => {})
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

    fireEvent.keyDown(window, { key: 'q', metaKey: true })
    fireEvent.keyDown(window, { key: 'w', metaKey: true })

    expect(appQuitRequest).toHaveBeenCalledWith({})
    expect(appCloseWindowRequest).toHaveBeenCalledWith({})
  })
})
