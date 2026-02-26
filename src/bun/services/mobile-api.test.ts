import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MobileBridgeConfig, OpencodeServerStatus, Worktree } from '../../shared/types'

const mockGetConfig = vi.fn()
const mockGetMobileBridgeConfig = vi.fn<() => MobileBridgeConfig>()
const mockEnsureMobileBridgePairingCode = vi.fn<() => string>()
const mockRotateMobileBridgePairingCode = vi.fn<() => string>()
const mockSetMobileBridgeEnabled = vi.fn<(enabled: boolean) => MobileBridgeConfig>()

const mockGetWorktrees = vi.fn<(repoPath: string) => Promise<Worktree[]>>()
const mockGetServerStatus = vi.fn<(worktreePath: string) => OpencodeServerStatus>()
const mockSetServerEnabled = vi.fn<(worktreePath: string, enabled: boolean) => Promise<OpencodeServerStatus>>()

vi.mock('./config', () => ({
  ensureMobileBridgePairingCode: () => mockEnsureMobileBridgePairingCode(),
  getConfig: () => mockGetConfig(),
  getMobileBridgeConfig: () => mockGetMobileBridgeConfig(),
  rotateMobileBridgePairingCode: () => mockRotateMobileBridgePairingCode(),
  setMobileBridgeEnabled: (enabled: boolean) => mockSetMobileBridgeEnabled(enabled)
}))

vi.mock('./git', () => ({
  getWorktrees: (repoPath: string) => mockGetWorktrees(repoPath)
}))

vi.mock('./opencode', () => ({
  getServerStatus: (worktreePath: string) => mockGetServerStatus(worktreePath),
  setServerEnabled: (worktreePath: string, enabled: boolean) => mockSetServerEnabled(worktreePath, enabled)
}))

vi.mock('node:os', () => ({
  default: {
    networkInterfaces: () => ({
      en0: [
        { internal: false, family: 'IPv4', address: '192.168.1.10' }
      ]
    })
  }
}))

interface ServeRuntime {
  port?: number
  stop: ReturnType<typeof vi.fn>
}

let serveHandler: ((request: Request) => Promise<Response>) | null = null
let serveRuntime: ServeRuntime | null = null

vi.stubGlobal('Bun', {
  serve: vi.fn((options: { hostname: string; port: number; fetch: (request: Request) => Promise<Response> }) => {
    serveHandler = options.fetch
    serveRuntime = {
      port: options.port,
      stop: vi.fn()
    }
    return serveRuntime
  })
})

const {
  createMobilePairingToken,
  getMobileBridgeStatus,
  rotateMobileBridgePairingCodeStatus,
  setMobileBridgeEnabledState,
  stopMobileBridge,
  syncMobileBridgeFromConfig
} = await import('./mobile-api')

