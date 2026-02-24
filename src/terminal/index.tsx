import { Electroview } from 'electrobun/view'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { TerminalRPC } from '../shared/terminal-rpc-types'

// --- Electroview RPC setup ---

const rpc = Electroview.defineRPC<TerminalRPC>({
  handlers: {
    requests: {},
    messages: {
      'pty:data': ({ payload: { data } }) => {
        term.write(data)
      },
      'pty:exit': ({ payload: { exitCode } }) => {
        term.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
      },
      'pty:ready': ({ payload: { worktreeName } }) => {
        document.title = `Terminal — ${worktreeName}`
      }
    }
  }
})

const electroview = new Electroview({ rpc })

// --- xterm.js setup ---

const term = new Terminal({
  fontFamily: '"Berkeley Mono", "JetBrains Mono", "Fira Code", monospace',
  fontSize: 13,
  theme: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#585b70',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8'
  },
  allowProposedApi: true,
  cursorBlink: true
})

const fitAddon = new FitAddon()
term.loadAddon(fitAddon)

const container = document.getElementById('terminal')!
term.open(container)
fitAddon.fit()

// Send initial size to bun side — this triggers PTY spawn
rpc.request['pty:resize']({ cols: term.cols, rows: term.rows })

// Forward keystrokes to the PTY
term.onData((data) => {
  rpc.request['pty:write']({ data })
})

// Resize the PTY when the terminal container resizes
const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit()
  rpc.request['pty:resize']({ cols: term.cols, rows: term.rows })
})
resizeObserver.observe(container)

// Clean up on window close
window.addEventListener('beforeunload', () => {
  resizeObserver.disconnect()
  rpc.request['pty:close']({})
})
