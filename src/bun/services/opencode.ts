import { getShellEnv } from './shell-env'
import { getOpencodeEnabled, setOpencodeEnabled } from './config'
import type { OpencodeServerStatus, OpencodeSyncStatus } from '../../shared/types'

const STARTUP_TIMEOUT_MS = 20000
const STOP_TIMEOUT_MS = 5000
const MAX_STARTUP_CAPTURE_CHARS = 16000
const RESTART_BASE_DELAY_MS = 1000
const RESTART_MAX_DELAY_MS = 30000
const URL_PATTERN = /https?:\/\/\S+/
const REAPER_GRACE_MS = 250

interface ManagedServer {
  process: ReturnType<typeof Bun.spawn>
  pid: number
  url: string | null
  error: string | null
}

interface UrlWaitResult {
  url: string | null
  output: string
}

interface ProjectLike {
  worktree?: unknown
  sandboxes?: unknown
}

interface SessionLike {
  directory?: unknown
}

let server: ManagedServer | null = null
let pendingStart: Promise<OpencodeServerStatus> | null = null
let stoppingPid: number | null = null
let restartTimer: ReturnType<typeof setTimeout> | null = null
let restartAttempts = 0

/** Get the current status for the global OpenCode server. */
export function getServerStatus(): OpencodeServerStatus {
  const enabled = getOpencodeEnabled()
  if (!server) {
    return { enabled, running: false, url: null, pid: null, error: null }
  }

  return {
    enabled,
    running: true,
    url: server.url,
    pid: server.pid,
    error: server.error
  }
}

/** Enable or disable the global OpenCode server. Returns final status. */
export async function setServerEnabled(enabled: boolean): Promise<OpencodeServerStatus> {
  setOpencodeEnabled(enabled)
  if (enabled) {
    return startServer()
  }
  return stopServer()
}

/** Starts the global server on app launch when enabled. */
export async function restoreEnabledServer(): Promise<void> {
  if (!getOpencodeEnabled()) return
  await startServer()
}

/** Compares Treebeard worktrees with OpenCode projects/sessions. */
export async function getServerSync(worktreePaths: string[]): Promise<OpencodeSyncStatus> {
  const status = getServerStatus()
  const checkedAt = new Date().toISOString()
  const treebeardSet = new Set(worktreePaths.map((path) => normalizePath(path)))

  if (!status.running || !status.url) {
    return {
      checkedAt,
      serverRunning: false,
      treebeardWorktrees: treebeardSet.size,
      opencodeProjects: 0,
      opencodeSessionDirectories: 0,
      missingProjects: [...treebeardSet].sort(),
      staleProjects: [],
      missingSessionDirectories: [...treebeardSet].sort(),
      staleSessionDirectories: [],
      error: status.error || 'OpenCode server is not running'
    }
  }

  try {
    const base = new URL(status.url)
    const [projectsResp, sessionsResp] = await Promise.all([
      fetch(new URL('/project', base)),
      fetch(new URL('/session', base))
    ])

    if (!projectsResp.ok || !sessionsResp.ok) {
      return {
        checkedAt,
        serverRunning: true,
        treebeardWorktrees: treebeardSet.size,
        opencodeProjects: 0,
        opencodeSessionDirectories: 0,
        missingProjects: [...treebeardSet].sort(),
        staleProjects: [],
        missingSessionDirectories: [...treebeardSet].sort(),
        staleSessionDirectories: [],
        error: `OpenCode sync failed (/project=${projectsResp.status}, /session=${sessionsResp.status})`
      }
    }

    const projects = await projectsResp.json() as ProjectLike[]
    const sessions = await sessionsResp.json() as SessionLike[]

    const opencodeProjectSet = new Set<string>()
    for (const project of projects) {
      const worktree = typeof project.worktree === 'string' ? normalizePath(project.worktree) : null
      if (worktree) opencodeProjectSet.add(worktree)

      const sandboxes = Array.isArray(project.sandboxes) ? project.sandboxes : []
      for (const sandbox of sandboxes) {
        if (typeof sandbox !== 'string') continue
        const normalized = normalizePath(sandbox)
        if (normalized) opencodeProjectSet.add(normalized)
      }
    }

    const opencodeSessionSet = new Set<string>()
    for (const session of sessions) {
      if (typeof session.directory !== 'string') continue
      const normalized = normalizePath(session.directory)
      if (normalized) opencodeSessionSet.add(normalized)
    }

    return {
      checkedAt,
      serverRunning: true,
      treebeardWorktrees: treebeardSet.size,
      opencodeProjects: opencodeProjectSet.size,
      opencodeSessionDirectories: opencodeSessionSet.size,
      missingProjects: [...difference(treebeardSet, opencodeProjectSet)].sort(),
      staleProjects: [...difference(opencodeProjectSet, treebeardSet)].sort(),
      missingSessionDirectories: [...difference(treebeardSet, opencodeSessionSet)].sort(),
      staleSessionDirectories: [...difference(opencodeSessionSet, treebeardSet)].sort(),
      error: null
    }
  } catch {
    return {
      checkedAt,
      serverRunning: true,
      treebeardWorktrees: treebeardSet.size,
      opencodeProjects: 0,
      opencodeSessionDirectories: 0,
      missingProjects: [...treebeardSet].sort(),
      staleProjects: [],
      missingSessionDirectories: [...treebeardSet].sort(),
      staleSessionDirectories: [],
      error: 'Failed to query OpenCode projects/sessions'
    }
  }
}

