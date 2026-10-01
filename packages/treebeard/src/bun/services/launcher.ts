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
  // or open a new tab in the correct directory, split into two side-by-side
  // panes, if none exists. The left pane resumes Claude Code when installed.
  const env = await getShellEnv()
  const whichProc = Bun.spawn(['which', 'claude'], { stdout: 'pipe', stderr: 'ignore', env })
  const claudePath = (await new Response(whichProc.stdout).text()).trim()
  // --continue fails when the folder has no prior session, so fall back to a fresh one
  const claudeInput = claudePath
    ? `\n  set initial input of leftCfg to "${claudePath} --continue || ${claudePath}\\n"`
    : ''
  const pathParts = worktreePath.split('/')
  const worktreeName = pathParts.pop() || ''
  const projectName = pathParts.pop() || ''
  const tabTitle = `${projectName} / ${worktreeName}`
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
  set leftCfg to new surface configuration
  set initial working directory of leftCfg to targetPath${claudeInput}
  set newTab to new tab in targetWindow with configuration leftCfg
  set leftTerm to focused terminal of newTab
  perform action "set_tab_title:${tabTitle}" on leftTerm
  split leftTerm direction right with configuration cfg
  focus leftTerm
end tell
`
  Bun.spawn(['/usr/bin/osascript', '-e', script], { stdout: 'ignore', stderr: 'ignore' })
}

export async function launchPippinShell(worktreePath: string): Promise<void> {
  const env = await getShellEnv()
  const whichProc = Bun.spawn(['which', 'pippin'], { stdout: 'pipe', stderr: 'ignore', env })
  const pippinPath = (await new Response(whichProc.stdout).text()).trim()
  if (!pippinPath) return
  const shellPath = env.PATH || process.env.PATH || ''

  const script = `
tell application "Ghostty"
  set cfg to new surface configuration
  set initial working directory of cfg to "${worktreePath}"
  set command of cfg to "${pippinPath} shell"
  set environment variables of cfg to {"PATH=${shellPath}"}
  if (count of windows) is 0 then
    new window with configuration cfg
    return
  end if
  tell window 1
    new tab with configuration cfg
  end tell
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
