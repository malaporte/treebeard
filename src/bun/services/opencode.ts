import { getShellEnv } from './shell-env'
import { getOpencodeEnabled, setOpencodeEnabled, getOpencodeEnabledPaths } from './config'
import type { OpencodeServerStatus } from '../../shared/types'

const STARTUP_TIMEOUT_MS = 20000
const STOP_TIMEOUT_MS = 5000
const URL_PATTERN = /https?:\/\/\S+/

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

// --- Runtime State ---

const servers = new Map<string, ManagedServer>()
const pending = new Map<string, Promise<OpencodeServerStatus>>()

// --- Public API ---

/** Get the current status for a worktree's opencode server. */
export function getServerStatus(worktreePath: string): OpencodeServerStatus {
  const enabled = getOpencodeEnabled(worktreePath)
  const server = servers.get(worktreePath)

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

/** Enable or disable the opencode server for a worktree. Returns final status. */
export async function setServerEnabled(worktreePath: string, enabled: boolean): Promise<OpencodeServerStatus> {
  setOpencodeEnabled(worktreePath, enabled)

  if (enabled) {
    return startServer(worktreePath)
  }

  return stopServer(worktreePath)
}

/** Stop a server if the worktree has been removed. Cleans up config too. */
export async function removeWorktreeServer(worktreePath: string): Promise<void> {
  setOpencodeEnabled(worktreePath, false)
  await stopServer(worktreePath)
}

/** Start servers for all worktrees that were previously enabled. */
export async function restoreEnabledServers(): Promise<void> {
  const paths = getOpencodeEnabledPaths()
  await Promise.all(paths.map((p) => startServer(p)))
}

/** Stop every managed server. Called on app shutdown. */
export async function stopAllServers(): Promise<void> {
  const paths = [...servers.keys()]
  await Promise.all(paths.map((p) => stopServer(p)))
}

// --- Internal Lifecycle ---

async function startServer(worktreePath: string): Promise<OpencodeServerStatus> {
  // Serialize per-worktree to avoid duplicate spawns from rapid toggles
  const inflight = pending.get(worktreePath)
  if (inflight) return inflight

  const promise = doStart(worktreePath)
  pending.set(worktreePath, promise)
  try {
    return await promise
  } finally {
    pending.delete(worktreePath)
  }
}

async function doStart(worktreePath: string): Promise<OpencodeServerStatus> {
  // Already running — return current status
  const existing = servers.get(worktreePath)
  if (existing) return getServerStatus(worktreePath)

  const env = await getShellEnv()

  const proc = Bun.spawn(
    ['opencode', 'serve', '--hostname', '0.0.0.0', '--port', '0', '--print-logs'],
    {
      cwd: worktreePath,
      stdout: 'pipe',
      stderr: 'pipe',
      env
    }
  )

  const server: ManagedServer = {
    process: proc,
    pid: proc.pid,
    url: null,
    error: null
  }

  servers.set(worktreePath, server)

  // Clean up runtime map if process exits unexpectedly
  proc.exited.then(() => {
    const current = servers.get(worktreePath)
    if (current?.pid === proc.pid) {
      servers.delete(worktreePath)
    }
  })

  // Parse startup logs for the listening URL (stream can vary by opencode version)
  const startup = await waitForUrl(proc, STARTUP_TIMEOUT_MS)

  // Process may have exited during startup
  const stillTracked = servers.get(worktreePath)
  if (!stillTracked || stillTracked.pid !== proc.pid) {
    return getServerStatus(worktreePath)
  }

  if (startup.url) {
    server.url = startup.url
  } else {
    server.error = formatStartupError(startup.output)
  }

  return getServerStatus(worktreePath)
}

async function stopServer(worktreePath: string): Promise<OpencodeServerStatus> {
  // Wait for any pending start to finish before stopping
  const inflight = pending.get(worktreePath)
  if (inflight) await inflight

  const server = servers.get(worktreePath)
  if (!server) return getServerStatus(worktreePath)

  servers.delete(worktreePath)
  await killProcess(server.process)

  return getServerStatus(worktreePath)
}

async function killProcess(proc: ReturnType<typeof Bun.spawn>): Promise<void> {
  try {
    proc.kill('SIGTERM')
  } catch {
    // Already dead
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

// --- Helpers ---

async function waitForUrl(
  proc: ReturnType<typeof Bun.spawn>,
  timeoutMs: number
): Promise<UrlWaitResult> {
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

    const read = async (stream: ReadableStream | null | undefined) => {
      const reader = stream ? new Response(stream).body?.getReader() : null
      if (!reader) return
      activeReaders += 1
      const decoder = new TextDecoder()

      try {
        while (!resolved) {
          const { done, value } = await reader.read()
          if (done) break

          accumulated += decoder.decode(value, { stream: true })
          if (tryResolveUrl(accumulated)) {
            return
          }
        }
      } catch {
        // Stream error — process may have died
      } finally {
        activeReaders -= 1
        if (!resolved && activeReaders === 0) {
          finish({ url: null, output: accumulated })
        }
      }
    }

    read(proc.stderr as ReadableStream | null)
    read(proc.stdout as ReadableStream | null)

    // Also resolve null if the process exits before printing URL
    proc.exited.then(() => {
      finish({ url: null, output: accumulated })
    })
  })
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
