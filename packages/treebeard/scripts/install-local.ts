import fs from 'node:fs'
import path from 'node:path'

const APP_NAME = 'Treebeard.app'
const INSTALL_DIR = '/Applications'

const PROCESS_PATTERN = `${APP_NAME}/Contents/`

function run(cmd: string[], env?: Record<string, string>) {
  const result = Bun.spawnSync(cmd, {
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, ...env }
  })
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1)
}

function isRunning() {
  return Bun.spawnSync(['pgrep', '-f', PROCESS_PATTERN]).exitCode === 0
}

run(['bun', 'run', 'build'], { TREEBEARD_SKIP_CODESIGN: '1' })

const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const sourcePath = path.resolve('build', `stable-macos-${arch}`, APP_NAME)
if (!fs.existsSync(sourcePath)) {
  process.stderr.write(`Build output not found at ${sourcePath}\n`)
  process.exit(1)
}

const targetPath = path.join(INSTALL_DIR, APP_NAME)

// Replacing the bundle under a running instance leaves it in a broken state.
const wasRunning = isRunning()
if (wasRunning) {
  // The Electrobun app doesn't answer AppleScript quit events, so signal it directly.
  Bun.spawnSync(['pkill', '-TERM', '-f', PROCESS_PATTERN])
  for (let i = 0; i < 50 && isRunning(); i++) Bun.sleepSync(100)
  if (isRunning()) Bun.spawnSync(['pkill', '-KILL', '-f', PROCESS_PATTERN])
}

fs.rmSync(targetPath, { recursive: true, force: true })
// ditto preserves symlinks and extended attributes inside the bundle, unlike fs.cpSync.
run(['ditto', sourcePath, targetPath])
// Apple Silicon refuses to launch unsigned bundles, so ad-hoc sign the installed copy.
run(['codesign', '--force', '--deep', '--sign', '-', targetPath])

process.stdout.write(`Installed ${targetPath}\n`)

if (wasRunning) run(['open', targetPath])
