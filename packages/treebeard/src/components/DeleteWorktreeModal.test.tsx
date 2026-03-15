import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteWorktreeModal } from './DeleteWorktreeModal'
import { renderWithMantine } from '../test/render'

const statusRequest = vi.fn()
const removeRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'git:worktreeStatus': statusRequest,
      'git:removeWorktree': removeRequest
    }
  })
}))

vi.mock('../hooks/useHomedir', () => ({
  useHomedir: () => ({
    shortenPath: (value: string) => value
  })
}))

describe('DeleteWorktreeModal', () => {
  beforeEach(() => {
    statusRequest.mockReset()
    removeRequest.mockReset()
  })

  it('forces deletion when warnings are present', async () => {
    statusRequest.mockResolvedValue({
      hasUncommittedChanges: true,
      unpushedCommits: 2,
      unpulledCommits: 0,
      linesAdded: 1,
      linesDeleted: 0
    })
    removeRequest.mockResolvedValue({ success: true })

    const onSuccess = vi.fn()
    const onClose = vi.fn()

    renderWithMantine(
      <DeleteWorktreeModal
        opened={true}
        onClose={onClose}
        onSuccess={onSuccess}
        repoPath={'/repo'}
        worktree={{
          path: '/repo/.worktrees/feat',
          branch: 'feat/a',
          head: '123',
          isMain: false
        }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/uncommitted changes/i)).toBeTruthy()
      expect(screen.getByText(/unpushed commits/i)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete worktree' }))

    await waitFor(() => {
      expect(removeRequest).toHaveBeenCalledWith({
        repoPath: '/repo',
        worktreePath: '/repo/.worktrees/feat',
        force: true
      })
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows error message when delete fails', async () => {
    statusRequest.mockResolvedValue({
      hasUncommittedChanges: false,
      unpushedCommits: 0,
      unpulledCommits: 0,
      linesAdded: 0,
      linesDeleted: 0
    })
    removeRequest.mockResolvedValue({ success: false, error: 'cannot delete' })

    renderWithMantine(
      <DeleteWorktreeModal
        opened={true}
        onClose={() => {}}
        onSuccess={() => {}}
        repoPath={'/repo'}
        worktree={{
          path: '/repo/.worktrees/feat',
          branch: 'feat/a',
          head: '123',
          isMain: false
        }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/safe to remove/i)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete worktree' }))

    await waitFor(() => {
      expect(screen.getByText('cannot delete')).toBeTruthy()
    })
  })
})