describe('mobile api service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serveHandler = null
    serveRuntime = null

    mockEnsureMobileBridgePairingCode.mockReturnValue('123456')
    mockRotateMobileBridgePairingCode.mockReturnValue('654321')

    const disabledConfig: MobileBridgeConfig = {
      enabled: false,
      host: '0.0.0.0',
      port: 8787,
      pairingCode: '123456'
    }

    mockGetMobileBridgeConfig.mockReturnValue(disabledConfig)
    mockSetMobileBridgeEnabled.mockImplementation((enabled) => ({ ...disabledConfig, enabled }))
    mockGetConfig.mockReturnValue({ repositories: [] })
    mockGetWorktrees.mockResolvedValue([])
    mockGetServerStatus.mockReturnValue({
      enabled: false,
      running: false,
      url: null,
      pid: null,
      error: null
    })
    mockSetServerEnabled.mockResolvedValue({
      enabled: true,
      running: true,
      url: 'http://127.0.0.1:1234',
      pid: 1234,
      error: null
    })

    stopMobileBridge()
  })

  it('starts bridge when enabled in config', async () => {
    mockGetMobileBridgeConfig.mockReturnValue({
      enabled: true,
      host: '0.0.0.0',
      port: 8787,
      pairingCode: '123456'
    })

    await syncMobileBridgeFromConfig()

    const status = getMobileBridgeStatus()
    expect(status.running).toBe(true)
    expect(status.urls).toContain('http://localhost:8787')
    expect(status.urls).toContain('http://192.168.1.10:8787')
  })

  it('toggles bridge enable state', async () => {
    mockGetMobileBridgeConfig.mockReturnValue({
      enabled: true,
      host: '127.0.0.1',
      port: 7777,
      pairingCode: '123456'
    })

    const enabledStatus = await setMobileBridgeEnabledState(true)
    expect(mockSetMobileBridgeEnabled).toHaveBeenCalledWith(true)
    expect(enabledStatus.enabled).toBe(true)

    mockGetMobileBridgeConfig.mockReturnValue({
      enabled: false,
      host: '127.0.0.1',
      port: 7777,
      pairingCode: '123456'
    })

    const disabledStatus = await setMobileBridgeEnabledState(false)
    expect(mockSetMobileBridgeEnabled).toHaveBeenCalledWith(false)
    expect(disabledStatus.enabled).toBe(false)
  })

  it('rotates pairing code in status', () => {
    const status = rotateMobileBridgePairingCodeStatus()
    expect(mockRotateMobileBridgePairingCode).toHaveBeenCalledTimes(1)
    expect(status.pairingCode).toBe('123456')
  })

  it('creates one-time pairing token with deep link', () => {
    mockGetMobileBridgeConfig.mockReturnValue({
      enabled: true,
      host: '127.0.0.1',
      port: 8787,
      pairingCode: '123456'
    })

    const pairing = createMobilePairingToken()
    expect(pairing.token.length).toBeGreaterThan(10)
    expect(pairing.deepLink.startsWith('treebeard://pair?data=')).toBe(true)
    expect(pairing.bridgeUrl).toBe('http://127.0.0.1:8787')
  })

  it('accepts one-time token only once', async () => {
    mockGetMobileBridgeConfig.mockReturnValue({
      enabled: true,
      host: '127.0.0.1',
      port: 8787,
      pairingCode: '123456'
    })
    await syncMobileBridgeFromConfig()

    const pairing = createMobilePairingToken()

    const firstExchange = await serveHandler?.(
      new Request('http://127.0.0.1:8787/pair/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: pairing.token })
      })
    )
    expect(firstExchange?.status).toBe(200)

    const secondExchange = await serveHandler?.(
      new Request('http://127.0.0.1:8787/pair/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: pairing.token })
      })
    )
    expect(secondExchange?.status).toBe(401)
  })

  it('serves health endpoint without auth', async () => {
    mockGetMobileBridgeConfig.mockReturnValue({
      enabled: true,
      host: '127.0.0.1',
      port: 8787,
      pairingCode: '123456'
    })
    await syncMobileBridgeFromConfig()

    const response = await serveHandler?.(new Request('http://127.0.0.1:8787/health'))
    expect(response?.status).toBe(200)
  })

  it('returns worktrees only for authenticated sessions', async () => {
    mockGetMobileBridgeConfig.mockReturnValue({
      enabled: true,
      host: '127.0.0.1',
      port: 8787,
      pairingCode: '123456'
    })
    mockGetConfig.mockReturnValue({
      repositories: [{ id: 'r1', name: 'repo', path: '/repo' }]
    })
    mockGetWorktrees.mockResolvedValue([
      { path: '/repo/wt-1', branch: 'main', head: 'abc', isMain: true }
    ])
    mockGetServerStatus.mockReturnValue({
      enabled: true,
      running: true,
      url: 'http://127.0.0.1:1234',
      pid: 1234,
      error: null
    })

    await syncMobileBridgeFromConfig()

    const unauthorized = await serveHandler?.(new Request('http://127.0.0.1:8787/worktrees'))
    expect(unauthorized?.status).toBe(401)

    const pairing = createMobilePairingToken()
    const exchangeResponse = await serveHandler?.(
      new Request('http://127.0.0.1:8787/pair/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: pairing.token })
      })
    )
    expect(exchangeResponse?.status).toBe(200)
    const exchangeBody = exchangeResponse
      ? await exchangeResponse.json() as { sessionToken: string }
      : { sessionToken: '' }

    const authorized = await serveHandler?.(
      new Request('http://127.0.0.1:8787/worktrees', {
        headers: {
          authorization: `Bearer ${exchangeBody.sessionToken}`
        }
      })
    )
    expect(authorized?.status).toBe(200)

    const body = authorized ? await authorized.json() as { worktrees: unknown[] } : { worktrees: [] }
    expect(body.worktrees).toHaveLength(1)
  })

  it('toggles opencode status through endpoint', async () => {
    mockGetMobileBridgeConfig.mockReturnValue({
      enabled: true,
      host: '127.0.0.1',
      port: 8787,
      pairingCode: '123456'
    })
    await syncMobileBridgeFromConfig()

    const pairing = createMobilePairingToken()
    const exchangeResponse = await serveHandler?.(
      new Request('http://127.0.0.1:8787/pair/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: pairing.token })
      })
    )
    const exchangeBody = exchangeResponse
      ? await exchangeResponse.json() as { sessionToken: string }
      : { sessionToken: '' }

    const response = await serveHandler?.(
      new Request('http://127.0.0.1:8787/opencode/set-enabled', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${exchangeBody.sessionToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ worktreePath: '/repo/wt-1', enabled: true })
      })
    )

    expect(response?.status).toBe(200)
    expect(mockSetServerEnabled).toHaveBeenCalledWith('/repo/wt-1', true)
  })
})
