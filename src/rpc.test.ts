import { describe, expect, it } from 'vitest'
import { rpc } from './rpc'

describe('rpc accessor', () => {
  it('returns rpc object from window.__electrobun', () => {
    const request = { test: async () => ({ ok: true }) }
    const send = { ping: () => {} }
    ;(window as unknown as { __electrobun: unknown }).__electrobun = {
      rpc: { request, send }
    }

    expect(rpc()).toEqual({ request, send })
  })
})