/** Stop the global managed server. Called on app shutdown. */
export async function stopAllServers(): Promise<void> {
  await stopServer()
}

/** Synchronously force-kills the managed server during final process exit. */
export function forceStopAllServers(): void {
  if (!server) return
  try {
    stoppingPid = server.pid
    server.process.kill('SIGTERM')
  } catch {
    // Ignore kill errors during process teardown.
  }
  clearRestartTimer()
  restartAttempts = 0
  server = null
  pendingStart = null
}

async function startServer(): Promise<OpencodeServerStatus> {
  if (pendingStart) return pendingStart

  const promise = doStart()
  pendingStart = promise
  try {
    return await promise
  } finally {
    pendingStart = null
  }
}

async function doStart(): Promise<OpencodeServerStatus> {
  if (server) return getServerStatus()

  await reapStaleProcesses()

  const env = await getShellEnv()
  const proc = Bun.spawn(
    ['opencode', 'serve', '--hostname', '127.0.0.1', '--port', '0', '--print-logs'],
    {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      env
    }
  )

  const next: ManagedServer = {
    process: proc,
    pid: proc.pid,
    url: null,
    error: null
  }
  server = next

  proc.exited.then(() => {
    const exitedPid = proc.pid
    if (server?.pid === exitedPid) {
      server = null
    }

    if (stoppingPid === exitedPid) {
      stoppingPid = null
      return
    }

    if (getOpencodeEnabled()) {
      scheduleRestart()
    }
  })

  const startup = await waitForUrl(proc, STARTUP_TIMEOUT_MS)
  if (!server || server.pid !== proc.pid) {
    return getServerStatus()
  }

  if (startup.url) {
    server.url = startup.url
    restartAttempts = 0
  } else {
    server.error = formatStartupError(startup.output)
  }

  return getServerStatus()
}

async function stopServer(): Promise<OpencodeServerStatus> {
  if (pendingStart) await pendingStart
  if (!server) return getServerStatus()

  const current = server
  stoppingPid = current.pid
  server = null
  clearRestartTimer()
  restartAttempts = 0
  await killProcess(current.process)
  return getServerStatus()
}

function scheduleRestart(): void {
  if (restartTimer || pendingStart || server) return

  const delay = Math.min(RESTART_BASE_DELAY_MS * 2 ** restartAttempts, RESTART_MAX_DELAY_MS)
  restartAttempts += 1
  restartTimer = setTimeout(() => {
    restartTimer = null
    if (!getOpencodeEnabled()) return
    if (server || pendingStart) return
    void startServer()
  }, delay)
}

