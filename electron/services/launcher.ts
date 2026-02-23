import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function launchVSCode(worktreePath: string): Promise<void> {
  await execFileAsync('code', [worktreePath])
}

export function launchGhostty(worktreePath: string): void {
  // Pass the path as a file argument so open(1) forwards it to the running
  // instance via application:openFile:, which Ghostty maps to a new tab/window
  // in the correct directory without spawning a second process.
  spawn('open', ['-a', 'Ghostty.app', worktreePath], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}
