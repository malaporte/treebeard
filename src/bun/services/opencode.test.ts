import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpencodeServerStatus } from '../../shared/types'

interface MockProcess {
  pid: number
  stdout: ReadableStream
  stderr: ReadableStream
  exited: Promise<number>
  kill: ReturnType<typeof vi.fn>
  pushStderr: (text: string) => void
  resolveExited: (code: number) => void
}

let nextPid = 1000

function createControllableProcess(): MockProcess {
  let stderrController!: ReadableStreamDefaultController<Uint8Array>
  let resolveExited!: (code: number) => void
  const encoder = new TextEncoder()

  const stdout = new ReadableStream<Uint8Array>()
  const stderr = new ReadableStream<Uint8Array>({
    start(controller) {
      stderrController = controller
    }
  })

  const exited = new Promise<number>((resolve) => {
    resolveExited = resolve
  })

  return {
    pid: nextPid++,
    stdout,
    stderr,
    exited,
    kill: vi.fn(() => {
      resolveExited(0)
    }),
    pushStderr: (text: string) => {
      stderrController.enqueue(encoder.encode(text))
    },
    resolveExited: (code: number) => {
      resolveExited(code)
    }
  }
}

const mockGetShellEnv = vi.fn<() => Promise<Record<string, string>>>().mockResolvedValue({ PATH: '/usr/bin' })
const mockGetOpencodeEnabled = vi.fn<() => boolean>().mockReturnValue(false)
const mockSetOpencodeEnabled = vi.fn<(enabled: boolean) => void>()

vi.mock('./shell-env', () => ({
  getShellEnv: () => mockGetShellEnv()
}))

vi.mock('./config', () => ({
  getOpencodeEnabled: () => mockGetOpencodeEnabled(),
  setOpencodeEnabled: (enabled: boolean) => mockSetOpencodeEnabled(enabled)
}))

let spawnQueue: MockProcess[] = []
let spawnCalls: Array<{ command: string[]; options: Record<string, unknown> }> = []

vi.stubGlobal('Bun', {
  spawn: vi.fn((command: string[], options: Record<string, unknown>) => {
    spawnCalls.push({ command, options })
    const proc = spawnQueue.shift()
    if (!proc) throw new Error('No mock process in spawn queue')
    return proc
  }),
  spawnSync: vi.fn(() => ({
    stdout: new Uint8Array()
  })),
  env: { HOME: '/Users/test', SHELL: '/bin/zsh' }
})

const {
  getServerStatus,
  getServerSync,
  setServerEnabled,
  restoreEnabledServer,
  stopAllServers
} = await import('./opencode')

const OFF_STATUS: OpencodeServerStatus = {
  enabled: false,
  running: false,
  url: null,
  pid: null,
  error: null
}

describe('opencode service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    spawnQueue = []
    spawnCalls = []
    nextPid = 1000
    mockGetOpencodeEnabled.mockReturnValue(false)
  })

  afterEach(async () => {
    await stopAllServers()
  })

  it('returns disabled status when not running', () => {
    expect(getServerStatus()).toEqual(OFF_STATUS)
  })

  it('reports missing sync data when server is not running', async () => {
    const sync = await getServerSync(['/repo/a', '/repo/b'])
    expect(sync.serverRunning).toBe(false)
    expect(sync.missingProjects).toEqual(['/repo/a', '/repo/b'])
    expect(sync.missingSessionDirectories).toEqual(['/repo/a', '/repo/b'])
  })

  it('starts server when enabled', async () => {
    const proc = createControllableProcess()
    spawnQueue.push(proc)
    mockGetOpencodeEnabled.mockReturnValue(true)

    setTimeout(() => {
      proc.pushStderr('listening on http://127.0.0.1:4096\n')
    }, 10)

    const status = await setServerEnabled(true)

    expect(mockSetOpencodeEnabled).toHaveBeenCalledWith(true)
    expect(spawnCalls[0].command[0]).toBe('opencode')
    expect(spawnCalls[0].command).toContain('serve')
    expect(spawnCalls[0].command).toContain('--hostname')
    expect(spawnCalls[0].command).toContain('127.0.0.1')
    expect(spawnCalls[0].command).toContain('--port')
    expect(spawnCalls[0].command).toContain('0')
    expect(spawnCalls[0].command).toContain('--print-logs')
    expect(status.running).toBe(true)
    expect(status.url).toBe('http://127.0.0.1:4096')
  })

  it('stops server when disabled', async () => {
    const proc = createControllableProcess()
    spawnQueue.push(proc)
    mockGetOpencodeEnabled.mockReturnValue(true)

    setTimeout(() => {
      proc.pushStderr('listening on http://127.0.0.1:4096\n')
    }, 10)

    await setServerEnabled(true)
    proc.kill.mockImplementation(() => {
      proc.resolveExited(0)
    })
    mockGetOpencodeEnabled.mockReturnValue(false)

    const status = await setServerEnabled(false)

    expect(mockSetOpencodeEnabled).toHaveBeenCalledWith(false)
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
    expect(status.running).toBe(false)
  })

  it('restores server on launch when config is enabled', async () => {
    const proc = createControllableProcess()
    spawnQueue.push(proc)
    mockGetOpencodeEnabled.mockReturnValue(true)

    setTimeout(() => {
      proc.pushStderr('listening on http://127.0.0.1:3000\n')
    }, 10)

    await restoreEnabledServer()

    const status = getServerStatus()
    expect(status.running).toBe(true)
    expect(status.url).toBe('http://127.0.0.1:3000')
  })

  it('restarts server after unexpected exit when enabled', async () => {
    const first = createControllableProcess()
    const second = createControllableProcess()
    spawnQueue.push(first)
    spawnQueue.push(second)
    mockGetOpencodeEnabled.mockReturnValue(true)

    setTimeout(() => {
      first.pushStderr('listening on http://127.0.0.1:4100\n')
    }, 10)

    await setServerEnabled(true)

    setTimeout(() => {
      second.pushStderr('listening on http://127.0.0.1:4200\n')
    }, 10)

    first.resolveExited(1)
    await new Promise((resolve) => setTimeout(resolve, 1200))

    const status = getServerStatus()
    expect(spawnCalls).toHaveLength(2)
    expect(status.running).toBe(true)
    expect(status.url).toBe('http://127.0.0.1:4200')
  })
})
