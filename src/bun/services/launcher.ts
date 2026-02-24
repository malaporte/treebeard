export async function launchVSCode(worktreePath: string): Promise<void> {
  const proc = Bun.spawn(['code', worktreePath], { stdout: 'pipe', stderr: 'pipe' })
  await proc.exited
}

export function launchGhostty(worktreePath: string): void {
  // Pass the path as a file argument so open(1) forwards it to the running
  // instance via application:openFile:, which Ghostty maps to a new tab/window
  // in the correct directory without spawning a second process.
  Bun.spawn(['open', '-a', 'Ghostty.app', worktreePath], {
    stdout: 'ignore',
    stderr: 'ignore'
  })
}
