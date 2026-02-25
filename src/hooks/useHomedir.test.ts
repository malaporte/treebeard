import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHomedir } from './useHomedir'

const homedirRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'system:homedir': homedirRequest
    }
  })
}))

describe('useHomedir', () => {
  beforeEach(() => {
    homedirRequest.mockReset()
  })

  it('shortens paths within home directory', async () => {
    homedirRequest.mockResolvedValue('/Users/frodo')
    const { result } = renderHook(() => useHomedir())

    await waitFor(() => {
      expect(result.current.homedir).toBe('/Users/frodo')
    })

    expect(result.current.shortenPath('/Users/frodo/Developer/treebeard')).toBe('~/Developer/treebeard')
    expect(result.current.shortenPath('/tmp/other')).toBe('/tmp/other')
  })
})
