import { DEFAULT_PORT, EXEC_PATH, HEALTH_PATH } from '../shared/types'
import { readMountConfig, translateCwd } from './resolve-cwd'
import type { ClientMessage, ServerMessage } from '../shared/types'

const port = parseInt(process.env.PIPPIN_PORT || String(DEFAULT_PORT), 10)
const host = process.env.PIPPIN_HOST || '127.0.0.1'

// --- Parse Arguments ---
// Usage: pippin <command>
// Or: pippin -c <command>  (sh-compatible mode)

const args = process.argv.slice(2)
let cmd: string | null = null

if (args.length === 0) {
  process.stderr.write('usage: pippin <command>\n')
  process.exit(1)
}

// Support sh-compatible `-c` flag for drop-in shell replacement
if (args[0] === '-c') {
  cmd = args.slice(1).join(' ')
} else {
  cmd = args.join(' ')
}

if (!cmd) {
  process.stderr.write('usage: pippin <command>\n')
  process.exit(1)
}

// --- Build WebSocket URL ---

const params = new URLSearchParams({ cmd })

// Resolve the working directory for the command inside the container.
// If a sandboxMountPath is configured in Treebeard, validate that the
// host CWD is within the mount boundary. Paths are identical on both
// sides since leash identity-mounts the home directory.
const hostCwd = process.env.PIPPIN_CWD || process.cwd()
const { sandboxMountPath } = readMountConfig()
const cwdResult = translateCwd(hostCwd, sandboxMountPath)

if (cwdResult && 'error' in cwdResult) {
  process.stderr.write(`pippin: ${cwdResult.error}\n`)
  process.exit(1)
}

if (cwdResult) {
  params.set('cwd', cwdResult.containerCwd)
} else if (process.env.PIPPIN_CWD) {
  // No mount path configured — pass through PIPPIN_CWD as-is (legacy behavior)
  params.set('cwd', process.env.PIPPIN_CWD)
}

// Forward terminal size if available
if (process.stdout.isTTY) {
  const cols = process.stdout.columns
  const rows = process.stdout.rows
  if (cols) params.set('cols', String(cols))
  if (rows) params.set('rows', String(rows))
}

const wsUrl = `ws://${host}:${port}${EXEC_PATH}?${params.toString()}`

// --- Connect and Run ---

let exitCode = 1

const ws = new WebSocket(wsUrl)

ws.addEventListener('open', () => {
  // Pipe stdin to the server
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }

  process.stdin.on('data', (chunk: Buffer) => {
    const msg: ClientMessage = { type: 'stdin', data: chunk.toString('base64') }
    ws.send(JSON.stringify(msg))
  })

  process.stdin.on('end', () => {
    const msg: ClientMessage = { type: 'close_stdin' }
    ws.send(JSON.stringify(msg))
  })

  // Handle terminal resize
  if (process.stdout.isTTY) {
    process.stdout.on('resize', () => {
      const msg: ClientMessage = {
        type: 'resize',
        cols: process.stdout.columns,
        rows: process.stdout.rows,
      }
      ws.send(JSON.stringify(msg))
    })
  }

  process.stdin.resume()
})

ws.addEventListener('message', (event) => {
  try {
    const msg: ServerMessage = JSON.parse(String(event.data))

    switch (msg.type) {
      case 'stdout': {
        const bytes = new Uint8Array(Buffer.from(msg.data, 'base64'))
        process.stdout.write(bytes)
        break
      }
      case 'stderr': {
        const bytes = new Uint8Array(Buffer.from(msg.data, 'base64'))
        process.stderr.write(bytes)
        break
      }
      case 'exit': {
        exitCode = msg.code
        break
      }
      case 'error': {
        process.stderr.write(`pippin: ${msg.message}\n`)
        break
      }
    }
  } catch {
    // Malformed message; ignore
  }
})

ws.addEventListener('close', () => {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
  process.exit(exitCode)
})

ws.addEventListener('error', (event) => {
  // Check if the server is reachable
  const healthUrl = `http://${host}:${port}${HEALTH_PATH}`
  process.stderr.write(`pippin: failed to connect to sandbox at ${healthUrl}\n`)
  process.stderr.write('pippin: is the sandbox running? check Treebeard.\n')
  process.exit(1)
})

// --- Handle Signals ---

process.on('SIGINT', () => {
  const msg: ClientMessage = { type: 'signal', signal: 'SIGINT' }
  ws.send(JSON.stringify(msg))
})

process.on('SIGTERM', () => {
  const msg: ClientMessage = { type: 'signal', signal: 'SIGTERM' }
  ws.send(JSON.stringify(msg))
  ws.close()
})
