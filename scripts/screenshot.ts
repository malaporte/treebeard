import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const APP_PATH = path.resolve('build/stable-macos-arm64/Treebeard.app')
const outputArg = process.argv[2]
const outputPath = outputArg ? path.resolve(outputArg) : path.resolve('treebeard-current.png')
const delayMs = Number(process.env.SCREENSHOT_DELAY_MS ?? '5000')

function captureManually(): void {
  const manualCaptureProc = Bun.spawnSync(['screencapture', '-x', '-w', outputPath], { stderr: 'pipe' })

  if (manualCaptureProc.exitCode !== 0) {
    const manualError = manualCaptureProc.stderr ? new TextDecoder().decode(manualCaptureProc.stderr).trim() : ''
    process.stderr.write(
      `Manual screenshot capture failed.${manualError ? ` ${manualError}` : ''} Ensure Accessibility and Screen Recording permissions are granted.\n`
    )
    process.exit(1)
  }

  process.stdout.write(`Saved screenshot to ${outputPath}\n`)
  process.exit(0)
}

if (process.platform !== 'darwin') {
  process.stderr.write('Screenshot capture is only supported on macOS.\n')
  process.exit(1)
}

if (!Number.isFinite(delayMs) || delayMs < 1000) {
  process.stderr.write('SCREENSHOT_DELAY_MS must be a number >= 1000.\n')
  process.exit(1)
}

if (!Bun.file(APP_PATH).exists()) {
  process.stderr.write('Packaged app not found. Run "pnpm build" first.\n')
  process.exit(1)
}

const openProc = Bun.spawnSync(['open', APP_PATH], { stderr: 'pipe' })

if (openProc.exitCode !== 0) {
  const errorMessage = openProc.stderr ? new TextDecoder().decode(openProc.stderr).trim() : ''
  process.stderr.write(`Failed to open packaged app.${errorMessage ? ` ${errorMessage}` : ''}\n`)
  process.exit(1)
}

await delay(delayMs)

const activateProc = Bun.spawnSync(['osascript', '-e', 'tell application "Treebeard" to activate'], {
  stderr: 'pipe'
})

if (activateProc.exitCode !== 0) {
  const errorMessage = activateProc.stderr ? new TextDecoder().decode(activateProc.stderr).trim() : ''
  process.stderr.write(
    `Failed to activate Treebeard window.${errorMessage ? ` ${errorMessage}` : ''} Grant Automation permissions if prompted.\n`
  )
  process.exit(1)
}

await delay(1000)

const windowIdProc = Bun.spawnSync(
  [
    'osascript',
    '-e',
    'tell application "System Events" to tell process "Treebeard" to get value of attribute "AXWindowNumber" of front window'
  ],
  { stdout: 'pipe', stderr: 'pipe' }
)

if (windowIdProc.exitCode !== 0) {
  const errorMessage = windowIdProc.stderr ? new TextDecoder().decode(windowIdProc.stderr).trim() : ''
  process.stderr.write(
    `Could not read Treebeard window id.${errorMessage ? ` ${errorMessage}` : ''} Falling back to manual window selection.\n`
  )
  captureManually()
}

const windowId = windowIdProc.stdout ? new TextDecoder().decode(windowIdProc.stdout).trim() : ''

if (!windowId) {
  process.stderr.write('Could not determine Treebeard window id. Falling back to manual window selection.\n')
  captureManually()
}

const captureProc = Bun.spawnSync(['screencapture', '-x', '-l', windowId, outputPath], { stderr: 'pipe' })

if (captureProc.exitCode !== 0) {
  const errorMessage = captureProc.stderr ? new TextDecoder().decode(captureProc.stderr).trim() : ''
  process.stderr.write(
    `Failed to capture screenshot.${errorMessage ? ` ${errorMessage}` : ''} Ensure screen recording permission is granted.\n`
  )
  process.exit(1)
}

process.stdout.write(`Saved screenshot to ${outputPath}\n`)
