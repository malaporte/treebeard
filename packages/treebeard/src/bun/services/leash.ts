import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { getShellEnv } from './shell-env'
import { getBundledBinaryPath } from './paths'
import { getSandboxMountPath } from './config'
import type { Subprocess } from 'bun'

const PIPPIN_SERVER_PORT = 9111
const LEASH_CONTROL_UI_PORT = 18080
const HEALTH_CHECK_INTERVAL_MS = 1000
const HEALTH_CHECK_MAX_ATTEMPTS = 60
const SHARE_DIR_NAME = 'leash-share'
const APP_SUPPORT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Treebeard')
export const CONTAINER_MOUNT_DEST = '/workspace'
const LOG_MAX_LINES = 200

// Leash creates two containers from these images
const LEASH_CONTAINER_IMAGES = [
  'public.ecr.aws/s5i7k8t3/strongdm/coder',
  'public.ecr.aws/s5i7k8t3/strongdm/leash',
]

export type SandboxState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

export interface SandboxStatus {
  state: SandboxState
  port: number | null
  controlUiPort: number | null
  error: string | null
  log: string[]
}

let leashProcess: Subprocess | null = null
let currentState: SandboxState = 'stopped'
let currentError: string | null = null

// --- Diagnostic Log ---

const logBuffer: string[] = []

/** Append a timestamped entry to the in-memory ring buffer */
function log(message: string): void {
  const ts = new Date().toISOString().slice(11, 23)
  logBuffer.push(`[${ts}] ${message}`)
  if (logBuffer.length > LOG_MAX_LINES) {
    logBuffer.splice(0, logBuffer.length - LOG_MAX_LINES)
  }
}

/** Append each non-empty line of multi-line text with a prefix */
function logLines(prefix: string, text: string): void {
  for (const line of text.split('\n')) {
    const trimmed = line.trimEnd()
    if (trimmed.length > 0) log(`${prefix} ${trimmed}`)
  }
}

export function getSandboxLog(): string[] {
  return [...logBuffer]
}

// --- Helpers ---

function getShareDir(): string {
  return path.join(APP_SUPPORT_DIR, SHARE_DIR_NAME)
}

/** Resolve the correct pippin-server binary name for the current architecture */
function getServerBinaryName(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `pippin-server-linux-${arch}`
}

/** Copy the pre-compiled pippin-server binary into the leash share directory */
function prepareBinary(shareDir: string): void {
  fs.mkdirSync(shareDir, { recursive: true })

  // Remove stale leash state files from previous runs. Leash writes
  // ca-cert.pem, cgroup-path, leash-entry-*, and .ready files into the
  // share directory. If these survive across runs the container may fail
  // to start (e.g. orphaned CA cert without its private key).
  try {
    for (const entry of fs.readdirSync(shareDir)) {
      if (entry === 'pippin-server') continue
      const filePath = path.join(shareDir, entry)
      fs.rmSync(filePath, { force: true })
      log(`removed stale file: ${entry}`)
    }
  } catch {
    // Share dir may not exist yet on first run
  }

  const binaryName = getServerBinaryName()
  const srcPath = getBundledBinaryPath(binaryName)
  const destPath = path.join(shareDir, 'pippin-server')

  // Skip copy if the binary is already in place and unchanged
  try {
    const srcStat = fs.statSync(srcPath)
    const destStat = fs.statSync(destPath)
    if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
      log(`binary up to date at ${destPath}`)
      return
    }
  } catch {
    // Destination doesn't exist or can't be stat'd; proceed with copy
  }

  log(`copying binary ${srcPath} -> ${destPath}`)
  fs.copyFileSync(srcPath, destPath)
  fs.chmodSync(destPath, 0o755)
}

