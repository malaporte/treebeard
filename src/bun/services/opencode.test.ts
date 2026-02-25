import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpencodeServerStatus } from '../../shared/types'

// --- Controllable mock process factory ---

interface MockProcess {
  pid: number
  stdout: ReadableStream
  stderr: ReadableStream
  exited: Promise<number>
  kill: ReturnType<typeof vi.fn>
  pushStdout: (text: string) => void
  closeStdout: () => void
  pushStderr: (text: string) => void
  closeStderr: () => void
  resolveExited: (code: number) => void
}

let nextPid = 1000

function createControllableProcess(): MockProcess {
  let stdoutController!: ReadableStreamDefaultController<Uint8Array>
  let stderrController!: ReadableStreamDefaultController<Uint8Array>
  let resolveExited!: (code: number) => void
  const encoder = new TextEncoder()

  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      stdoutController = controller
    }
  })

  const stderr = new ReadableStream<Uint8Array>({
    start(controller) {
      stderrController = controller
    }
  })

  const exited = new Promise<number>((resolve) => {
    resolveExited = resolve
  })

  const pid = nextPid++

  return {
    pid,
    stdout,
    stderr,
    exited,
    kill: vi.fn(),
    pushStdout: (text: string) => {
      try {
        stdoutController.enqueue(encoder.encode(text))
      } catch {
        // Stream already closed
      }
    },
    closeStdout: () => {
      try {
        stdoutController.close()
      } catch {
        // Already closed
      }
    },
    pushStderr: (text: string) => {
      try {
        stderrController.enqueue(encoder.encode(text))
      } catch {
        // Stream already closed
      }
    },
    closeStderr: () => {
      try {
        stderrController.close()
      } catch {
        // Already closed
      }
    },
    resolveExited: (code: number) => {
      resolveExited(code)
    }
  }
}

// --- Module-level mocks ---

const mockGetShellEnv = vi.fn<() => Promise<Record<string, string>>>().mockResolvedValue({ PATH: '/usr/bin' })
const mockGetOpencodeEnabled = vi.fn<(path: string) => boolean>().mockReturnValue(false)
const mockSetOpencodeEnabled = vi.fn<(path: string, enabled: boolean) => void>()
const mockGetOpencodeEnabledPaths = vi.fn<() => string[]>().mockReturnValue([])

vi.mock('./shell-env', () => ({
  getShellEnv: () => mockGetShellEnv()
}))

vi.mock('./config', () => ({
  getOpencodeEnabled: (path: string) => mockGetOpencodeEnabled(path),
  setOpencodeEnabled: (path: string, enabled: boolean) => mockSetOpencodeEnabled(path, enabled),
  getOpencodeEnabledPaths: () => mockGetOpencodeEnabledPaths()
}))

// Track spawned mock processes
let spawnQueue: MockProcess[] = []
let allCreatedProcesses: MockProcess[] = []
let spawnCalls: Array<{ command: string[]; options: Record<string, unknown> }> = []

function pushSpawnProcess(proc: MockProcess) {
  spawnQueue.push(proc)
  allCreatedProcesses.push(proc)
}

vi.stubGlobal('Bun', {
  spawn: vi.fn((command: string[], options: Record<string, unknown>) => {
    spawnCalls.push({ command, options })
    const proc = spawnQueue.shift()
    if (!proc) {
      throw new Error('No mock process in spawn queue')
    }
    return proc
  }),
  env: { HOME: '/Users/test', SHELL: '/bin/zsh' }
})

// Import after mocks are set up
const {
  getServerStatus,
  setServerEnabled,
  removeWorktreeServer,
  restoreEnabledServers,
  stopAllServers
} = await import('./opencode')

