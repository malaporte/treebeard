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
}

let leashProcess: Subprocess | null = null
let currentState: SandboxState = 'stopped'
let currentError: string | null = null

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

  const binaryName = getServerBinaryName()
  const srcPath = getBundledBinaryPath(binaryName)
  const destPath = path.join(shareDir, 'pippin-server')

  // Skip copy if the binary is already in place and unchanged
  try {
    const srcStat = fs.statSync(srcPath)
    const destStat = fs.statSync(destPath)
    if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
      return
    }
  } catch {
    // Destination doesn't exist or can't be stat'd; proceed with copy
  }

  fs.copyFileSync(srcPath, destPath)
  fs.chmodSync(destPath, 0o755)
}

/** Wait for the pippin-server health endpoint to respond */
async function waitForHealth(port: number): Promise<boolean> {
  for (let i = 0; i < HEALTH_CHECK_MAX_ATTEMPTS; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`)
      if (resp.ok) return true
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS))
  }
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
    await ps.exited

    const ids = output.trim().split('\n').filter(Boolean)
    if (ids.length === 0) return

    const rm = Bun.spawn(
      ['docker', 'rm', '-f', ...ids],
      { stdout: 'pipe', stderr: 'pipe', env },
    )
    await rm.exited
  } catch {
    // Best-effort cleanup — docker may not be available
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
        ['docker', 'rm', '-f', ...ids],
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

  try {
    const shareDir = getShareDir()
    prepareBinary(shareDir)

    const env = await getShellEnv()

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

    leashProcess = Bun.spawn(leashArgs, {
      env: leashEnv,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // Monitor leash process exit
    leashProcess.exited.then((code) => {
      if (currentState !== 'stopping') {
        currentState = 'error'
        currentError = `leash exited unexpectedly with code ${code}`
      } else {
        currentState = 'stopped'
      }
      leashProcess = null
    })

    // Wait for pippin-server to become healthy inside the container
    const healthy = await waitForHealth(PIPPIN_SERVER_PORT)
    if (!healthy) {
      await stopSandbox()
      currentState = 'error'
      currentError = 'pippin-server did not become healthy within timeout'
      return getSandboxStatus()
    }

    currentState = 'running'
    return getSandboxStatus()
  } catch (err) {
    currentState = 'error'
    currentError = err instanceof Error ? err.message : String(err)
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

  try {
    if (leashProcess) {
      leashProcess.kill('SIGTERM')
      // Wait up to 10 seconds for graceful exit
      const timeout = setTimeout(() => {
        try {
          leashProcess?.kill('SIGKILL')
        } catch {
          // Already exited
        }
      }, 10000)

      await leashProcess.exited
      clearTimeout(timeout)
    }
  } catch {
    // Best-effort cleanup
  }

  // Leash containers run detached and outlive the leash process
  await removeContainers()

  leashProcess = null
  currentState = 'stopped'
  return getSandboxStatus()
}

/** Get current sandbox status */
export function getSandboxStatus(): SandboxStatus {
  return {
    state: currentState,
    port: currentState === 'running' ? PIPPIN_SERVER_PORT : null,
    controlUiPort: currentState === 'running' ? LEASH_CONTROL_UI_PORT : null,
    error: currentError,
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
