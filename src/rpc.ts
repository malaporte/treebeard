// Typed accessor for the Electrobun RPC instance set up in mainview/index.tsx.
// Hooks import `rpc` from this module to call bun-side functions.

interface RPCAccessor {
  request: {
    [key: string]: (params: any) => Promise<any>
  }
  send: {
    [key: string]: (params: any) => void
  }
}

function getElectroview(): { rpc: RPCAccessor } {
  return (window as any).__electrobun
}

export function rpc() {
  return getElectroview().rpc
}
