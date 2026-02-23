import pty from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import type { WebContents } from 'electron'

interface PtySession {
  process: pty.IPty
  webContents: WebContents
}

const sessions = new Map<string, PtySession>()

/** Spawn opencode in a PTY for the given worktree path and wire data events to webContents. */
export function createPty(worktreePath: string, cols: number, rows: number, webContents: WebContents): string {
  const id = uuidv4()

  const process = pty.spawn('opencode', ['--continue'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: worktreePath,
    env: { ...globalThis.process.env }
  })

  process.onData((data) => {
    if (!webContents.isDestroyed()) {
      webContents.send('pty:data', id, data)
    }
  })

  process.onExit(() => {
    sessions.delete(id)
    if (!webContents.isDestroyed()) {
      webContents.send('pty:exit', id)
    }
  })

  sessions.set(id, { process, webContents })
  return id
}

/** Write user input to an existing PTY session. */
export function writePty(id: string, data: string): void {
  sessions.get(id)?.process.write(data)
}

/** Resize an existing PTY session to match new terminal dimensions. */
export function resizePty(id: string, cols: number, rows: number): void {
  sessions.get(id)?.process.resize(cols, rows)
}

/** Kill an existing PTY session. */
export function closePty(id: string): void {
  const session = sessions.get(id)
  if (session) {
    session.process.kill()
    sessions.delete(id)
  }
}
