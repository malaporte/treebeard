import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import App from './App'

const mockGetItemAsync = jest.fn()
const mockSetItemAsync = jest.fn()
const mockDeleteItemAsync = jest.fn()

const mockGetHealth = jest.fn()
const mockExchangePairingToken = jest.fn()
const mockGetStatus = jest.fn()
const mockGetWorktrees = jest.fn()
const mockCreateOpencodeWebSession = jest.fn()

let mockScannedValue = ''

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args)
}))

jest.mock('expo-camera', () => {
  const React = require('react')
  const { Pressable, Text } = require('react-native')

  return {
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned?: (event: { data?: string }) => void }) => (
      <Pressable onPress={() => onBarcodeScanned?.({ data: mockScannedValue })} testID="mock-camera">
        <Text>Mock Camera</Text>
      </Pressable>
    ),
    useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))]
  }
})

jest.mock('react-native-webview', () => ({
  WebView: () => null
}))

jest.mock('./src/api', () => ({
  getHealth: (...args: unknown[]) => mockGetHealth(...args),
  exchangePairingToken: (...args: unknown[]) => mockExchangePairingToken(...args),
  getStatus: (...args: unknown[]) => mockGetStatus(...args),
  getWorktrees: (...args: unknown[]) => mockGetWorktrees(...args),
  createOpencodeWebSession: (...args: unknown[]) => mockCreateOpencodeWebSession(...args)
}))

function createDeepLink(url: string, token: string): string {
  const payload = encodeURIComponent(JSON.stringify({ url, token }))
  return `treebeard://pair?data=${payload}`
}

describe('App pairing', () => {
  beforeEach(() => {
    mockScannedValue = ''

    mockGetItemAsync.mockResolvedValue(null)
    mockSetItemAsync.mockResolvedValue(undefined)
    mockDeleteItemAsync.mockResolvedValue(undefined)

    mockGetHealth.mockResolvedValue({ ok: true })
    mockExchangePairingToken.mockResolvedValue({
      sessionToken: 'session-token',
      expiresAt: '2026-03-02T00:00:00.000Z',
      bridgeUrl: 'http://10.0.0.2:8787'
    })
    mockGetStatus.mockResolvedValue({})
    mockGetWorktrees.mockResolvedValue({
      worktrees: [],
      opencode: {
        enabled: true,
        running: false,
        url: null,
        pid: null,
        error: null
      },
      generatedAt: '2026-03-02T00:00:00.000Z'
    })
    mockCreateOpencodeWebSession.mockResolvedValue({ webUrl: '', expiresAt: '' })
  })

  it('hides manual fields by default and auto-connects on valid QR scan', async () => {
    mockScannedValue = createDeepLink('http://10.0.0.2:8787', 'qr-token')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Scan QR')).toBeTruthy()
    })

    expect(screen.queryByPlaceholderText('Bridge URL (e.g. http://192.168.1.10:8787)')).toBeNull()

    fireEvent.press(screen.getByText('Scan QR'))
    fireEvent.press(screen.getByTestId('mock-camera'))

    await waitFor(() => {
      expect(mockExchangePairingToken).toHaveBeenCalledWith('http://10.0.0.2:8787', 'qr-token')
    })

    await waitFor(() => {
      expect(screen.getByText('Worktrees')).toBeTruthy()
    })
  })
})
