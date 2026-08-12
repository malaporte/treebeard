import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePRStack } from './usePRStack'

const stackSummaryRequest = vi.fn()
const stackDetailsRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'gh:stackSummary': stackSummaryRequest,
      'gh:stackDetails': stackDetailsRequest
    }
  })
}))

describe('usePRStack', () => {
  beforeEach(() => {
    stackSummaryRequest.mockReset()
    stackDetailsRequest.mockReset()
  })

  it('skips disabled worktrees and loads details only after expansion', async () => {
    const { result, rerender } = renderHook(
      ({ enabled, detailsEnabled }) => usePRStack('/repo/worktrees/ui', enabled, detailsEnabled, 0),
      { initialProps: { enabled: false, detailsEnabled: false } }
    )

    await waitFor(() => {
      expect(result.current.summary).toBeNull()
      expect(result.current.summaryLoading).toBe(false)
    })
    expect(stackSummaryRequest).not.toHaveBeenCalled()

    stackSummaryRequest.mockResolvedValueOnce({ trunk: 'main', layers: [] })
    rerender({ enabled: true, detailsEnabled: false })

    await waitFor(() => {
      expect(result.current.summary?.trunk).toBe('main')
    })
    expect(stackDetailsRequest).not.toHaveBeenCalled()

    stackDetailsRequest.mockResolvedValueOnce({ trunk: 'main', layers: [] })
    rerender({ enabled: true, detailsEnabled: true })

    await waitFor(() => {
      expect(result.current.details?.trunk).toBe('main')
    })
  })

  it('clears stack state when an RPC request fails', async () => {
    stackSummaryRequest.mockRejectedValueOnce(new Error('boom'))
    stackDetailsRequest.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(() => usePRStack('/repo/worktrees/ui', true, true, 0))

    await waitFor(() => {
      expect(result.current.summary).toBeNull()
      expect(result.current.details).toBeNull()
      expect(result.current.summaryLoading).toBe(false)
      expect(result.current.detailsLoading).toBe(false)
    })
  })
})
