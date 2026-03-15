/** Default port for the pippin server */
export const DEFAULT_PORT = 9111

/** Default host the pippin server binds to */
export const DEFAULT_HOST = '0.0.0.0'

/** Health check endpoint path */
export const HEALTH_PATH = '/health'

/** Command execution endpoint path (upgrades to WebSocket) */
export const EXEC_PATH = '/exec'

// --- Client -> Server Messages ---

interface StdinMessage {
  type: 'stdin'
  data: string
}

interface ResizeMessage {
  type: 'resize'
  cols: number
  rows: number
}

interface SignalMessage {
  type: 'signal'
  signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL'
}

interface CloseStdinMessage {
  type: 'close_stdin'
}

export type ClientMessage = StdinMessage | ResizeMessage | SignalMessage | CloseStdinMessage

// --- Server -> Client Messages ---

interface StdoutMessage {
  type: 'stdout'
  data: string
}

interface StderrMessage {
  type: 'stderr'
  data: string
}

interface ExitMessage {
  type: 'exit'
  code: number
}

interface ErrorMessage {
  type: 'error'
  message: string
}

export type ServerMessage = StdoutMessage | StderrMessage | ExitMessage | ErrorMessage

// --- Health Check Response ---

export interface HealthResponse {
  status: 'ok'
  version: string
  activeSessions: number
}

// --- Exec Request (query params on WebSocket upgrade) ---

export interface ExecParams {
  cmd: string
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}
