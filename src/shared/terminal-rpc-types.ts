import type { RPCSchema } from 'electrobun/bun'

export type TerminalRPC = {
  bun: RPCSchema<{
    requests: {
      'pty:write': {
        params: { data: string }
        response: void
      }
      'pty:resize': {
        params: { cols: number; rows: number }
        response: void
      }
      'pty:close': {
        params: Record<string, never>
        response: void
      }
    }
    messages: Record<string, never>
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: {
      'pty:data': {
        payload: { data: string }
      }
      'pty:exit': {
        payload: { exitCode: number }
      }
      'pty:ready': {
        payload: { worktreeName: string }
      }
    }
  }>
}
