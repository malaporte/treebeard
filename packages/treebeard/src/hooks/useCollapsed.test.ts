import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollapsed } from './useCollapsed'

const getCollapsedRequest = vi.fn()
const setCollapsedRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'config:getCollapsed': getCollapsedRequest,
      'config:setCollapsed': setCollapsedRequest
    }
  })
}))

describe('useCollapsed', () => {
  beforeEach(() => {
    getCollapsedRequest.mockReset()
    setCollapsedRequest.mockReset()
  })

  it('loads collapsed ids and toggles persistence', async () => {
    getCollapsedRequest.mockResolvedValue(['repo-1'])

    const { result } = renderHook(() => useCollapsed())

    await waitFor(() => {
      expect(result.current.collapsed.has('repo-1')).toBe(true)
    })

    await act(async () => {
      await result.current.toggle('repo-2')
    })

    expect(result.current.collapsed.has('repo-2')).toBe(true)
    expect(setCollapsedRequest).toHaveBeenLastCalledWith({ ids: ['repo-1', 'repo-2'] })
  })

  it('expands a collapsed id and does not persist an already expanded id', async () => {
    getCollapsedRequest.mockResolvedValue(['repo-1'])

    const { result } = renderHook(() => useCollapsed())

    await waitFor(() => {
      expect(result.current.collapsed.has('repo-1')).toBe(true)
    })

    await act(async () => {
      await result.current.expand('repo-1')
    })

    expect(result.current.collapsed.has('repo-1')).toBe(false)
    expect(setCollapsedRequest).toHaveBeenCalledWith({ ids: [] })

    setCollapsedRequest.mockClear()

    await act(async () => {
      await result.current.expand('repo-1')
    })

    expect(setCollapsedRequest).not.toHaveBeenCalled()
  })
})
