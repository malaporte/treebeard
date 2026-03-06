export interface ParsedPairingInput {
  url: string
  token: string
}

export interface ResolvedPairingCredentials {
  baseUrl: string
  token: string
}

interface ScanPairingHandlers {
  connectInFlight: boolean
  onInvalid: () => void
  onIgnored: () => void
  onPairingParsed: (pairing: ParsedPairingInput) => void
  connect: (pairing: ParsedPairingInput) => Promise<void>
}

export function parsePairingInput(input: string): ParsedPairingInput | null {
  if (!input.startsWith('treebeard://pair?')) return null
  try {
    const query = input.slice('treebeard://pair?'.length)
    const params = new URLSearchParams(query)
    const encodedData = params.get('data')
    if (!encodedData) return null

    const decoded = decodeURIComponent(encodedData)
    const payload = JSON.parse(decoded) as { url?: string; token?: string }
    if (typeof payload.url !== 'string' || typeof payload.token !== 'string') return null

    return {
      url: payload.url,
      token: payload.token
    }
  } catch {
    return null
  }
}

export function resolvePairingCredentials(baseUrlInput: string, tokenInput: string): ResolvedPairingCredentials | null {
  const baseUrl = baseUrlInput.trim().replace(/\/$/, '')
  const rawTokenInput = tokenInput.trim()
  if (!baseUrl || !rawTokenInput) return null

  const pairing = parsePairingInput(rawTokenInput)
  return {
    baseUrl: pairing?.url || baseUrl,
    token: pairing?.token || rawTokenInput
  }
}

export async function handleScannedPairing(value: string, handlers: ScanPairingHandlers): Promise<void> {
  const pairing = parsePairingInput(value)
  if (!pairing) {
    handlers.onInvalid()
    return
  }

  if (handlers.connectInFlight) {
    handlers.onIgnored()
    return
  }

  handlers.onPairingParsed(pairing)
  await handlers.connect(pairing)
}
