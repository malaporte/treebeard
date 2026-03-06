import { describe, expect, it, vi } from 'vitest'
import { handleScannedPairing, parsePairingInput, resolvePairingCredentials } from './pairing'

function createDeepLink(url: string, token: string): string {
  const payload = encodeURIComponent(JSON.stringify({ url, token }))
  return `treebeard://pair?data=${payload}`
}

describe('parsePairingInput', () => {
  it('parses valid treebeard deep links', () => {
    const input = createDeepLink('http://10.0.0.1:8787', 'one-time-token')

    expect(parsePairingInput(input)).toEqual({
      url: 'http://10.0.0.1:8787',
      token: 'one-time-token'
    })
  })

  it('returns null for invalid payloads', () => {
    expect(parsePairingInput('https://example.com')).toBeNull()
    expect(parsePairingInput('treebeard://pair?data=not-json')).toBeNull()
  })
})

describe('resolvePairingCredentials', () => {
  it('prefers deep-link URL and token when token input is a deep link', () => {
    const resolved = resolvePairingCredentials(
      'http://192.168.1.10:8787/',
      createDeepLink('http://10.0.0.1:8787', 'qr-token')
    )

    expect(resolved).toEqual({
      baseUrl: 'http://10.0.0.1:8787',
      token: 'qr-token'
    })
  })

  it('falls back to manual values when token input is plain text', () => {
    const resolved = resolvePairingCredentials('http://192.168.1.10:8787/', 'manual-token')

    expect(resolved).toEqual({
      baseUrl: 'http://192.168.1.10:8787',
      token: 'manual-token'
    })
  })
})

describe('handleScannedPairing', () => {
  it('starts connect immediately after valid scan', async () => {
    const onInvalid = vi.fn()
    const onIgnored = vi.fn()
    const onPairingParsed = vi.fn()
    const connect = vi.fn().mockResolvedValue(undefined)

    await handleScannedPairing(createDeepLink('http://10.0.0.1:8787', 'scan-token'), {
      connectInFlight: false,
      onInvalid,
      onIgnored,
      onPairingParsed,
      connect
    })

    expect(onInvalid).not.toHaveBeenCalled()
    expect(onIgnored).not.toHaveBeenCalled()
    expect(onPairingParsed).toHaveBeenCalledWith({
      url: 'http://10.0.0.1:8787',
      token: 'scan-token'
    })
    expect(connect).toHaveBeenCalledWith({
      url: 'http://10.0.0.1:8787',
      token: 'scan-token'
    })
  })

  it('rejects invalid scanned values', async () => {
    const onInvalid = vi.fn()
    const onIgnored = vi.fn()
    const onPairingParsed = vi.fn()
    const connect = vi.fn().mockResolvedValue(undefined)

    await handleScannedPairing('bad-qr', {
      connectInFlight: false,
      onInvalid,
      onIgnored,
      onPairingParsed,
      connect
    })

    expect(onInvalid).toHaveBeenCalledTimes(1)
    expect(onIgnored).not.toHaveBeenCalled()
    expect(onPairingParsed).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('ignores scans while a connection is already in flight', async () => {
    const onInvalid = vi.fn()
    const onIgnored = vi.fn()
    const onPairingParsed = vi.fn()
    const connect = vi.fn().mockResolvedValue(undefined)

    await handleScannedPairing(createDeepLink('http://10.0.0.1:8787', 'scan-token'), {
      connectInFlight: true,
      onInvalid,
      onIgnored,
      onPairingParsed,
      connect
    })

    expect(onInvalid).not.toHaveBeenCalled()
    expect(onIgnored).toHaveBeenCalledTimes(1)
    expect(onPairingParsed).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })
})
