import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { ServerMessage, ClientMessage, HealthResponse } from '../shared/types'

// bun-types without DOM lib exposes an incomplete Response interface.
// At runtime fetch returns a full Response; cast through `any` to access standard properties.
type FetchResponse = { ok: boolean; status: number; json: () => Promise<unknown> }

let serverProcess: ChildProcess
let port: number

/** Wait for the health endpoint to respond */
async function pollHealth(port: number, maxAttempts: number = 50): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`) as unknown as FetchResponse
      if (resp.ok) return true
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

beforeAll(async () => {
  // Use a random high port to avoid conflicts
  port = 10000 + Math.floor(Math.random() * 50000)

  serverProcess = spawn('bun', ['run', 'src/server/index.ts'], {
    cwd: new URL('../../', import.meta.url).pathname,
    env: { ...process.env, PIPPIN_PORT: String(port), PIPPIN_HOST: '127.0.0.1' },
    stdio: 'pipe',
  })

  const healthy = await pollHealth(port)
  if (!healthy) {
    serverProcess.kill()
    throw new Error('Server failed to start within timeout')
  }
}, 15000)

afterAll(() => {
  serverProcess?.kill('SIGTERM')
})

function wsUrl(cmd: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ cmd, ...extra })
  return `ws://127.0.0.1:${port}/exec?${params.toString()}`
}

function httpUrl(path: string): string {
  return `http://127.0.0.1:${port}${path}`
}

/** Collect all server messages until the WebSocket closes or timeout */
function collectMessages(ws: WebSocket, timeoutMs: number = 5000): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: ServerMessage[] = []
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error(`Timed out after ${timeoutMs}ms. Messages so far: ${JSON.stringify(messages)}`))
    }, timeoutMs)

    ws.addEventListener('message', (event) => {
      try {
        messages.push(JSON.parse(String(event.data)))
      } catch {
        // Ignore malformed
      }
    })

    ws.addEventListener('close', () => {
      clearTimeout(timer)
      resolve(messages)
    })

    ws.addEventListener('error', (event) => {
      clearTimeout(timer)
      reject(new Error(`WebSocket error: ${event}`))
    })
  })
}

/** Wait for the WebSocket to open */
function waitForOpen(ws: WebSocket, timeoutMs: number = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timed out')), timeoutMs)
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    })
    ws.addEventListener('error', (event) => {
      clearTimeout(timer)
      reject(new Error(`WebSocket error during open: ${event}`))
    })
  })
}

