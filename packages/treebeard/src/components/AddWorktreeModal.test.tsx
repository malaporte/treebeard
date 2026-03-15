import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddWorktreeModal } from './AddWorktreeModal'
import { renderWithMantine } from '../test/render'

const defaultBranchRequest = vi.fn()
const remoteBranchesRequest = vi.fn()
const addWorktreeRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'git:defaultBranch': defaultBranchRequest,
      'git:remoteBranches': remoteBranchesRequest,
      'git:addWorktree': addWorktreeRequest
    }
  })
}))

describe('AddWorktreeModal', () => {
  beforeEach(() => {
    defaultBranchRequest.mockReset()
    remoteBranchesRequest.mockReset()
    addWorktreeRequest.mockReset()
    defaultBranchRequest.mockResolvedValue('main')
    remoteBranchesRequest.mockResolvedValue(['feat/a', 'feat/b'])
  })

  it('submits new branch worktree request', async () => {
    addWorktreeRequest.mockResolvedValue({ success: true })
    const onSuccess = vi.fn()
    const onClose = vi.fn()

    renderWithMantine(
      <AddWorktreeModal
        repo={{ id: 'repo-1', name: 'treebeard', path: '/repo' }}
        opened={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    )

    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feat/testing' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }))

    await waitFor(() => {
      expect(addWorktreeRequest).toHaveBeenCalledWith({
        repoPath: '/repo',
        repoName: 'treebeard',
        branch: 'feat/testing',
        isNewBranch: true
      })
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('switches to existing-branch mode after already-exists error', async () => {
    addWorktreeRequest
      .mockResolvedValueOnce({ success: false, error: 'branch already exists' })
      .mockResolvedValueOnce({ success: true })

    renderWithMantine(
      <AddWorktreeModal
        repo={{ id: 'repo-1', name: 'treebeard', path: '/repo' }}
        opened={true}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    )

    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feat/existing' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }))

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Use existing branch' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Use existing branch' }))

    await waitFor(() => {
      expect(addWorktreeRequest).toHaveBeenLastCalledWith({
        repoPath: '/repo',
        repoName: 'treebeard',
        branch: 'feat/existing',
        isNewBranch: false
      })
    })
  })
})
