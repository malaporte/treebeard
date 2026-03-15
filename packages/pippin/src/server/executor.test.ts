import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import type { SessionData } from './executor'

// --- Mock child_process ---

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  kill: ReturnType<typeof vi.fn>
  pid: number
}

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { write: vi.fn(), end: vi.fn() }
  child.kill = vi.fn()
  child.pid = 12345
  return child
}

let fakeChild: FakeChild
const mockSpawn = vi.fn()

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

// --- Mock WebSocket ---

function createMockWs() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    data: { sessionId: '' } as SessionData,
  }
}

type MockWs = ReturnType<typeof createMockWs>

// --- Dynamic import for fresh module state ---

let createSession: typeof import('./executor').createSession
let handleMessage: typeof import('./executor').handleMessage
let destroySession: typeof import('./executor').destroySession
let getActiveSessionCount: typeof import('./executor').getActiveSessionCount
let destroyAllSessions: typeof import('./executor').destroyAllSessions

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  fakeChild = createFakeChild()
  mockSpawn.mockReset()
  mockSpawn.mockReturnValue(fakeChild)

  const mod = await import('./executor')
  createSession = mod.createSession
  handleMessage = mod.handleMessage
  destroySession = mod.destroySession
  getActiveSessionCount = mod.getActiveSessionCount
  destroyAllSessions = mod.destroyAllSessions
})

afterEach(() => {
  fakeChild.removeAllListeners()
  fakeChild.stdout.removeAllListeners()
  fakeChild.stderr.removeAllListeners()
})

function parseSent(ws: MockWs, index: number = 0) {
  return JSON.parse(ws.send.mock.calls[index][0])
}

