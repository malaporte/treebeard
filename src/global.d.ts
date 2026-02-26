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

declare module 'qrcode' {
  interface QRCodeOptions {
    margin?: number
    scale?: number
    color?: {
      dark?: string
      light?: string
    }
  }

  const QRCode: {
    toDataURL: (text: string, options?: QRCodeOptions) => Promise<string>
  }

  export default QRCode
}