function clearRestartTimer(): void {
  if (!restartTimer) return
  clearTimeout(restartTimer)
  restartTimer = null
}

async function killProcess(proc: ReturnType<typeof Bun.spawn>): Promise<void> {
  try {
    proc.kill('SIGTERM')
  } catch {
    return
  }

  const exited = await Promise.race([
    proc.exited.then(() => true),
    sleep(STOP_TIMEOUT_MS).then(() => false)
  ])

  if (!exited) {
    try {
      proc.kill('SIGKILL')
    } catch {
      // Already dead
    }
    await Promise.race([proc.exited, sleep(1000)])
  }
}

async function waitForUrl(proc: ReturnType<typeof Bun.spawn>, timeoutMs: number): Promise<UrlWaitResult> {
  return new Promise((resolve) => {
    let resolved = false
    let accumulated = ''
    let activeReaders = 0

    const finish = (result: UrlWaitResult) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({ url: null, output: accumulated })
    }, timeoutMs)

    const tryResolveUrl = (text: string) => {
      const match = text.match(URL_PATTERN)
      if (match) {
        finish({ url: trimUrl(match[0]), output: accumulated })
        return true
      }
      return false
    }

    // Drain a pipe stream for the lifetime of the process. After URL detection,
    // keeps reading to prevent backpressure from filling Bun's in-process buffer
    // (OpenCode with --print-logs writes continuously to stderr).
    const drain = async (stream: ReadableStream | null | undefined) => {
      const reader = stream ? new Response(stream).body?.getReader() : null
      if (!reader) return
      activeReaders += 1
      const decoder = new TextDecoder()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          if (!resolved) {
            const chunk = decoder.decode(value, { stream: true })
            accumulated = appendCapturedOutput(accumulated, chunk)
            tryResolveUrl(accumulated)
          }
        }
      } catch {
        // Stream error — process may have died
      } finally {
        reader.releaseLock()
        activeReaders -= 1
        if (!resolved && activeReaders === 0) {
          finish({ url: null, output: accumulated })
        }
      }
    }

    drain(proc.stderr as ReadableStream | null)
    drain(proc.stdout as ReadableStream | null)
    proc.exited.then(() => {
      finish({ url: null, output: accumulated })
    })
  })
}

function appendCapturedOutput(current: string, chunk: string): string {
  if (!chunk) return current
  const combined = `${current}${chunk}`
  if (combined.length <= MAX_STARTUP_CAPTURE_CHARS) return combined
  return combined.slice(combined.length - MAX_STARTUP_CAPTURE_CHARS)
}

function formatStartupError(output: string): string {
  const snippet = compactOutput(output)
  if (!snippet) {
    return 'Server did not report a listening URL within timeout'
  }
  return `Server did not report a listening URL within timeout: ${snippet}`
}

function compactOutput(output: string): string {
  const collapsed = output.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''
  const maxLength = 160
  if (collapsed.length <= maxLength) return collapsed
  return `${collapsed.slice(0, maxLength - 3)}...`
}

function trimUrl(value: string): string {
  return value.replace(/[)\],.;]+$/, '')
}

function normalizePath(path: string): string {
  return path.trim().replace(/\/$/, '')
}

function difference(left: Set<string>, right: Set<string>): Set<string> {
  const values = new Set<string>()
  for (const item of left) {
    if (!right.has(item)) values.add(item)
  }
  return values
}

/** Kill leftover `opencode serve` processes from a previous app run. */
async function reapStaleProcesses(): Promise<void> {
  try {
    const result = Bun.spawnSync(['pgrep', '-f', 'opencode serve'])
    const stdout = result.stdout.toString().trim()
    if (!stdout) return

    const pids = stdout
      .split('\n')
      .map((line) => parseInt(line, 10))
      .filter((pid) => !isNaN(pid) && pid !== process.pid)

    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // Process already gone
      }
    }

    if (pids.length > 0) {
      await sleep(REAPER_GRACE_MS)
    }
  } catch {
    // pgrep not found or other error — safe to ignore
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
