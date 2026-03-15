import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const CONTAINER_MOUNT_DEST = '/workspace'
const CONFIG_PATH = path.join(os.homedir(), '.config', 'treebeard', 'treebeard-config.json')

interface MountConfig {
  sandboxMountPath: string | null
}

/** Read the sandboxMountPath from the Treebeard config file */
export function readMountConfig(): MountConfig {
  try {
    const text = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(text) as Record<string, unknown>
    const mountPath = typeof parsed.sandboxMountPath === 'string' && parsed.sandboxMountPath.trim() !== ''
      ? parsed.sandboxMountPath.trim()
      : null
    return { sandboxMountPath: mountPath }
  } catch {
    return { sandboxMountPath: null }
  }
}

/**
 * Translate a host CWD to the corresponding path inside the container.
 *
 * Returns the translated container path, or an error string if the CWD
 * is outside the configured mount path.
 *
 * When no mount path is configured, returns null (no translation needed).
 */
export function translateCwd(
  hostCwd: string,
  sandboxMountPath: string | null,
): { containerCwd: string } | { error: string } | null {
  if (!sandboxMountPath) return null

  // Resolve and normalize both paths to handle symlinks and trailing slashes
  let resolvedMount: string
  let resolvedCwd: string
  try {
    resolvedMount = fs.realpathSync(sandboxMountPath)
  } catch {
    return { error: `sandbox mount path '${sandboxMountPath}' does not exist` }
  }
  try {
    resolvedCwd = fs.realpathSync(hostCwd)
  } catch {
    return { error: `working directory '${hostCwd}' does not exist` }
  }

  // Normalize and strip trailing separators
  resolvedMount = path.normalize(resolvedMount).replace(/\/+$/, '') || '/'
  resolvedCwd = path.normalize(resolvedCwd).replace(/\/+$/, '') || '/'

  // CWD is exactly the mount path
  if (resolvedCwd === resolvedMount) {
    return { containerCwd: CONTAINER_MOUNT_DEST }
  }

  // CWD is under the mount path
  const prefix = resolvedMount + path.sep
  if (resolvedCwd.startsWith(prefix)) {
    const relative = resolvedCwd.slice(prefix.length)
    return { containerCwd: `${CONTAINER_MOUNT_DEST}/${relative}` }
  }

  return {
    error: `cwd '${resolvedCwd}' is outside sandbox mount '${resolvedMount}'`,
  }
}
