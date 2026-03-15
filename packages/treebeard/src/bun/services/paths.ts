import path from 'node:path'

/**
 * Resolve the path to a bundled pippin binary, handling both dev and production layouts.
 *
 * Production: process.execPath is Contents/MacOS/bun,
 * binaries are at Contents/Resources/app/bin/<name>.
 *
 * Dev: falls back from __dirname (packages/treebeard/src/bun/services/)
 * to packages/pippin/dist/<name>.
 *
 * Note: __dirname is baked at compile time by bun's bundler and cannot be used
 * for production path resolution — it retains the CI build agent's filesystem path.
 */
export function getBundledBinaryPath(name: string): string {
  // Production: derive from process.execPath (Contents/MacOS/bun)
  const execDir = path.dirname(process.execPath)
  if (execDir.endsWith(path.join('Contents', 'MacOS'))) {
    return path.join(execDir, '..', 'Resources', 'app', 'bin', name)
  }

  // Dev: traverse from packages/treebeard/src/bun/services/ to packages/pippin/dist/
  return path.join(__dirname, '..', '..', '..', '..', 'pippin', 'dist', name)
}