describe('opencode service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    spawnQueue = []
    allCreatedProcesses = []
    spawnCalls = []
    nextPid = 1000
    mockGetOpencodeEnabled.mockReturnValue(false)
    mockGetOpencodeEnabledPaths.mockReturnValue([])
  })

  afterEach(async () => {
    // Force-resolve exited on all processes so stopAllServers/killProcess won't hang
    for (const proc of allCreatedProcesses) {
      proc.resolveExited(0)
    }
    await stopAllServers()
  })

  describe('getServerStatus', () => {
    it('returns disabled status when no server is running', () => {
      mockGetOpencodeEnabled.mockReturnValue(false)
      const status = getServerStatus('/repo/worktree')
      expect(status).toEqual({
        enabled: false,
        running: false,
        url: null,
        pid: null,
        error: null
      })
    })

    it('returns enabled but not running when config says enabled but no process exists', () => {
      mockGetOpencodeEnabled.mockReturnValue(true)
      const status = getServerStatus('/repo/worktree')
      expect(status).toEqual({
        enabled: true,
        running: false,
        url: null,
        pid: null,
        error: null
      })
    })
  })

  describe('setServerEnabled (start)', () => {
    it('spawns opencode serve with correct command and cwd', async () => {
      const proc = createControllableProcess()
      pushSpawnProcess(proc)
      mockGetOpencodeEnabled.mockReturnValue(true)

      // Emit the URL shortly after spawn
      setTimeout(() => {
        proc.pushStderr('opencode server listening on http://127.0.0.1:4096\n')
        proc.closeStderr()
      }, 10)

      const status = await setServerEnabled('/repo/worktree', true)

      expect(mockSetOpencodeEnabled).toHaveBeenCalledWith('/repo/worktree', true)
      expect(spawnCalls[0].command).toEqual([
        'opencode', 'serve', '--hostname', '127.0.0.1', '--port', '0', '--print-logs'
      ])
      expect(spawnCalls[0].options.cwd).toBe('/repo/worktree')
      expect(status.running).toBe(true)
      expect(status.url).toBe('http://127.0.0.1:4096')
      expect(status.pid).toBe(proc.pid)
      expect(status.error).toBeNull()
    })

    it('parses URL from mixed stderr output', async () => {
      const proc = createControllableProcess()
      pushSpawnProcess(proc)
      mockGetOpencodeEnabled.mockReturnValue(true)

      setTimeout(() => {
        proc.pushStderr('INF starting server\n')
        proc.pushStderr('WRN OPENCODE_SERVER_PASSWORD is not set; server is unsecured\n')
        proc.pushStderr('INF opencode server listening on http://127.0.0.1:8192\n')
        proc.closeStderr()
      }, 10)

      const status = await setServerEnabled('/repo/worktree', true)
      expect(status.url).toBe('http://127.0.0.1:8192')
      expect(status.running).toBe(true)
    })

    it('parses URL when startup message is emitted on stdout', async () => {
      const proc = createControllableProcess()
      pushSpawnProcess(proc)
      mockGetOpencodeEnabled.mockReturnValue(true)

      setTimeout(() => {
        proc.pushStdout('OpenCode ready\n')
        proc.pushStdout('server listening on http://127.0.0.1:7331\n')
        proc.closeStdout()
      }, 10)

      const status = await setServerEnabled('/repo/worktree', true)
      expect(status.url).toBe('http://127.0.0.1:7331')
      expect(status.running).toBe(true)
    })

    it('sets error when URL is not found before stream ends', async () => {
      const proc = createControllableProcess()
      pushSpawnProcess(proc)
      mockGetOpencodeEnabled.mockReturnValue(true)

      setTimeout(() => {
        proc.pushStderr('Some output but no URL\n')
        proc.closeStderr()
        proc.resolveExited(1)
      }, 10)

      const status = await setServerEnabled('/repo/worktree', true)

      // Process exited → auto-cleanup removes from servers map → running=false
      // Wait a tick for the proc.exited handler to fire
      await new Promise((r) => setTimeout(r, 50))

      const currentStatus = getServerStatus('/repo/worktree')
      expect(currentStatus.running).toBe(false)
    })

    it('includes startup output in error when no URL is emitted', async () => {
      const proc = createControllableProcess()
      pushSpawnProcess(proc)
      mockGetOpencodeEnabled.mockReturnValue(true)

      setTimeout(() => {
        proc.pushStderr('failed to bind ephemeral port from runtime\n')
        proc.closeStderr()
        proc.closeStdout()
      }, 10)

      const status = await setServerEnabled('/repo/worktree', true)
      expect(status.running).toBe(true)
      expect(status.url).toBeNull()
      expect(status.error).toContain('Server did not report a listening URL within timeout')
      expect(status.error).toContain('failed to bind ephemeral port from runtime')
    })

    it('returns existing status when server is already running', async () => {
      const proc = createControllableProcess()
      pushSpawnProcess(proc)
      mockGetOpencodeEnabled.mockReturnValue(true)

      setTimeout(() => {
        proc.pushStderr('listening on http://127.0.0.1:5000\n')
        proc.closeStderr()
      }, 10)

      await setServerEnabled('/repo/worktree', true)

      // Second enable should not spawn a new process
      const status2 = await setServerEnabled('/repo/worktree', true)
      expect(spawnCalls).toHaveLength(1)
      expect(status2.url).toBe('http://127.0.0.1:5000')
    })
  })

  describe('setServerEnabled (stop)', () => {
    it('sends SIGTERM to running process', async () => {
      const proc = createControllableProcess()
      pushSpawnProcess(proc)
      mockGetOpencodeEnabled.mockReturnValue(true)

      setTimeout(() => {
        proc.pushStderr('listening on http://127.0.0.1:3000\n')
        proc.closeStderr()
      }, 10)

      await setServerEnabled('/repo/worktree', true)

      // Make kill resolve exited
      proc.kill.mockImplementation(() => {
        proc.resolveExited(0)
      })

      mockGetOpencodeEnabled.mockReturnValue(false)
      const status = await setServerEnabled('/repo/worktree', false)

      expect(mockSetOpencodeEnabled).toHaveBeenCalledWith('/repo/worktree', false)
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
      expect(status.running).toBe(false)
      expect(status.url).toBeNull()
    })

    it('returns not-running status when no server exists', async () => {
      mockGetOpencodeEnabled.mockReturnValue(false)
      const status = await setServerEnabled('/repo/worktree', false)
      expect(status.running).toBe(false)
    })
  })

  describe('process exit auto-cleanup', () => {
    it('removes server from map when process exits unexpectedly', async () => {
      const proc = createControllableProcess()
      pushSpawnProcess(proc)
      mockGetOpencodeEnabled.mockReturnValue(true)

      setTimeout(() => {
        proc.pushStderr('listening on http://127.0.0.1:6000\n')
        proc.closeStderr()
      }, 10)

      await setServerEnabled('/repo/worktree', true)
      expect(getServerStatus('/repo/worktree').running).toBe(true)

      // Simulate unexpected exit
      proc.resolveExited(1)
      await new Promise((r) => setTimeout(r, 50))

      expect(getServerStatus('/repo/worktree').running).toBe(false)
    })
  })

  describe('removeWorktreeServer', () => {
    it('stops server and disables in config', async () => {
      const proc = createControllableProcess()
      pushSpawnProcess(proc)
      mockGetOpencodeEnabled.mockReturnValue(true)

      setTimeout(() => {
        proc.pushStderr('listening on http://127.0.0.1:7000\n')
        proc.closeStderr()
      }, 10)

      await setServerEnabled('/repo/worktree', true)

      proc.kill.mockImplementation(() => {
        proc.resolveExited(0)
      })

      await removeWorktreeServer('/repo/worktree')

      expect(mockSetOpencodeEnabled).toHaveBeenCalledWith('/repo/worktree', false)
      expect(proc.kill).toHaveBeenCalled()
      expect(getServerStatus('/repo/worktree').running).toBe(false)
    })
  })

  describe('restoreEnabledServers', () => {
    it('starts servers for all previously enabled paths', async () => {
      mockGetOpencodeEnabledPaths.mockReturnValue(['/repo/a', '/repo/b'])
      mockGetOpencodeEnabled.mockReturnValue(true)

      const procA = createControllableProcess()
      const procB = createControllableProcess()
      pushSpawnProcess(procA)
      pushSpawnProcess(procB)

      setTimeout(() => {
        procA.pushStderr('listening on http://127.0.0.1:4001\n')
        procA.closeStderr()
        procB.pushStderr('listening on http://127.0.0.1:4002\n')
        procB.closeStderr()
      }, 10)

      await restoreEnabledServers()

      expect(spawnCalls).toHaveLength(2)
      expect(getServerStatus('/repo/a').url).toBe('http://127.0.0.1:4001')
      expect(getServerStatus('/repo/b').url).toBe('http://127.0.0.1:4002')
    })

    it('does nothing when no servers are enabled', async () => {
      mockGetOpencodeEnabledPaths.mockReturnValue([])
      await restoreEnabledServers()
      expect(spawnCalls).toHaveLength(0)
    })
  })

  describe('stopAllServers', () => {
    it('stops every managed server', async () => {
      mockGetOpencodeEnabledPaths.mockReturnValue([])
      mockGetOpencodeEnabled.mockReturnValue(true)

      const proc1 = createControllableProcess()
      const proc2 = createControllableProcess()
      pushSpawnProcess(proc1)
      pushSpawnProcess(proc2)

      setTimeout(() => {
        proc1.pushStderr('listening on http://127.0.0.1:9001\n')
        proc1.closeStderr()
      }, 10)
      setTimeout(() => {
        proc2.pushStderr('listening on http://127.0.0.1:9002\n')
        proc2.closeStderr()
      }, 10)

      await setServerEnabled('/repo/x', true)
      await setServerEnabled('/repo/y', true)

      proc1.kill.mockImplementation(() => proc1.resolveExited(0))
      proc2.kill.mockImplementation(() => proc2.resolveExited(0))

      await stopAllServers()

      expect(proc1.kill).toHaveBeenCalledWith('SIGTERM')
      expect(proc2.kill).toHaveBeenCalledWith('SIGTERM')
      expect(getServerStatus('/repo/x').running).toBe(false)
      expect(getServerStatus('/repo/y').running).toBe(false)
    })
  })
})
