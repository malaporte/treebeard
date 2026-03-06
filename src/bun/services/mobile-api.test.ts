import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MobileBridgeConfig, Worktree } from '../../shared/types'

const mockGetConfig = vi.fn()
const mockGetMobileBridgeConfig = vi.fn<() => MobileBridgeConfig>()
const mockEnsureMobileBridgePairingCode = vi.fn<() => string>()
const mockRotateMobileBridgePairingCode = vi.fn<() => string>()
const mockSetMobileBridgeEnabled = vi.fn<(enabled: boolean) => MobileBridgeConfig>()

const mockGetWorktrees = vi.fn<(repoPath: string) => Promise<Worktree[]>>()
const mockGetCodexStatus = vi.fn()
const mockStartCodexSession = vi.fn()
const mockSteerCodexSession = vi.fn()
const mockInterruptCodexSession = vi.fn()
const mockGetCodexSessionStatus = vi.fn()
const mockGetCodexSessionEvents = vi.fn()
const mockGetCodexConversation = vi.fn()
const mockResumeCodexConversation = vi.fn()
const mockWaitForCodexConversationUpdate = vi.fn()
const mockGetCodexPendingActions = vi.fn()
const mockRespondCodexPendingAction = vi.fn()

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

vi.mock('./codex', () => ({
  getCodexStatus: () => mockGetCodexStatus(),
  startCodexSession: (worktreePath: string, prompt: string) => mockStartCodexSession(worktreePath, prompt),
  steerCodexSession: (worktreePath: string, prompt: string) => mockSteerCodexSession(worktreePath, prompt),
  interruptCodexSession: (worktreePath: string) => mockInterruptCodexSession(worktreePath),
  getCodexSessionStatus: (worktreePath: string) => mockGetCodexSessionStatus(worktreePath),
  getCodexSessionEvents: (worktreePath: string, cursor: number) => mockGetCodexSessionEvents(worktreePath, cursor),
  getCodexConversation: (worktreePath: string) => mockGetCodexConversation(worktreePath),
  resumeCodexConversation: (worktreePath: string) => mockResumeCodexConversation(worktreePath),
  waitForCodexConversationUpdate: (worktreePath: string, revision: number, timeoutMs: number) =>
    mockWaitForCodexConversationUpdate(worktreePath, revision, timeoutMs),
  getCodexPendingActions: (worktreePath: string) => mockGetCodexPendingActions(worktreePath),
  respondCodexPendingAction: (worktreePath: string, actionId: string, response: string) =>
    mockRespondCodexPendingAction(worktreePath, actionId, response)
}))

