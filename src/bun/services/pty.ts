import { spawn } from 'bun-pty'
import os from 'node:os'
import path from 'node:path'
import type { IPty, IDisposable } from 'bun-pty'

interface PtySession {
  pty: IPty
  disposables: IDisposable[]
}

const sessions = new Map<string, PtySession>()

/** Check whether a PTY session exists */
export function hasPtySession(id: string): boolean {
  return sessions.has(id)
}

/** Enriched PATH with common tool locations */
function enrichedPath(): string {
  const home = os.homedir()
  const extraDirs = [
    path.join(home, '.opencode', 'bin'),
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin'
  ]
  const existing = process.env.PATH ?? ''
  return [...extraDirs, existing].join(':')
}

/** Spawn a PTY session running opencode in the given worktree directory */
export function createPtySession(
  id: string,
  worktreePath: string,
  cols: number,
  rows: number,
  onData: (data: string) => void,
  onExit: (exitCode: number) => void
): void {
  const pty = spawn('/bin/zsh', ['-l', '-c', 'opencode --continue'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: worktreePath,
    env: {
      ...process.env,
      PATH: enrichedPath(),
      HOME: os.homedir(),
      TERM: 'xterm-256color'
    }
  })

  const disposables: IDisposable[] = []

  disposables.push(
    pty.onData((data) => {
      onData(data)
    })
  )

  disposables.push(
    pty.onExit(({ exitCode }) => {
      onExit(exitCode)
      sessions.delete(id)
    })
  )

  sessions.set(id, { pty, disposables })
}

/** Write data to a PTY session's stdin */
export function writePty(id: string, data: string): void {
  const session = sessions.get(id)
  if (!session) return
  session.pty.write(data)
}

/** Resize a PTY session */
export function resizePty(id: string, cols: number, rows: number): void {
  const session = sessions.get(id)
  if (!session) return
  session.pty.resize(cols, rows)
}

/** Close a PTY session and clean up */
export function closePty(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  for (const d of session.disposables) {
    d.dispose()
  }
  session.pty.kill()
  sessions.delete(id)
}

/** Close all PTY sessions (call on app quit) */
export function closeAllPty(): void {
  for (const [id] of sessions) {
    closePty(id)
  }
}
