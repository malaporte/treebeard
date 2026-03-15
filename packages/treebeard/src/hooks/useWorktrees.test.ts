import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorktrees } from './useWorktrees'

const gitWorktreesRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'git:worktrees': gitWorktreesRequest
    }
  })
}))

describe('useWorktrees', () => {
  beforeEach(() => {
    gitWorktreesRequest.mockReset()
  })

  it('loads worktrees and exposes refresh', async () => {
    gitWorktreesRequest.mockResolvedValueOnce([
      { path: '/repo', branch: 'main', head: '123', isMain: true }
    ])

    const { result } = renderHook(() => useWorktrees('/repo', 0))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.worktrees).toHaveLength(1)
    })

    gitWorktreesRequest.mockResolvedValueOnce([])
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.worktrees).toEqual([])
  })

  it('captures request errors and clears worktrees', async () => {
    gitWorktreesRequest.mockRejectedValueOnce(new Error('rpc failed'))

    const { result } = renderHook(() => useWorktrees('/repo', 0))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBe('rpc failed')
      expect(result.current.worktrees).toEqual([])
    })
  })

  it('polls repeatedly when interval is configured', async () => {
    gitWorktreesRequest.mockResolvedValue([])
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    renderHook(() => useWorktrees('/repo', 2))

    await waitFor(() => {
      expect(gitWorktreesRequest).toHaveBeenCalledTimes(1)
    })

    expect(setIntervalSpy.mock.calls.length).toBeGreaterThan(0)
    const pollIntervalCall = setIntervalSpy.mock.calls.find((call) => call[1] === 2000)
    expect(pollIntervalCall).toBeTruthy()

    const intervalCallback = pollIntervalCall?.[0] as () => Promise<void>

    await act(async () => {
      await intervalCallback()
    })

    expect(gitWorktreesRequest).toHaveBeenCalledTimes(2)
  })
})