vi.mock('node:os', () => ({
  default: {
    networkInterfaces: () => ({
      en0: [
        { internal: false, family: 'IPv4', address: '192.168.1.10' }
      ]
    }),
    homedir: () => '/Users/test'
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
  setMobileBridgeEnabledState,
  stopMobileBridge,
  syncMobileBridgeFromConfig
} = await import('./mobile-api')

describe('mobile api service', () => {
  let bridgeConfig: MobileBridgeConfig

  beforeEach(() => {
    vi.clearAllMocks()
    serveHandler = null
    serveRuntime = null

    mockEnsureMobileBridgePairingCode.mockReturnValue('123456')
    mockRotateMobileBridgePairingCode.mockReturnValue('654321')

    bridgeConfig = {
      enabled: false,
      host: '0.0.0.0',
      port: 8787,
      pairingCode: '123456'
    }

    mockGetMobileBridgeConfig.mockImplementation(() => bridgeConfig)
    mockSetMobileBridgeEnabled.mockImplementation((enabled) => {
      bridgeConfig = { ...bridgeConfig, enabled }
      return bridgeConfig
    })
    mockGetConfig.mockReturnValue({ repositories: [] })
    mockGetWorktrees.mockResolvedValue([])
    mockGetCodexStatus.mockReturnValue({ enabled: true, running: false, pid: null, error: null })
    mockStartCodexSession.mockResolvedValue({ worktreePath: '/repo/a', threadId: 't1', running: true, startedAt: '', updatedAt: '', lastEventId: 1, error: null })
    mockSteerCodexSession.mockResolvedValue({ worktreePath: '/repo/a', threadId: 't1', running: true, startedAt: '', updatedAt: '', lastEventId: 2, error: null })
    mockInterruptCodexSession.mockResolvedValue({ worktreePath: '/repo/a', threadId: 't1', running: false, startedAt: '', updatedAt: '', lastEventId: 3, error: null })
    mockGetCodexSessionStatus.mockReturnValue({ worktreePath: '/repo/a', threadId: 't1', running: true, startedAt: '', updatedAt: '', lastEventId: 1, error: null })
    mockGetCodexSessionEvents.mockReturnValue({ events: [], nextCursor: 0 })
    mockGetCodexConversation.mockResolvedValue({
      status: { worktreePath: '/repo/a', threadId: 't1', running: true, startedAt: '', updatedAt: '', lastEventId: 1, error: null },
      snapshot: { threadId: 't1', revision: 1, turns: [] }
    })
    mockResumeCodexConversation.mockResolvedValue({
      status: { worktreePath: '/repo/a', threadId: 't1', running: true, startedAt: '', updatedAt: '', lastEventId: 1, error: null },
      snapshot: { threadId: 't1', revision: 2, turns: [] }
    })
    mockWaitForCodexConversationUpdate.mockResolvedValue({
      worktreePath: '/repo/a',
      status: { worktreePath: '/repo/a', threadId: 't1', running: true, startedAt: '', updatedAt: '', lastEventId: 1, error: null },
      snapshot: { threadId: 't1', revision: 3, turns: [] },
      pendingActions: []
    })
    mockGetCodexPendingActions.mockReturnValue([])
    mockRespondCodexPendingAction.mockReturnValue({ success: true })

    stopMobileBridge()
  })

  async function pair(): Promise<string> {
    const pairing = createMobilePairingToken()
    const exchange = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/pair/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: pairing.token })
      })
    )
    const body = exchange ? await exchange.json() as { sessionToken: string } : { sessionToken: '' }
    return body.sessionToken
  }

  it('starts bridge when enabled in config', async () => {
    bridgeConfig = {
      enabled: true,
      host: '0.0.0.0',
      port: 8787,
      pairingCode: '123456'
    }

    await syncMobileBridgeFromConfig()

    const status = getMobileBridgeStatus()
    expect(status.running).toBe(true)
    expect(status.urls).toContain('http://localhost:8787')
    expect(status.urls).toContain('http://192.168.1.10:8787')
  })

  it('requires auth for codex session endpoints', async () => {
    await setMobileBridgeEnabledState(true)

    const unauthorized = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/codex/session/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ worktreePath: '/repo/a', prompt: 'hello' })
      })
    )

    expect(unauthorized?.status).toBe(401)
  })

  it('starts and steers codex sessions for authenticated clients', async () => {
    await setMobileBridgeEnabledState(true)
    const token = await pair()

    const started = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/codex/session/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ worktreePath: '/repo/a', prompt: 'start' })
      })
    )

    expect(started?.status).toBe(200)
    expect(mockStartCodexSession).toHaveBeenCalledWith('/repo/a', 'start')

    const steered = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/codex/session/steer', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ worktreePath: '/repo/a', prompt: 'next' })
      })
    )

    expect(steered?.status).toBe(200)
    expect(mockSteerCodexSession).toHaveBeenCalledWith('/repo/a', 'next')
  })

  it('returns worktrees payload with codex runtime status', async () => {
    await setMobileBridgeEnabledState(true)
    const token = await pair()
    mockGetConfig.mockReturnValue({
      repositories: [{ id: '1', name: 'repo', path: '/repo' }]
    })
    mockGetWorktrees.mockResolvedValue([{ path: '/repo/a', branch: 'main', head: 'abc', isMain: true }])

    const response = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/worktrees', {
        headers: {
          authorization: `Bearer ${token}`
        }
      })
    )

    expect(response?.status).toBe(200)
    const body = response ? await response.json() as { worktrees: Array<{ worktree: { path: string } }>; codex: { enabled: boolean } } : null
    expect(body?.worktrees[0]?.worktree.path).toBe('/repo/a')
    expect(body?.codex.enabled).toBe(true)
  })

  it('returns session events and pending actions', async () => {
    await setMobileBridgeEnabledState(true)
    const token = await pair()

    mockGetCodexSessionEvents.mockReturnValue({
      events: [{
        id: 1,
        at: '',
        worktreePath: '/repo/a',
        kind: 'message',
        actor: 'assistant',
        channel: 'chat',
        title: null,
        message: 'hello',
        rawType: null
      }],
      nextCursor: 1
    })
    mockGetCodexPendingActions.mockReturnValue([
      { id: 'a1', worktreePath: '/repo/a', kind: 'approval', prompt: 'approve?', options: [] }
    ])

    const eventsResponse = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/codex/session/events?worktreePath=%2Frepo%2Fa&cursor=0', {
        headers: { authorization: `Bearer ${token}` }
      })
    )

    expect(eventsResponse?.status).toBe(200)

    const actionsResponse = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/codex/session/pending-actions?worktreePath=%2Frepo%2Fa', {
        headers: { authorization: `Bearer ${token}` }
      })
    )

    expect(actionsResponse?.status).toBe(200)
  })

  it('returns and resumes normalized conversation snapshots', async () => {
    await setMobileBridgeEnabledState(true)
    const token = await pair()

    const conversationResponse = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/codex/session/conversation?worktreePath=%2Frepo%2Fa', {
        headers: { authorization: `Bearer ${token}` }
      })
    )

    expect(conversationResponse?.status).toBe(200)
    expect(mockGetCodexConversation).toHaveBeenCalledWith('/repo/a')

    const resumeResponse = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/codex/session/conversation/resume', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ worktreePath: '/repo/a' })
      })
    )

    expect(resumeResponse?.status).toBe(200)
    expect(mockResumeCodexConversation).toHaveBeenCalledWith('/repo/a')
  })

  it('waits for the next mobile conversation update', async () => {
    await setMobileBridgeEnabledState(true)
    const token = await pair()

    const response = await serveHandler?.(
      new Request('http://127.0.0.1:8787/bridge/codex/session/conversation/updates?worktreePath=%2Frepo%2Fa&revision=2', {
        headers: { authorization: `Bearer ${token}` }
      })
    )

    expect(response?.status).toBe(200)
    expect(mockWaitForCodexConversationUpdate).toHaveBeenCalledWith('/repo/a', 2, 30000)
  })
})