describe('pippin server integration', () => {
  describe('health endpoint', () => {
    it('returns status, version, and activeSessions', async () => {
      const resp = await fetch(httpUrl('/health')) as unknown as FetchResponse
      expect(resp.ok).toBe(true)

      const body = await resp.json() as HealthResponse
      expect(body.status).toBe('ok')
      expect(body.version).toBe('0.1.0')
      expect(typeof body.activeSessions).toBe('number')
    })
  })

  describe('error handling', () => {
    it('returns 400 when cmd is missing from /exec', async () => {
      const resp = await fetch(httpUrl('/exec')) as unknown as FetchResponse
      expect(resp.status).toBe(400)

      const body = await resp.json() as { error: string }
      expect(body.error).toBe('missing cmd parameter')
    })

    it('returns 404 for unknown paths', async () => {
      const resp = await fetch(httpUrl('/unknown')) as unknown as FetchResponse
      expect(resp.status).toBe(404)
    })
  })

  describe('command execution', () => {
    it('runs echo and receives stdout + exit 0', async () => {
      const ws = new WebSocket(wsUrl('echo hello'))
      const messages = await collectMessages(ws)

      const stdoutMsgs = messages.filter((m) => m.type === 'stdout')
      const exitMsg = messages.find((m) => m.type === 'exit')

      const output = stdoutMsgs
        .map((m) => (m.type === 'stdout' ? Buffer.from(m.data, 'base64').toString() : ''))
        .join('')

      expect(output.trim()).toBe('hello')
      expect(exitMsg).toEqual({ type: 'exit', code: 0 })
    })

    it('receives non-zero exit code', async () => {
      const ws = new WebSocket(wsUrl('exit 42'))
      const messages = await collectMessages(ws)

      const exitMsg = messages.find((m) => m.type === 'exit')
      expect(exitMsg).toEqual({ type: 'exit', code: 42 })
    })

    it('receives stderr output', async () => {
      const ws = new WebSocket(wsUrl('echo error >&2'))
      const messages = await collectMessages(ws)

      const stderrMsgs = messages.filter((m) => m.type === 'stderr')
      const output = stderrMsgs
        .map((m) => (m.type === 'stderr' ? Buffer.from(m.data, 'base64').toString() : ''))
        .join('')

      expect(output.trim()).toBe('error')
    })

    it('pipes stdin to the command', async () => {
      const ws = new WebSocket(wsUrl('cat'))
      await waitForOpen(ws)

      const collector = collectMessages(ws)

      const input = 'hello from stdin'
      const stdinMsg: ClientMessage = { type: 'stdin', data: Buffer.from(input).toString('base64') }
      ws.send(JSON.stringify(stdinMsg))

      const closeMsg: ClientMessage = { type: 'close_stdin' }
      ws.send(JSON.stringify(closeMsg))

      const messages = await collector

      const stdoutMsgs = messages.filter((m) => m.type === 'stdout')
      const output = stdoutMsgs
        .map((m) => (m.type === 'stdout' ? Buffer.from(m.data, 'base64').toString() : ''))
        .join('')

      expect(output).toBe(input)
    })

    it('forwards SIGINT to the child process', async () => {
      // Start a long-running process
      const ws = new WebSocket(wsUrl('sleep 60'))
      await waitForOpen(ws)

      const collector = collectMessages(ws)

      // Give the process a moment to start
      await new Promise((resolve) => setTimeout(resolve, 100))

      const signalMsg: ClientMessage = { type: 'signal', signal: 'SIGINT' }
      ws.send(JSON.stringify(signalMsg))

      const messages = await collector

      const exitMsg = messages.find((m) => m.type === 'exit')
      expect(exitMsg).toBeDefined()
      // SIGINT typically causes exit code 130 (128 + 2), but may vary
      expect(exitMsg!.type).toBe('exit')
    })

    it('runs concurrent sessions independently', async () => {
      const ws1 = new WebSocket(wsUrl('echo first'))
      const ws2 = new WebSocket(wsUrl('echo second'))

      const [msgs1, msgs2] = await Promise.all([
        collectMessages(ws1),
        collectMessages(ws2),
      ])

      const out1 = msgs1
        .filter((m) => m.type === 'stdout')
        .map((m) => (m.type === 'stdout' ? Buffer.from(m.data, 'base64').toString() : ''))
        .join('')
        .trim()

      const out2 = msgs2
        .filter((m) => m.type === 'stdout')
        .map((m) => (m.type === 'stdout' ? Buffer.from(m.data, 'base64').toString() : ''))
        .join('')
        .trim()

      expect(out1).toBe('first')
      expect(out2).toBe('second')
    })

    it('respects cwd parameter', async () => {
      const ws = new WebSocket(wsUrl('pwd', { cwd: '/tmp' }))
      const messages = await collectMessages(ws)

      const output = messages
        .filter((m) => m.type === 'stdout')
        .map((m) => (m.type === 'stdout' ? Buffer.from(m.data, 'base64').toString() : ''))
        .join('')
        .trim()

      // /tmp may resolve to /private/tmp on macOS
      expect(output).toMatch(/\/tmp$/)
    })

    it('cleans up session when client disconnects', async () => {
      const ws = new WebSocket(wsUrl('sleep 60'))
      await waitForOpen(ws)

      // Verify session is active
      const healthBefore = await fetch(httpUrl('/health')) as unknown as FetchResponse
      const bodyBefore = await healthBefore.json() as HealthResponse
      expect(bodyBefore.activeSessions).toBeGreaterThanOrEqual(1)

      ws.close()

      // Give the server a moment to clean up
      await new Promise((resolve) => setTimeout(resolve, 200))

      const healthAfter = await fetch(httpUrl('/health')) as unknown as FetchResponse
      const bodyAfter = await healthAfter.json() as HealthResponse
      expect(bodyAfter.activeSessions).toBe(0)
    })
  })
})
