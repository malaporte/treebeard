import { getShellEnv } from './shell-env'

export async function launchVSCode(worktreePath: string): Promise<void> {
  const env = await getShellEnv()
  const proc = Bun.spawn(['code', worktreePath], { stdout: 'pipe', stderr: 'pipe', env })
  await proc.exited
}

export async function launchGhostty(worktreePath: string): Promise<void> {
  // Pass the path as a file argument so open(1) forwards it to the running
  // instance via application:openFile:, which Ghostty maps to a new tab/window
  // in the correct directory without spawning a second process.
  const env = await getShellEnv()
  Bun.spawn(['open', '-a', 'Ghostty.app', worktreePath], {
    stdout: 'ignore',
    stderr: 'ignore',
    env
  })
}
