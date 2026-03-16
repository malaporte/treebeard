import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSpawnProcess } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' })),
}))

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/Users/test',
  },
}))

vi.mock('./paths', () => ({
  getBundledBinaryPath: (name: string) => `/bundled/bin/${name}`,
}))

let mockSandboxMountPath: string | null = null

vi.mock('./config', () => ({
  getSandboxMountPath: () => mockSandboxMountPath,
}))

const mockMkdirSync = vi.fn()
const mockStatSync = vi.fn()
const mockCopyFileSync = vi.fn()
const mockChmodSync = vi.fn()
const mockReaddirSync = vi.fn().mockReturnValue([])
const mockRmSync = vi.fn()

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    statSync: (...args: unknown[]) => mockStatSync(...args),
    copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
    chmodSync: (...args: unknown[]) => mockChmodSync(...args),
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
    rmSync: (...args: unknown[]) => mockRmSync(...args),
  },
}))

// --- Dynamic import for fresh module state per test ---

type LeashModule = typeof import('./leash')

let leash: LeashModule
let mockSpawn: ReturnType<typeof vi.fn>
let mockSpawnSync: ReturnType<typeof vi.fn>
let mockFetch: ReturnType<typeof vi.fn>

/** Wraps createSpawnProcess with a manually-resolvable exited promise for async tests */
function createMockSubprocess(exitCode: number = 0) {
  let resolveExited: (code: number) => void
  const exited = new Promise<number>((resolve) => {
    resolveExited = resolve
  })

  return {
    process: {
      ...createSpawnProcess({ stdout: '', exitCode }),
      exited,
      kill: vi.fn(),
    },
    resolveExited: resolveExited!,
  }
}

/** Immediate-resolve docker process — no exit gating needed for container cleanup calls */
function createDockerProcess() {
  return {
    stdout: new Response('').body,
    stderr: new Response('').body,
    exited: Promise.resolve(0),
    kill: vi.fn(),
  }
}

/**
 * Find the spawn call that started leash (not docker).
 * removeContainers() calls docker ps/rm before the leash spawn.
 */
function findLeashSpawnCall(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.find(
    (call: unknown[]) => Array.isArray(call[0]) && call[0][0] === 'leash',
  )
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  mockMkdirSync.mockReset()
  mockStatSync.mockReset()
  mockCopyFileSync.mockReset()
  mockChmodSync.mockReset()
  mockReaddirSync.mockReset().mockReturnValue([])
  mockRmSync.mockReset()
  mockSandboxMountPath = null

  // Default: statSync throws (binary doesn't exist at dest)
  mockStatSync.mockImplementation(() => {
    throw new Error('ENOENT')
  })

  // Set up Bun.spawn mock — command-aware so removeContainers (docker)
  // and startSandbox (leash) each get the right kind of mock process.
  mockSpawn = vi.fn()
  mockSpawnSync = vi.fn().mockReturnValue({ stdout: { toString: () => '' } })
  vi.stubGlobal('Bun', {
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
    env: { HOME: '/Users/test', SHELL: '/bin/zsh' },
  })

  // Set up fetch mock — default: health check succeeds on first try
  mockFetch = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', mockFetch)

  leash = await import('./leash')
})

/**
 * Set up mockSpawn to return a docker process for docker commands and
 * the given leash process for the leash spawn. This handles the
 * removeContainers() call that precedes startSandbox().
 */
function setupSpawnForStart(leashProc: ReturnType<typeof createMockSubprocess>['process']) {
  mockSpawn.mockImplementation((cmd: string[]) => {
    if (cmd[0] === 'docker') return createDockerProcess()
    return leashProc
  })
}

