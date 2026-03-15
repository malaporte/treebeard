import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { getBundledBinaryPath } from './paths'
import { getShellEnv } from './shell-env'
import type { PippinCliStatus } from '../../shared/types'

const INSTALL_DIR = path.join(os.homedir(), '.local', 'bin')
const INSTALL_PATH = path.join(INSTALL_DIR, 'pippin')

/** Install or update the pippin CLI binary to ~/.local/bin/pippin */
export async function installPippinCli(): Promise<PippinCliStatus> {
  try {
    const srcPath = getBundledBinaryPath('pippin')

    if (!fs.existsSync(srcPath)) {
      return {
        installed: false,
        needsUpdate: false,
        onPath: false,
        installPath: INSTALL_PATH,
        error: 'Bundled pippin binary not found'
      }
    }

    fs.mkdirSync(INSTALL_DIR, { recursive: true })

    // Skip copy if the installed binary matches the bundled one
    if (!needsCopy(srcPath, INSTALL_PATH)) {
      const onPath = await isInstallDirOnPath()
      return {
        installed: true,
        needsUpdate: false,
        onPath,
        installPath: INSTALL_PATH,
        error: null
      }
    }

    fs.copyFileSync(srcPath, INSTALL_PATH)
    fs.chmodSync(INSTALL_PATH, 0o755)

    const onPath = await isInstallDirOnPath()
    return {
      installed: true,
      needsUpdate: false,
      onPath,
      installPath: INSTALL_PATH,
      error: null
    }
  } catch (err) {
    return {
      installed: false,
      needsUpdate: false,
      onPath: false,
      installPath: INSTALL_PATH,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/** Check current pippin CLI install status without modifying anything */
export async function getPippinCliStatus(): Promise<PippinCliStatus> {
  try {
    const srcPath = getBundledBinaryPath('pippin')
    const srcExists = fs.existsSync(srcPath)
    const destExists = fs.existsSync(INSTALL_PATH)

    if (!destExists) {
      return {
        installed: false,
        needsUpdate: false,
        onPath: false,
        installPath: INSTALL_PATH,
        error: null
      }
    }

    const needsUpdate = srcExists && needsCopy(srcPath, INSTALL_PATH)
    const onPath = await isInstallDirOnPath()

    return {
      installed: true,
      needsUpdate,
      onPath,
      installPath: INSTALL_PATH,
      error: null
    }
  } catch (err) {
    return {
      installed: false,
      needsUpdate: false,
      onPath: false,
      installPath: INSTALL_PATH,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/** Compare source and destination to determine if a copy is needed */
function needsCopy(srcPath: string, destPath: string): boolean {
  try {
    const srcStat = fs.statSync(srcPath)
    const destStat = fs.statSync(destPath)
    return srcStat.size !== destStat.size || srcStat.mtimeMs > destStat.mtimeMs
  } catch {
    return true
  }
}

/** Check whether ~/.local/bin is in the user's shell PATH */
async function isInstallDirOnPath(): Promise<boolean> {
  try {
    const env = await getShellEnv()
    const pathEntries = (env.PATH || '').split(':')
    return pathEntries.some((entry) => path.resolve(entry) === INSTALL_DIR)
  } catch {
    return false
  }
}
