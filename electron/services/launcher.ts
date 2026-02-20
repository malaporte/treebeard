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

export function launchOpenCode(worktreePath: string): void {
  // -n is required here because -e with a custom command needs a fresh launch
  // to have its argv respected; passing to a running instance silently drops --args.
  spawn(
    'open',
    ['-na', 'Ghostty.app', '--args', `--working-directory=${worktreePath}`, '-e', 'opencode'],
    {
      detached: true,
      stdio: 'ignore'
    }
  ).unref()
}
