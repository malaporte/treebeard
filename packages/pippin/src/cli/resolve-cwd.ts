import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

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
 * Validate that a host CWD is within the configured sandbox mount path.
 *
 * Leash identity-mounts the home directory into the container, so paths
 * are the same on both sides. This function only validates that the CWD
 * is within the mount boundary and returns it unchanged.
 *
 * Returns the validated CWD, an error string if the CWD is outside the
 * mount path, or null when no mount path is configured.
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
    return { containerCwd: resolvedCwd }
  }

  // CWD is under the mount path
  const prefix = resolvedMount + path.sep
  if (resolvedCwd.startsWith(prefix)) {
    return { containerCwd: resolvedCwd }
  }

  return {
    error: `cwd '${resolvedCwd}' is outside sandbox mount '${resolvedMount}'`,
  }
}
