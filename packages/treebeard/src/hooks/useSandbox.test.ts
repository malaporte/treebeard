import { renderHook, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSandbox } from './useSandbox'
import type { SandboxStatus } from '../shared/types'

const statusRequest = vi.fn()
const startRequest = vi.fn()
const stopRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'leash:status': statusRequest,
      'leash:start': startRequest,
      'leash:stop': stopRequest
    }
  })
}))

const STOPPED: SandboxStatus = { state: 'stopped', port: null, controlUiPort: null, error: null }
const RUNNING: SandboxStatus = { state: 'running', port: 9111, controlUiPort: 18080, error: null }
const STARTING: SandboxStatus = { state: 'starting', port: null, controlUiPort: null, error: null }
const ERROR_STATUS: SandboxStatus = { state: 'error', port: null, controlUiPort: null, error: 'leash exited unexpectedly' }

describe('useSandbox', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    statusRequest.mockResolvedValue(STOPPED)
    startRequest.mockResolvedValue(RUNNING)
    stopRequest.mockResolvedValue(STOPPED)
  })

  it('fetches initial status on mount', async () => {
    const { result } = renderHook(() => useSandbox())

    await waitFor(() => {
      expect(result.current.status).toEqual(STOPPED)
    })

    expect(statusRequest).toHaveBeenCalledWith({})
  })

  it('returns null status when RPC fails', async () => {
    statusRequest.mockRejectedValueOnce(new Error('rpc down'))

    const { result } = renderHook(() => useSandbox())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.status).toBeNull()
  })

  it('starts sandbox and updates status', async () => {
    const { result } = renderHook(() => useSandbox())

    await waitFor(() => {
      expect(result.current.status).toEqual(STOPPED)
    })

    await act(async () => {
      await result.current.start()
    })

    expect(startRequest).toHaveBeenCalledWith({})
    expect(result.current.status).toEqual(RUNNING)
    expect(result.current.loading).toBe(false)
  })

  it('stops sandbox and updates status', async () => {
    statusRequest.mockResolvedValue(RUNNING)

    const { result } = renderHook(() => useSandbox())

    await waitFor(() => {
      expect(result.current.status).toEqual(RUNNING)
    })

    await act(async () => {
      await result.current.stop()
    })

    expect(stopRequest).toHaveBeenCalledWith({})
    expect(result.current.status).toEqual(STOPPED)
    expect(result.current.loading).toBe(false)
  })

  it('falls back to fetchStatus when start fails', async () => {
    startRequest.mockRejectedValueOnce(new Error('start failed'))
    statusRequest.mockResolvedValue(ERROR_STATUS)

    const { result } = renderHook(() => useSandbox())

    await waitFor(() => {
      expect(result.current.status).toBeTruthy()
    })

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.status).toEqual(ERROR_STATUS)
    expect(result.current.loading).toBe(false)
  })

  it('falls back to fetchStatus when stop fails', async () => {
    statusRequest.mockResolvedValue(RUNNING)
    stopRequest.mockRejectedValueOnce(new Error('stop failed'))

    const { result } = renderHook(() => useSandbox())

    await waitFor(() => {
      expect(result.current.status).toEqual(RUNNING)
    })

    await act(async () => {
      await result.current.stop()
    })

    // fetchStatus was called as fallback — still returns RUNNING since stop failed
    expect(result.current.status).toEqual(RUNNING)
    expect(result.current.loading).toBe(false)
  })

  it('polls while in running state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    statusRequest.mockResolvedValue(RUNNING)

    const { result } = renderHook(() => useSandbox())

    await waitFor(() => {
      expect(result.current.status).toEqual(RUNNING)
    })

    const callsBefore = statusRequest.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(statusRequest.mock.calls.length).toBeGreaterThan(callsBefore)

    vi.useRealTimers()
  })

  it('polls while in starting state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    statusRequest.mockResolvedValue(STARTING)

    const { result } = renderHook(() => useSandbox())

    await waitFor(() => {
      expect(result.current.status).toEqual(STARTING)
    })

    const callsBefore = statusRequest.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(statusRequest.mock.calls.length).toBeGreaterThan(callsBefore)

    vi.useRealTimers()
  })

  it('does not poll while stopped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    statusRequest.mockResolvedValue(STOPPED)

    const { result } = renderHook(() => useSandbox())

    await waitFor(() => {
      expect(result.current.status).toEqual(STOPPED)
    })

    const callsBefore = statusRequest.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    expect(statusRequest.mock.calls.length).toBe(callsBefore)

    vi.useRealTimers()
  })
})
