import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

interface RawConfig {
  mobileBridge?: {
    pairingCode?: string
  }
}

interface LocalWebUrlResponse {
  webUrl: string
}

const worktreePath = process.argv[2]
const bridgeOrigin = process.env.TREEBEARD_BRIDGE_URL || 'http://localhost:8787'
const configPath = path.join(os.homedir(), '.config', 'treebeard')

if (!worktreePath) {
  process.stderr.write('Usage: bun run scripts/opencode-smoke-url.ts <worktree-path>\n')
  process.exit(1)
}

let pairingCode = ''
try {
  const raw = fs.readFileSync(configPath, 'utf-8')
  const parsed = JSON.parse(raw) as RawConfig
  pairingCode = parsed.mobileBridge?.pairingCode?.trim() || ''
} catch {
  process.stderr.write(`Unable to read config from ${configPath}\n`)
  process.exit(1)
}

if (!pairingCode) {
  process.stderr.write('Mobile bridge pairing code is missing. Open Settings > Mobile and rotate/generate one.\n')
  process.exit(1)
}

const response = await fetch(`${bridgeOrigin}/bridge/debug/local-web-url`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    pairingCode,
    worktreePath
  })
})

if (!response.ok) {
  const message = await response.text()
  process.stderr.write(`Failed to create local web URL (${response.status}): ${message}\n`)
  process.exit(1)
}

const body = await response.json() as LocalWebUrlResponse
process.stdout.write(`${body.webUrl}\n`)