describe('leash service', () => {
  describe('startSandbox', () => {
    it('copies binary and spawns leash with correct arguments', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('leash-share'),
        { recursive: true },
      )
      expect(mockCopyFileSync).toHaveBeenCalled()
      expect(mockChmodSync).toHaveBeenCalledWith(
        expect.stringContaining('pippin-server'),
        0o755,
      )
      const leashCall = findLeashSpawnCall(mockSpawn)
      expect(leashCall).toBeTruthy()
      expect(leashCall![0]).toEqual(
        ['leash', '-p', '9111:9111', '-I', '--', '/leash/pippin-server'],
      )
    })

    it('adds -v flag when sandboxMountPath is configured', async () => {
      mockSandboxMountPath = '/Users/test/Developer'
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()

      const leashCall = findLeashSpawnCall(mockSpawn)
      expect(leashCall).toBeTruthy()
      expect(leashCall![0]).toEqual([
        'leash',
        '-p', '9111:9111',
        '-v', '/Users/test/Developer:/workspace',
        '-I', '--', '/leash/pippin-server',
      ])
    })

    it('passes LEASH_SHARE_DIR in the environment', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()

      const leashCall = findLeashSpawnCall(mockSpawn)
      expect(leashCall).toBeTruthy()
      expect(leashCall![1].env.LEASH_SHARE_DIR).toMatch(/leash-share$/)
    })

    it('transitions to running state after health check passes', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      const status = await leash.startSandbox()

      expect(status.state).toBe('running')
      expect(status.port).toBe(9111)
      expect(status.controlUiPort).toBe(18080)
      expect(status.error).toBeNull()
    })

    it('returns current status when already running', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()

      // Second call should be a no-op
      const status = await leash.startSandbox()

      expect(status.state).toBe('running')
      // Only one leash spawn call (docker calls are separate)
      const leashCalls = mockSpawn.mock.calls.filter(
        (call: unknown[]) => Array.isArray(call[0]) && call[0][0] === 'leash',
      )
      expect(leashCalls).toHaveLength(1)
    })

    it('removes stale files from share directory but keeps pippin-server', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      mockReaddirSync.mockReturnValue(['ca-cert.pem', 'pippin-server', '.ready'])

      await leash.startSandbox()

      // Should remove ca-cert.pem and .ready, but not pippin-server
      expect(mockRmSync).toHaveBeenCalledTimes(2)
      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining('ca-cert.pem'),
        { force: true },
      )
      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining('.ready'),
        { force: true },
      )
    })

    it('skips binary copy when destination is up to date', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      // Make statSync return matching stats for both src and dest
      mockStatSync.mockReturnValue({ size: 1000, mtimeMs: 100 })

      await leash.startSandbox()

      expect(mockCopyFileSync).not.toHaveBeenCalled()
      expect(mockChmodSync).not.toHaveBeenCalled()
    })

    it('copies binary when destination is outdated', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      let callCount = 0
      mockStatSync.mockImplementation(() => {
        callCount++
        if (callCount === 1) return { size: 2000, mtimeMs: 200 }
        return { size: 1000, mtimeMs: 100 }
      })

      await leash.startSandbox()

      expect(mockCopyFileSync).toHaveBeenCalled()
    })

    it('transitions to error state when health check times out', async () => {
      const { process: proc, resolveExited } = createMockSubprocess()
      setupSpawnForStart(proc)

      // Health check always fails
      mockFetch.mockRejectedValue(new Error('connection refused'))

      // Use fake timers to avoid waiting for real 60s timeout
      vi.useFakeTimers()

      const startPromise = leash.startSandbox()

      // Advance through all 60 health check attempts (1000ms interval each)
      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }

      // The stop during health timeout will wait for the process to exit
      resolveExited(0)
      await vi.advanceTimersByTimeAsync(100)

      const status = await startPromise

      vi.useRealTimers()

      expect(status.state).toBe('error')
      expect(status.error).toBe('pippin-server did not become healthy within timeout')
    })

    it('transitions to error on exception during startup', async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error('leash not found')
      })

      const status = await leash.startSandbox()

      expect(status.state).toBe('error')
      expect(status.error).toBe('leash not found')
    })
  })

  describe('stopSandbox', () => {
    it('sends SIGTERM, removes containers, and transitions to stopped', async () => {
      const { process: proc, resolveExited } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()

      // Resolve the exited promise when kill is called
      proc.kill.mockImplementation(() => {
        resolveExited(0)
      })

      const status = await leash.stopSandbox()

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
      expect(status.state).toBe('stopped')
      expect(status.port).toBeNull()
    })

    it('removes running Docker containers on stop', async () => {
      const { process: proc, resolveExited } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()

      proc.kill.mockImplementation(() => {
        resolveExited(0)
      })

      // After leash stops, removeContainers runs again during stopSandbox.
      // Override mockSpawn to return container IDs for the docker ps call.
      const dockerPsWithContainers = {
        stdout: new Response('abc123\ndef456\n').body,
        stderr: new Response('').body,
        exited: Promise.resolve(0),
        kill: vi.fn(),
      }
      let stopDockerPsReturned = false
      mockSpawn.mockImplementation((cmd: string[]) => {
        if (cmd[0] === 'docker' && cmd[1] === 'ps' && !stopDockerPsReturned) {
          stopDockerPsReturned = true
          return dockerPsWithContainers
        }
        return createDockerProcess()
      })

      await leash.stopSandbox()

      // Find the docker rm -f call
      const rmCall = mockSpawn.mock.calls.find(
        (call: unknown[]) => Array.isArray(call[0]) && call[0][0] === 'docker' && call[0][1] === 'rm',
      )
      expect(rmCall).toBeTruthy()
      expect(rmCall![0]).toEqual(['docker', 'rm', '-fv', 'abc123', 'def456'])
    })

    it('returns current status when already stopped', async () => {
      const status = await leash.stopSandbox()

      expect(status.state).toBe('stopped')
      expect(mockSpawn).not.toHaveBeenCalled()
    })
  })

  describe('getSandboxStatus', () => {
    it('returns stopped state initially', () => {
      const status = leash.getSandboxStatus()

      expect(status).toMatchObject({
        state: 'stopped',
        port: null,
        controlUiPort: null,
        error: null,
      })
      expect(Array.isArray(status.log)).toBe(true)
    })

    it('returns running state with ports after successful start', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()

      const status = leash.getSandboxStatus()

      expect(status.state).toBe('running')
      expect(status.port).toBe(9111)
      expect(status.controlUiPort).toBe(18080)
    })
  })

  describe('forceStopSandbox', () => {
    it('sends SIGKILL, removes containers synchronously, and resets state', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()

      leash.forceStopSandbox()

      expect(proc.kill).toHaveBeenCalledWith('SIGKILL')
      // spawnSync should have been called for docker ps (once per image)
      expect(mockSpawnSync).toHaveBeenCalled()
      const psCall = mockSpawnSync.mock.calls.find(
        (call: unknown[]) => Array.isArray(call[0]) && call[0][0] === 'docker' && call[0][1] === 'ps',
      )
      expect(psCall).toBeTruthy()

      const status = leash.getSandboxStatus()
      expect(status.state).toBe('stopped')
    })

    it('removes containers synchronously when docker ps returns IDs', async () => {
      const { process: proc } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()

      // First spawnSync (docker ps) returns container IDs, second (docker rm) succeeds
      mockSpawnSync
        .mockReturnValueOnce({ stdout: { toString: () => 'abc123\n' } })
        .mockReturnValueOnce({ stdout: { toString: () => '' } })
        .mockReturnValueOnce({ stdout: { toString: () => 'def456\n' } })
        .mockReturnValueOnce({ stdout: { toString: () => '' } })

      leash.forceStopSandbox()

      const rmCalls = mockSpawnSync.mock.calls.filter(
        (call: unknown[]) => Array.isArray(call[0]) && call[0][0] === 'docker' && call[0][1] === 'rm',
      )
      expect(rmCalls.length).toBe(2)
      expect(rmCalls[0][0]).toEqual(['docker', 'rm', '-fv', 'abc123'])
      expect(rmCalls[1][0]).toEqual(['docker', 'rm', '-fv', 'def456'])
    })

    it('is safe to call when no process exists', () => {
      leash.forceStopSandbox()

      const status = leash.getSandboxStatus()
      expect(status.state).toBe('stopped')
    })
  })

  describe('unexpected process exit', () => {
    it('transitions to error state when leash exits while running', async () => {
      const { process: proc, resolveExited } = createMockSubprocess()
      setupSpawnForStart(proc)

      await leash.startSandbox()
      expect(leash.getSandboxStatus().state).toBe('running')

      // Simulate unexpected exit
      resolveExited(1)

      // The .then handler runs asynchronously; wait a tick
      await new Promise((resolve) => setTimeout(resolve, 10))

      const status = leash.getSandboxStatus()
      expect(status.state).toBe('error')
      expect(status.error).toBe('leash exited unexpectedly with code 1')
    })
  })
})
