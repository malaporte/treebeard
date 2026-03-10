// Global type augmentations for the Electrobun-based Treebeard app.
// The Electroview instance is stored on window.__electrobun by mainview/index.tsx.

interface ElectrobunRPCAccessor {
  rpc: {
    request: Record<string, (params: any) => Promise<any>>
    send: Record<string, (params: any) => void>
  }
}

declare global {
  interface Window {
    __electrobun: ElectrobunRPCAccessor
  }
}

export {}
