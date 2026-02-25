import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePR } from './usePR'

const prRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'gh:pr': prRequest
    }
  })
}))

describe('usePR', () => {
  beforeEach(() => {
    prRequest.mockReset()
  })

  it('returns null without repo or branch', async () => {
    const { result } = renderHook(() => usePR('/repo', null))

    await waitFor(() => {
      expect(result.current.pr).toBeNull()
      expect(result.current.loading).toBe(false)
    })

    expect(prRequest).not.toHaveBeenCalled()
  })

  it('loads PR details and handles RPC failures', async () => {
    prRequest.mockResolvedValueOnce({
      number: 1,
      url: 'https://github.com/acme/treebeard/pull/1',
      title: 'Feature',
      state: 'OPEN',
      isDraft: false,
      ciStatus: 'SUCCESS',
      ciFailed: 0,
      ciTotal: 2
    })

    const { result, rerender } = renderHook(
      ({ repo, branch }) => usePR(repo, branch),
      { initialProps: { repo: '/repo', branch: 'feat/a' as string | null } }
    )

    await waitFor(() => {
      expect(result.current.pr?.number).toBe(1)
    })

    prRequest.mockRejectedValueOnce(new Error('boom'))
    rerender({ repo: '/repo', branch: 'feat/b' })

    await waitFor(() => {
      expect(result.current.pr).toBeNull()
    })
  })
})
