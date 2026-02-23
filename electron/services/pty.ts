import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import type { WebContents } from 'electron'
import type * as ptyTypes from 'node-pty'

// node-pty must be loaded at runtime via createRequire (not a static import) so
// that electron-vite doesn't try to bundle it. We require from app.asar — not
// app.asar.unpacked — because node-pty internally replaces "app.asar" with
// "app.asar.unpacked" when resolving its spawn-helper binary. Loading from the
// unpacked path directly would cause a double replacement (.unpacked.unpacked).
// Electron transparently serves .js from the asar and redirects dlopen of the
// native .node addon to the unpacked copy (configured via asarUnpack).
const _require = createRequire(__filename)
const pty: typeof ptyTypes = app.isPackaged
  ? _require(path.join(process.resourcesPath, 'app.asar/node_modules/node-pty'))
  : _require('node-pty')

interface PtySession {
  process: ptyTypes.IPty
  webContents: WebContents
}

const sessions = new Map<string, PtySession>()

// Common locations where opencode and other dev tools may be installed,
// not present in the default macOS app PATH
const EXTRA_PATH_DIRS = [
  `${os.homedir()}/.opencode/bin`,
  `${os.homedir()}/.local/bin`,
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
].join(':')

/** Spawn opencode in a PTY for the given worktree path and wire data events to webContents. */
export function createPty(worktreePath: string, cols: number, rows: number, webContents: WebContents): string {
  const id = uuidv4()

  const existingPath = globalThis.process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin'
  const env = {
    ...globalThis.process.env,
    PATH: `${EXTRA_PATH_DIRS}:${existingPath}`,
  }

  const process = pty.spawn('/bin/zsh', ['-l', '-c', 'opencode --continue'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: worktreePath,
    env
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

/** Kill all open PTY sessions — called on app quit to prevent hanging. */
export function closeAllPty(): void {
  for (const [id, session] of sessions) {
    session.process.kill()
    sessions.delete(id)
  }
}
