import { render, screen, waitFor } from '@testing-library/react-native'
import App from './App'

const mockGetItemAsync = jest.fn()
const mockDeleteItemAsync = jest.fn()
const mockGetHealth = jest.fn()
const mockExchangePairingToken = jest.fn()
const mockGetStatus = jest.fn()
const mockGetWorktrees = jest.fn()

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: jest.fn(),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args)
}))

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))]
}))

jest.mock('./src/api', () => ({
  getHealth: (...args: unknown[]) => mockGetHealth(...args),
  exchangePairingToken: (...args: unknown[]) => mockExchangePairingToken(...args),
  getStatus: (...args: unknown[]) => mockGetStatus(...args),
  getWorktrees: (...args: unknown[]) => mockGetWorktrees(...args),
  startCodexSession: jest.fn(),
  steerCodexSession: jest.fn(),
  interruptCodexSession: jest.fn(),
  getCodexConversation: jest.fn(async () => ({
    status: {
      worktreePath: '/repo/a',
      threadId: 't1',
      running: false,
      startedAt: '',
      updatedAt: '',
      lastEventId: 0,
      error: null
    },
    snapshot: {
      threadId: 't1',
      revision: 1,
      turns: []
    }
  })),
  resumeCodexConversation: jest.fn(async () => ({
    status: {
      worktreePath: '/repo/a',
      threadId: 't1',
      running: false,
      startedAt: '',
      updatedAt: '',
      lastEventId: 0,
      error: null
    },
    snapshot: {
      threadId: 't1',
      revision: 1,
      turns: []
    }
  })),
  waitForCodexConversationUpdate: jest.fn(async () => ({ update: null })),
  getCodexPendingActions: jest.fn(async () => ({ actions: [] })),
  respondCodexPendingAction: jest.fn()
}))

describe('App pairing', () => {
  beforeEach(() => {
    mockDeleteItemAsync.mockReset()
    mockGetItemAsync.mockResolvedValue(null)
    mockGetHealth.mockResolvedValue({ ok: true })
    mockExchangePairingToken.mockResolvedValue({
      sessionToken: 'session-token',
      expiresAt: '2026-03-02T00:00:00.000Z',
      bridgeUrl: 'http://10.0.0.2:8787'
    })
    mockGetStatus.mockResolvedValue({})
    mockGetWorktrees.mockResolvedValue({
      worktrees: [],
      codex: {
        enabled: true,
        running: false,
        pid: null,
        error: null
      },
      generatedAt: '2026-03-02T00:00:00.000Z'
    })
  })

  it('shows pairing UI when no saved session exists', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Scan QR')).toBeTruthy()
    })
  })

  it('clears stale saved session and exits restoring state on restore failure', async () => {
    mockGetItemAsync.mockResolvedValue(JSON.stringify({
      baseUrl: 'http://10.0.0.2:8787',
      sessionToken: 'stale-token'
    }))
    mockGetStatus.mockRejectedValue(new Error('Request timed out after 6000ms'))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Scan QR')).toBeTruthy()
    })

    expect(mockDeleteItemAsync).toHaveBeenCalledWith('treebeard.bridgeConnection')
    expect(screen.getByText('Request timed out after 6000ms')).toBeTruthy()
  })
})
