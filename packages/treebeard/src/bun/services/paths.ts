import path from 'node:path'
import fs from 'node:fs'

/**
 * Resolve the path to a bundled pippin binary, handling both dev and production layouts.
 *
 * Production: __dirname is inside Contents/Resources/app/bun/,
 * binaries are at Contents/Resources/app/bin/<name>.
 *
 * Dev: __dirname is packages/treebeard/src/bun/services/,
 * binaries are at packages/pippin/dist/<name>.
 */
export function getBundledBinaryPath(name: string): string {
  // Production: check for the binary next to the bun directory
  const productionPath = path.join(__dirname, '..', 'bin', name)
  if (fs.existsSync(productionPath)) {
    return productionPath
  }

  // Dev: traverse from packages/treebeard/src/bun/services/ to packages/pippin/dist/
  return path.join(__dirname, '..', '..', '..', '..', 'pippin', 'dist', name)
}