/** Wait for the pippin-server health endpoint to respond */
async function waitForHealth(port: number): Promise<boolean> {
  for (let i = 0; i < HEALTH_CHECK_MAX_ATTEMPTS; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`)
      if (resp.ok) {
        log(`health check passed on attempt ${i + 1}`)
        return true
      }
      log(`health check attempt ${i + 1}: HTTP ${resp.status}`)
    } catch (err) {
      if (i === 0 || i % 10 === 0) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`health check attempt ${i + 1}: ${msg}`)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS))
  }
  log(`health check failed after ${HEALTH_CHECK_MAX_ATTEMPTS} attempts`)
  return false
}

/**
 * Remove Docker containers created by leash.
 * Leash starts detached containers that outlive the leash process, so we
 * must stop them explicitly via `docker rm -f`.
 */
async function removeContainers(): Promise<void> {
  try {
    const env = await getShellEnv()

    // Find containers from leash images (running or stopped)
    const filters = LEASH_CONTAINER_IMAGES.map((img) => ['--filter', `ancestor=${img}`]).flat()
    const ps = Bun.spawn(
      ['docker', 'ps', '-a', '-q', ...filters],
      { stdout: 'pipe', stderr: 'pipe', env },
    )
    const output = await new Response(ps.stdout).text()
    const psStderr = await new Response(ps.stderr).text()
    await ps.exited

    if (psStderr.trim()) logLines('docker ps stderr:', psStderr)

    const ids = output.trim().split('\n').filter(Boolean)
    if (ids.length === 0) {
      log('no stale containers found')
    } else {
      log(`removing ${ids.length} stale container(s) with volumes: ${ids.join(', ')}`)
      const rm = Bun.spawn(
        ['docker', 'rm', '-fv', ...ids],
        { stdout: 'pipe', stderr: 'pipe', env },
      )
      const rmStderr = await new Response(rm.stderr).text()
      await rm.exited
      if (rmStderr.trim()) logLines('docker rm stderr:', rmStderr)
    }

    // Remove dangling anonymous volumes left by previous runs where
    // containers were removed without the -v flag. These can contain
    // stale CA certificates that cause leash startup failures.
    await pruneDanglingVolumes(env)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`removeContainers failed: ${msg}`)
  }
}

/** Remove dangling anonymous volumes (not associated with any container) */
async function pruneDanglingVolumes(env: Record<string, string>): Promise<void> {
  try {
    const prune = Bun.spawn(
      ['docker', 'volume', 'ls', '-q', '--filter', 'dangling=true'],
      { stdout: 'pipe', stderr: 'pipe', env },
    )
    const output = await new Response(prune.stdout).text()
    await prune.exited

    // Only remove anonymous volumes (64-char hex names), not named ones
    const ids = output.trim().split('\n').filter((id) => /^[0-9a-f]{64}$/.test(id))
    if (ids.length === 0) return

    log(`pruning ${ids.length} dangling anonymous volume(s)`)
    const rm = Bun.spawn(
      ['docker', 'volume', 'rm', ...ids],
      { stdout: 'pipe', stderr: 'pipe', env },
    )
    const rmStderr = await new Response(rm.stderr).text()
    await rm.exited
    if (rmStderr.trim()) logLines('docker volume rm stderr:', rmStderr)
  } catch {
    // Best-effort — don't fail container cleanup over volume pruning
  }
}

/**
 * Synchronous best-effort container removal for process exit handler.
 * Uses spawnSync-style fire-and-forget since we can't await in exit hooks.
 */
function removeContainersSync(): void {
  try {
    for (const image of LEASH_CONTAINER_IMAGES) {
      const ps = Bun.spawnSync(
        ['docker', 'ps', '-a', '-q', '--filter', `ancestor=${image}`],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      const ids = ps.stdout.toString().trim().split('\n').filter(Boolean)
      if (ids.length === 0) continue

      Bun.spawnSync(
        ['docker', 'rm', '-fv', ...ids],
        { stdout: 'pipe', stderr: 'pipe' },
      )
    }
  } catch {
    // Best-effort — process is exiting
  }
}

/** Start the leash sandbox with pippin-server running inside */
export async function startSandbox(): Promise<SandboxStatus> {
  if (currentState === 'running' || currentState === 'starting') {
    return getSandboxStatus()
  }

  currentState = 'starting'
  currentError = null
  logBuffer.length = 0
  log('starting sandbox')

  try {
    // Clean up any stale containers from a previous run that wasn't shut down cleanly
    log('cleaning up stale containers')
    await removeContainers()

    const shareDir = getShareDir()
    prepareBinary(shareDir)

    const env = await getShellEnv()
    log(`shell env PATH: ${env.PATH?.slice(0, 120) ?? '(unset)'}`)

    // Leash reads LEASH_SHARE_DIR to use our known directory instead of a
    // temporary one. This lets us inject the pippin-server binary.
    const leashEnv = {
      ...env,
      LEASH_SHARE_DIR: shareDir,
    }

    // Start leash with:
    //   -p 9111:9111  -- publish pippin-server port to host
    //   -v src:dst     -- bind-mount configured host directory into the container
    //   -I            -- non-interactive (Treebeard manages the lifecycle)
    //   The command /leash/pippin-server runs inside the container
    const leashArgs = [
      'leash',
      '-p', `${PIPPIN_SERVER_PORT}:${PIPPIN_SERVER_PORT}`,
    ]

    // Bind-mount the configured host directory into the container at /workspace
    const mountPath = getSandboxMountPath()
    if (mountPath) {
      leashArgs.push('-v', `${mountPath}:${CONTAINER_MOUNT_DEST}`)
    }

    leashArgs.push('-I', '--', '/leash/pippin-server')

    log(`spawning: ${leashArgs.join(' ')}`)
    leashProcess = Bun.spawn(leashArgs, {
      cwd: os.homedir(),
      env: leashEnv,
      stdout: 'ignore',
      stderr: 'pipe',
    })
    log(`leash pid: ${leashProcess.pid}`)

    // Drain stderr to prevent pipe buffer deadlock (the OS pipe buffer is
    // ~64 KB on macOS — if leash or Docker fills it, the process stalls).
    // Capture the output so we can surface it when the health check fails.
    const stderrChunks: string[] = []
    const stderrReader = new Response(leashProcess.stderr).text().then((text) => {
      stderrChunks.push(text)
    })

    // Monitor leash process exit
    leashProcess.exited.then(async (code) => {
      // Collect any remaining stderr
      await stderrReader.catch(() => {})
      const stderr = stderrChunks.join('').trim()
      if (stderr) logLines('leash stderr:', stderr)

      if (currentState !== 'stopping') {
        currentState = 'error'
        currentError = stderr
          ? `leash exited with code ${code}: ${stderr}`
          : `leash exited unexpectedly with code ${code}`
        log(currentError)
      } else {
        currentState = 'stopped'
        log(`leash exited with code ${code} (expected — stopping)`)
      }
      leashProcess = null
    })

    // Wait for pippin-server to become healthy inside the container
    log('waiting for pippin-server health check')
    const healthy = await waitForHealth(PIPPIN_SERVER_PORT)
    if (!healthy) {
      await stopSandbox()
      await stderrReader
      const stderr = stderrChunks.join('').trim()
      if (stderr) logLines('leash stderr:', stderr)
      currentState = 'error'
      currentError = stderr
        ? `pippin-server did not become healthy within timeout: ${stderr}`
        : 'pippin-server did not become healthy within timeout'
      log(currentError)
      return getSandboxStatus()
    }

    currentState = 'running'
    log('sandbox running')
    return getSandboxStatus()
  } catch (err) {
    currentState = 'error'
    currentError = err instanceof Error ? err.message : String(err)
    log(`startup failed: ${currentError}`)
    return getSandboxStatus()
  }
}

/** Stop the leash sandbox and tear down containers */
export async function stopSandbox(): Promise<SandboxStatus> {
  if (currentState === 'stopped' || currentState === 'stopping') {
    return getSandboxStatus()
  }

  currentState = 'stopping'
  currentError = null
  log('stopping sandbox')

  try {
    if (leashProcess) {
      log(`sending SIGTERM to pid ${leashProcess.pid}`)
      leashProcess.kill('SIGTERM')
      // Wait up to 10 seconds for graceful exit
      const timeout = setTimeout(() => {
        try {
          log('graceful shutdown timed out, sending SIGKILL')
          leashProcess?.kill('SIGKILL')
        } catch {
          // Already exited
        }
      }, 10000)

      await leashProcess.exited
      clearTimeout(timeout)
      log('leash process exited')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`error during stop: ${msg}`)
  }

  // Leash containers run detached and outlive the leash process
  log('removing containers')
  await removeContainers()

  leashProcess = null
  currentState = 'stopped'
  log('sandbox stopped')
  return getSandboxStatus()
}

/** Get current sandbox status */
export function getSandboxStatus(): SandboxStatus {
  return {
    state: currentState,
    port: currentState === 'running' ? PIPPIN_SERVER_PORT : null,
    controlUiPort: currentState === 'running' ? LEASH_CONTROL_UI_PORT : null,
    error: currentError,
    log: getSandboxLog(),
  }
}

/** Force-kill the leash process and containers without waiting (for process exit cleanup) */
export function forceStopSandbox(): void {
  try {
    leashProcess?.kill('SIGKILL')
  } catch {
    // Already exited
  }
  leashProcess = null
  currentState = 'stopped'

  // Synchronous best-effort container removal for exit handler
  removeContainersSync()
}
