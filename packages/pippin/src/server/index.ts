import {
  DEFAULT_PORT,
  DEFAULT_HOST,
  HEALTH_PATH,
  EXEC_PATH,
} from '../shared/types'
import {
  createSession,
  handleMessage,
  destroySession,
  destroyAllSessions,
  getActiveSessionCount,
} from './executor'
import type { SessionData } from './executor'
import type { ExecParams, ClientMessage, HealthResponse } from '../shared/types'
const VERSION = '0.1.0'

// Bun.serve's fetch handler receives a Request with a string `url` property
// at runtime, but bun-types may not expose it depending on the lib config.
interface ServeRequest {
  url: string
  headers: Headers
}

export interface PippinServer {
  server: ReturnType<typeof Bun.serve>
  stop: () => void
}

/** Start the pippin HTTP + WebSocket server on the given port and host */
export function startServer(
  port: number = DEFAULT_PORT,
  host: string = DEFAULT_HOST,
): PippinServer {
  const server = Bun.serve<SessionData>({
    port,
    hostname: host,

    fetch(req: ServeRequest, server) {
      const url = new URL(req.url)

      if (url.pathname === HEALTH_PATH) {
        const body: HealthResponse = {
          status: 'ok',
          version: VERSION,
          activeSessions: getActiveSessionCount(),
        }
        return new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.pathname === EXEC_PATH) {
        const cmd = url.searchParams.get('cmd')
        if (!cmd) {
          return new Response(JSON.stringify({ error: 'missing cmd parameter' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }

        const params: ExecParams = {
          cmd,
          cwd: url.searchParams.get('cwd') || undefined,
          cols: url.searchParams.has('cols') ? parseInt(url.searchParams.get('cols')!, 10) : undefined,
          rows: url.searchParams.has('rows') ? parseInt(url.searchParams.get('rows')!, 10) : undefined,
        }

        // Parse env from repeated env.KEY=VALUE query params
        const env: Record<string, string> = {}
        for (const [key, value] of url.searchParams) {
          if (key.startsWith('env.')) {
            env[key.slice(4)] = value
          }
        }
        if (Object.keys(env).length > 0) {
          params.env = env
        }

        const upgraded = server.upgrade(req as unknown as Request, {
          data: { sessionId: '', ...params },
        })

        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 500 })
        }

        return undefined
      }

      return new Response('Not Found', { status: 404 })
    },

    websocket: {
      open(ws) {
        // Extract exec params from the upgrade data
        const data = ws.data as SessionData & ExecParams
        const sessionId = createSession(ws, data.cmd, data.cwd, data.env)
        ws.data.sessionId = sessionId
      },

      message(ws, message) {
        try {
          const msg: ClientMessage = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
          handleMessage(ws.data.sessionId, msg)
        } catch {
          // Malformed message; ignore
        }
      },

      close(ws) {
        destroySession(ws.data.sessionId)
      },
    },
  })

  function stop() {
    destroyAllSessions()
    server.stop()
  }

  return { server, stop }
}

// --- Auto-start when run as the main module ---

if (import.meta.main) {
  const port = parseInt(process.env.PIPPIN_PORT || String(DEFAULT_PORT), 10)
  const host = process.env.PIPPIN_HOST || DEFAULT_HOST

  const { stop } = startServer(port, host)

  function shutdown() {
    stop()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
