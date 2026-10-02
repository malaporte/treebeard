import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getShellEnv } from './shell-env'
import { IDE_REGISTRY } from '../../shared/ide-registry'
import type { IdeId } from '../../shared/types'

export interface ClaudeSession {
  id: string
  file: string
}

const SESSION_FILE_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i

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

/** Find the most recently active Claude Code session transcript for a folder */
export function findLatestClaudeSession(worktreePath: string): ClaudeSession | null {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  // Claude Code stores transcripts per folder, naming the folder with every non-alphanumeric char replaced by '-'
  const projectDir = path.join(configDir, 'projects', worktreePath.replace(/[^a-zA-Z0-9]/g, '-'))
  try {
    let latest: (ClaudeSession & { mtimeMs: number }) | null = null
    for (const entry of fs.readdirSync(projectDir)) {
      const match = SESSION_FILE_REGEX.exec(entry)
      if (!match) continue
      const file = path.join(projectDir, entry)
      const { mtimeMs } = fs.statSync(file)
      if (!latest || mtimeMs > latest.mtimeMs) latest = { id: match[1], file, mtimeMs }
    }
    return latest ? { id: latest.id, file: latest.file } : null
  } catch {
    return null
  }
}

/** Name an untitled Claude Code session, leaving titles set via /rename untouched */
export function ensureClaudeSessionTitle(session: ClaudeSession, title: string): void {
  try {
    if (fs.readFileSync(session.file, 'utf-8').includes('"type":"custom-title"')) return
    // Same entry the CLI appends for /rename; Claude Desktop reads it when importing the session
    const entry = JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: session.id })
    fs.appendFileSync(session.file, `${entry}\n`)
  } catch {}
}

async function createNamedClaudeSession(worktreePath: string, title: string): Promise<string | null> {
  const env = await getShellEnv()
  const whichProc = Bun.spawn(['which', 'claude'], { stdout: 'pipe', stderr: 'ignore', env })
  const claudePath = (await new Response(whichProc.stdout).text()).trim()
  if (!claudePath) return null
  const sessionId = crypto.randomUUID()
  // /rename runs locally without a model turn, leaving a titled transcript Desktop can import
  const proc = Bun.spawn([claudePath, '-p', '--session-id', sessionId, `/rename ${title}`], {
    cwd: worktreePath,
    stdout: 'ignore',
    stderr: 'ignore',
    env
  })
  return (await proc.exited) === 0 ? sessionId : null
}

/** Open the worktree in Claude Desktop, resuming its latest Claude Code session or starting one named after the worktree */
export async function launchClaudeDesktop(worktreePath: string): Promise<void> {
  const title = path.basename(worktreePath)
  const session = findLatestClaudeSession(worktreePath)
  if (session) ensureClaudeSessionTitle(session, title)
  const sessionId = session?.id ?? (await createNamedClaudeSession(worktreePath, title))
  // claude://resume imports the CLI session (or reuses Desktop's copy of it); opening a
  // bare folder starts an untitled Code session there instead
  const args = sessionId ? [`claude://resume?session=${sessionId}`] : ['-a', 'Claude', worktreePath]
  Bun.spawn(['/usr/bin/open', ...args], { stdout: 'ignore', stderr: 'ignore' })
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
