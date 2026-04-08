import path from 'node:path'
import { getShellEnv } from './shell-env'
import { IDE_REGISTRY } from '../../shared/ide-registry'
import type { IdeId } from '../../shared/types'

/** Launch the configured IDE for a given worktree path */
export async function launchIde(ideId: IdeId, worktreePath: string): Promise<void> {
  const ide = IDE_REGISTRY[ideId]
  const env = await getShellEnv()
  const proc = Bun.spawn([...ide.command, worktreePath], { stdout: 'pipe', stderr: 'pipe', env })
  await proc.exited
}

export async function launchGhostty(worktreePath: string): Promise<void> {
  // Use AppleScript to switch to an existing Ghostty tab for this worktree,
  // or open a new tab in the correct directory if none exists.
  // This ensures proper tab naming and tab management like the opencode launcher.
  const tabTitle = path.basename(worktreePath)
  const script = `
tell application "Ghostty"
  set targetPath to "${worktreePath}"
  set targetWindow to window 1
  repeat with t in every tab of targetWindow
    set term to focused terminal of t
    if working directory of term is targetPath then
      select tab t
      focus term
      return
    end if
  end repeat
  set cfg to new surface configuration
  set initial working directory of cfg to targetPath
  set newTab to new tab in targetWindow with configuration cfg
  perform action "set_tab_title:${tabTitle}" on (focused terminal of newTab)
end tell
`
  Bun.spawn(['/usr/bin/osascript', '-e', script], { stdout: 'ignore', stderr: 'ignore' })
}

export async function launchOpencode(worktreePath: string): Promise<void> {
  // Use AppleScript to switch to an existing Ghostty tab for this worktree,
  // or open a new tab running opencode if none exists.
  // Resolve the opencode binary path using the login shell env so it works
  // regardless of where opencode is installed.
  const env = await getShellEnv()
  const whichProc = Bun.spawn(['which', 'opencode'], { stdout: 'pipe', stderr: 'ignore', env })
  const opencodePath = (await new Response(whichProc.stdout).text()).trim()
  if (!opencodePath) return
  const tabTitle = path.basename(worktreePath)
  const script = `
tell application "Ghostty"
  set targetPath to "${worktreePath}"
  set targetWindow to window 1
  repeat with t in every tab of targetWindow
    set term to focused terminal of t
    if working directory of term is targetPath then
      select tab t
      focus term
      return
    end if
  end repeat
  set cfg to new surface configuration
  set initial working directory of cfg to targetPath
  set initial input of cfg to "${opencodePath}\n"
  set newTab to new tab in targetWindow with configuration cfg
  perform action "set_tab_title:${tabTitle}" on (focused terminal of newTab)
end tell
`
  Bun.spawn(['/usr/bin/osascript', '-e', script], { stdout: 'ignore', stderr: 'ignore' })
}

export async function launchURL(url: string): Promise<void> {
  const proc = Bun.spawn(['/usr/bin/open', url], {
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error('Failed to open URL')
  }
}
