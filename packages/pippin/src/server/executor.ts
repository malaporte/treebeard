import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { ServerMessage, ClientMessage } from '../shared/types'
import type { ServerWebSocket } from 'bun'

interface Session {
  id: string
  process: ChildProcess
  ws: ServerWebSocket<SessionData>
}

export interface SessionData {
  sessionId: string
}

const sessions = new Map<string, Session>()

let nextId = 0

function generateId(): string {
  return `sess_${++nextId}_${Date.now()}`
}

/** Start a command execution session, wiring the process to a WebSocket */
export function createSession(
  ws: ServerWebSocket<SessionData>,
  cmd: string,
  cwd?: string,
  env?: Record<string, string>,
): string {
  const sessionId = generateId()

  const mergedEnv = { ...process.env, ...env }

  const child = spawn('sh', ['-c', cmd], {
    cwd: cwd || process.cwd(),
    env: mergedEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const session: Session = { id: sessionId, process: child, ws }
  sessions.set(sessionId, session)

  child.stdout?.on('data', (chunk: Buffer) => {
    send(ws, { type: 'stdout', data: chunk.toString('base64') })
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    send(ws, { type: 'stderr', data: chunk.toString('base64') })
  })

  child.on('close', (code) => {
    send(ws, { type: 'exit', code: code ?? 1 })
    sessions.delete(sessionId)
    ws.close()
  })

  child.on('error', (err) => {
    send(ws, { type: 'error', message: err.message })
    sessions.delete(sessionId)
    ws.close()
  })

  return sessionId
}

/** Handle an incoming client message for a session */
export function handleMessage(sessionId: string, msg: ClientMessage): void {
  const session = sessions.get(sessionId)
  if (!session) return

  switch (msg.type) {
    case 'stdin': {
      const buf = Buffer.from(msg.data, 'base64')
      session.process.stdin?.write(buf)
      break
    }
    case 'close_stdin': {
      session.process.stdin?.end()
      break
    }
    case 'signal': {
      const signalMap: Record<string, NodeJS.Signals> = {
        SIGINT: 'SIGINT',
        SIGTERM: 'SIGTERM',
        SIGKILL: 'SIGKILL',
      }
      session.process.kill(signalMap[msg.signal])
      break
    }
    case 'resize': {
      // Resize is only meaningful for PTY sessions; no-op for pipe-based execution
      break
    }
  }
}

/** Clean up a session when the WebSocket closes */
export function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (!session) return

  try {
    session.process.kill('SIGTERM')
  } catch {
    // Process may have already exited
  }

  sessions.delete(sessionId)
}

/** Get the number of active sessions */
export function getActiveSessionCount(): number {
  return sessions.size
}

/** Kill all active sessions (for graceful shutdown) */
export function destroyAllSessions(): void {
  for (const [id] of sessions) {
    destroySession(id)
  }
}

function send(ws: ServerWebSocket<SessionData>, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // WebSocket may have closed
  }
}