describe('executor', () => {
  describe('createSession', () => {
    it('spawns sh -c with the given command', () => {
      const ws = createMockWs()
      createSession(ws as never, 'echo hello')

      expect(mockSpawn).toHaveBeenCalledWith(
        'sh',
        ['-c', 'echo hello'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      )
    })

    it('passes cwd to spawn when provided', () => {
      const ws = createMockWs()
      createSession(ws as never, 'ls', '/tmp')

      expect(mockSpawn).toHaveBeenCalledWith(
        'sh',
        ['-c', 'ls'],
        expect.objectContaining({ cwd: '/tmp' }),
      )
    })

    it('merges env into process.env for spawn', () => {
      const ws = createMockWs()
      createSession(ws as never, 'ls', undefined, { FOO: 'bar' })

      const spawnOpts = mockSpawn.mock.calls[0][2]
      expect(spawnOpts.env.FOO).toBe('bar')
    })

    it('returns a session id', () => {
      const ws = createMockWs()
      const id = createSession(ws as never, 'echo hi')

      expect(id).toMatch(/^sess_\d+_\d+$/)
    })

    it('sends stdout data as base64-encoded messages', () => {
      const ws = createMockWs()
      createSession(ws as never, 'echo hello')

      const chunk = Buffer.from('hello\n')
      fakeChild.stdout.emit('data', chunk)

      const msg = parseSent(ws)
      expect(msg.type).toBe('stdout')
      expect(Buffer.from(msg.data, 'base64').toString()).toBe('hello\n')
    })

    it('sends stderr data as base64-encoded messages', () => {
      const ws = createMockWs()
      createSession(ws as never, 'cmd')

      const chunk = Buffer.from('error output')
      fakeChild.stderr.emit('data', chunk)

      const msg = parseSent(ws)
      expect(msg.type).toBe('stderr')
      expect(Buffer.from(msg.data, 'base64').toString()).toBe('error output')
    })

    it('sends exit message and cleans up session on child close', () => {
      const ws = createMockWs()
      createSession(ws as never, 'exit 0')

      expect(getActiveSessionCount()).toBe(1)

      fakeChild.emit('close', 0)

      const msg = parseSent(ws)
      expect(msg).toEqual({ type: 'exit', code: 0 })
      expect(ws.close).toHaveBeenCalled()
      expect(getActiveSessionCount()).toBe(0)
    })

    it('sends exit code 1 when child close code is null', () => {
      const ws = createMockWs()
      createSession(ws as never, 'killed')

      fakeChild.emit('close', null)

      const msg = parseSent(ws)
      expect(msg).toEqual({ type: 'exit', code: 1 })
    })

    it('sends error message on child process error', () => {
      const ws = createMockWs()
      createSession(ws as never, 'bad')

      fakeChild.emit('error', new Error('spawn failed'))

      const msg = parseSent(ws)
      expect(msg).toEqual({ type: 'error', message: 'spawn failed' })
      expect(ws.close).toHaveBeenCalled()
      expect(getActiveSessionCount()).toBe(0)
    })
  })

  describe('handleMessage', () => {
    it('writes base64-decoded stdin data to child process', () => {
      const ws = createMockWs()
      const sessionId = createSession(ws as never, 'cat')

      const data = Buffer.from('input data').toString('base64')
      handleMessage(sessionId, { type: 'stdin', data })

      expect(fakeChild.stdin.write).toHaveBeenCalledWith(
        Buffer.from('input data'),
      )
    })

    it('ends child stdin on close_stdin message', () => {
      const ws = createMockWs()
      const sessionId = createSession(ws as never, 'cat')

      handleMessage(sessionId, { type: 'close_stdin' })

      expect(fakeChild.stdin.end).toHaveBeenCalled()
    })

    it('kills child with SIGINT on signal message', () => {
      const ws = createMockWs()
      const sessionId = createSession(ws as never, 'sleep 100')

      handleMessage(sessionId, { type: 'signal', signal: 'SIGINT' })

      expect(fakeChild.kill).toHaveBeenCalledWith('SIGINT')
    })

    it('kills child with SIGTERM on signal message', () => {
      const ws = createMockWs()
      const sessionId = createSession(ws as never, 'sleep 100')

      handleMessage(sessionId, { type: 'signal', signal: 'SIGTERM' })

      expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('kills child with SIGKILL on signal message', () => {
      const ws = createMockWs()
      const sessionId = createSession(ws as never, 'sleep 100')

      handleMessage(sessionId, { type: 'signal', signal: 'SIGKILL' })

      expect(fakeChild.kill).toHaveBeenCalledWith('SIGKILL')
    })

    it('is a no-op for resize messages (pipe mode)', () => {
      const ws = createMockWs()
      const sessionId = createSession(ws as never, 'cmd')

      // Should not throw
      handleMessage(sessionId, { type: 'resize', cols: 80, rows: 24 })

      expect(fakeChild.kill).not.toHaveBeenCalled()
      expect(fakeChild.stdin.write).not.toHaveBeenCalled()
    })

    it('is a no-op for unknown session id', () => {
      handleMessage('nonexistent', { type: 'stdin', data: 'abc' })

      // Should not throw; mockSpawn should not have been called
      expect(mockSpawn).not.toHaveBeenCalled()
    })
  })

  describe('destroySession', () => {
    it('kills the process and removes the session', () => {
      const ws = createMockWs()
      const sessionId = createSession(ws as never, 'sleep 100')

      expect(getActiveSessionCount()).toBe(1)

      destroySession(sessionId)

      expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM')
      expect(getActiveSessionCount()).toBe(0)
    })

    it('is a no-op for unknown session id', () => {
      destroySession('nonexistent')
      expect(getActiveSessionCount()).toBe(0)
    })
  })

  describe('getActiveSessionCount', () => {
    it('returns zero when no sessions exist', () => {
      expect(getActiveSessionCount()).toBe(0)
    })

    it('reflects the number of active sessions', () => {
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      createSession(ws1 as never, 'cmd1')
      createSession(ws2 as never, 'cmd2')

      expect(getActiveSessionCount()).toBe(2)
    })
  })

  describe('destroyAllSessions', () => {
    it('cleans up all active sessions', () => {
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      const ws3 = createMockWs()
      createSession(ws1 as never, 'cmd1')
      createSession(ws2 as never, 'cmd2')
      createSession(ws3 as never, 'cmd3')

      expect(getActiveSessionCount()).toBe(3)

      destroyAllSessions()

      expect(getActiveSessionCount()).toBe(0)
      expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })
})
