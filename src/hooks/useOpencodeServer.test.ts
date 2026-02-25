import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOpencodeServer } from './useOpencodeServer'
import type { OpencodeServerStatus } from '../shared/types'

const getStatusRequest = vi.fn()
const setEnabledRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'opencode:getStatus': getStatusRequest,
      'opencode:setEnabled': setEnabledRequest
    }
  })
}))

const OFF_STATUS: OpencodeServerStatus = {
  enabled: false,
  running: false,
  url: null,
  pid: null,
  error: null
}

const RUNNING_STATUS: OpencodeServerStatus = {
  enabled: true,
  running: true,
  url: 'http://127.0.0.1:4096',
  pid: 1234,
  error: null
}

describe('useOpencodeServer', () => {
  beforeEach(() => {
    getStatusRequest.mockReset()
    setEnabledRequest.mockReset()
  })

  it('fetches status on mount', async () => {
    getStatusRequest.mockResolvedValue(OFF_STATUS)

    const { result } = renderHook(() => useOpencodeServer('/repo/worktree'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.status).toEqual(OFF_STATUS)
    })

    expect(getStatusRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktree' })
  })

  it('sets status to null on fetch error', async () => {
    getStatusRequest.mockRejectedValue(new Error('RPC failed'))

    const { result } = renderHook(() => useOpencodeServer('/repo/worktree'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.status).toBeNull()
    })
  })

  it('toggle enables server and updates status', async () => {
    getStatusRequest.mockResolvedValue(OFF_STATUS)
    setEnabledRequest.mockResolvedValue(RUNNING_STATUS)

    const { result } = renderHook(() => useOpencodeServer('/repo/worktree'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.toggle()
    })

    expect(setEnabledRequest).toHaveBeenCalledWith({
      worktreePath: '/repo/worktree',
      enabled: true
    })

    expect(result.current.status).toEqual(RUNNING_STATUS)
    expect(result.current.toggling).toBe(false)
  })

  it('toggle disables server when currently enabled', async () => {
    getStatusRequest.mockResolvedValue(RUNNING_STATUS)
    setEnabledRequest.mockResolvedValue(OFF_STATUS)

    const { result } = renderHook(() => useOpencodeServer('/repo/worktree'))

    await waitFor(() => {
      expect(result.current.status).toEqual(RUNNING_STATUS)
    })

    await act(async () => {
      await result.current.toggle()
    })

    expect(setEnabledRequest).toHaveBeenCalledWith({
      worktreePath: '/repo/worktree',
      enabled: false
    })

    expect(result.current.status).toEqual(OFF_STATUS)
  })

  it('sets status to null on toggle error', async () => {
    getStatusRequest.mockResolvedValue(OFF_STATUS)
    setEnabledRequest.mockRejectedValue(new Error('Toggle failed'))

    const { result } = renderHook(() => useOpencodeServer('/repo/worktree'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.toggle()
    })

    expect(result.current.status).toBeNull()
    expect(result.current.toggling).toBe(false)
  })

  it('no-ops toggle when status is null', async () => {
    getStatusRequest.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useOpencodeServer('/repo/worktree'))

    await waitFor(() => {
      expect(result.current.status).toBeNull()
    })

    await act(async () => {
      await result.current.toggle()
    })

    expect(setEnabledRequest).not.toHaveBeenCalled()
  })

  it('refetches status on worktreePath change', async () => {
    getStatusRequest.mockResolvedValue(OFF_STATUS)

    const { result, rerender } = renderHook(
      ({ path }) => useOpencodeServer(path),
      { initialProps: { path: '/repo/a' } }
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    getStatusRequest.mockResolvedValue(RUNNING_STATUS)
    rerender({ path: '/repo/b' })

    await waitFor(() => {
      expect(result.current.status).toEqual(RUNNING_STATUS)
    })

    expect(getStatusRequest).toHaveBeenLastCalledWith({ worktreePath: '/repo/b' })
  })
})
