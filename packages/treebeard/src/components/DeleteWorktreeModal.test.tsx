import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteWorktreeModal } from './DeleteWorktreeModal'
import { renderWithMantine } from '../test/render'

const statusRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'git:worktreeStatus': statusRequest
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
  })

  it('calls onConfirm with force=true when warnings are present', async () => {
    statusRequest.mockResolvedValue({
      hasUncommittedChanges: true,
      unpushedCommits: 2,
      unpulledCommits: 0,
      linesAdded: 1,
      linesDeleted: 0
    })

    const onConfirm = vi.fn()
    const onClose = vi.fn()

    renderWithMantine(
      <DeleteWorktreeModal
        opened={true}
        onClose={onClose}
        onConfirm={onConfirm}
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

    expect(onConfirm).toHaveBeenCalledWith(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm with force=false when no warnings', async () => {
    statusRequest.mockResolvedValue({
      hasUncommittedChanges: false,
      unpushedCommits: 0,
      unpulledCommits: 0,
      linesAdded: 0,
      linesDeleted: 0
    })

    const onConfirm = vi.fn()

    renderWithMantine(
      <DeleteWorktreeModal
        opened={true}
        onClose={() => {}}
        onConfirm={onConfirm}
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

    expect(onConfirm).toHaveBeenCalledWith(false)
  })
})
