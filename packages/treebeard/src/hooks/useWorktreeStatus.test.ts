import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorktreeStatus } from './useWorktreeStatus'

const worktreeStatusRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'git:worktreeStatus': worktreeStatusRequest
    }
  })
}))

describe('useWorktreeStatus', () => {
  beforeEach(() => {
    worktreeStatusRequest.mockReset()
  })

  it('loads status and refreshes', async () => {
    worktreeStatusRequest
      .mockResolvedValueOnce({
        hasUncommittedChanges: true,
        unpushedCommits: 1,
        unpulledCommits: 0,
        linesAdded: 4,
        linesDeleted: 2
      })
      .mockResolvedValueOnce({
        hasUncommittedChanges: false,
        unpushedCommits: 0,
        unpulledCommits: 0,
        linesAdded: 0,
        linesDeleted: 0
      })

    const { result } = renderHook(() => useWorktreeStatus('/repo/wt'))

    await waitFor(() => {
      expect(result.current.status?.unpushedCommits).toBe(1)
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.status?.unpushedCommits).toBe(0)
  })

  it('sets status to null when request fails', async () => {
    worktreeStatusRequest.mockRejectedValueOnce(new Error('rpc failed'))
    const { result } = renderHook(() => useWorktreeStatus('/repo/wt'))

    await waitFor(() => {
      expect(result.current.status).toBeNull()
      expect(result.current.loading).toBe(false)
    })
  })
})
