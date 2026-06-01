import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddWorkspaceWorktreeModal } from './AddWorkspaceWorktreeModal'
import { renderWithMantine } from '../test/render'
import type { RepoConfig, Workspace } from '../shared/types'

const remoteBranchesRequest = vi.fn()
const addWorktreeRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'workspace:remoteBranches': remoteBranchesRequest,
      'workspace:addWorktree': addWorktreeRequest
    }
  })
}))

const workspace: Workspace = {
  id: 'ws-1',
  name: 'My Workspace',
  slug: 'my-workspace',
  repoIds: ['repo-1', 'repo-2']
}

const repos: RepoConfig[] = [
  { id: 'repo-1', name: 'frontend', path: '/repos/frontend' },
  { id: 'repo-2', name: 'backend', path: '/repos/backend' }
]

const defaultProps = {
  workspace,
  repos,
  opened: true,
  onClose: vi.fn(),
  onCreated: vi.fn()
}

describe('AddWorkspaceWorktreeModal', () => {
  beforeEach(() => {
    remoteBranchesRequest.mockReset()
    addWorktreeRequest.mockReset()
    remoteBranchesRequest.mockResolvedValue(['feat/a', 'feat/b'])
    addWorktreeRequest.mockResolvedValue({
      success: true,
      perRepo: [],
      workspacePath: '/worktrees/my-workspace/feat/test'
    })
  })

  it('renders filesystem preview with member repo names when branch is entered', async () => {
    renderWithMantine(<AddWorkspaceWorktreeModal {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feat/test' }
    })

    await waitFor(() => {
      expect(screen.getByText(/Filesystem layout/i)).toBeTruthy()
      expect(screen.getByText(/frontend/)).toBeTruthy()
      expect(screen.getByText(/backend/)).toBeTruthy()
    })
  })

  it('submit calls workspace:addWorktree with correct params', async () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()

    renderWithMantine(
      <AddWorkspaceWorktreeModal
        {...defaultProps}
        onCreated={onCreated}
        onClose={onClose}
      />
    )

    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feat/my-feature' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }))

    await waitFor(() => {
      expect(addWorktreeRequest).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        branch: 'feat/my-feature',
        isNewBranch: true
      })
    })

    expect(onCreated).toHaveBeenCalledWith('/worktrees/my-workspace/feat/test')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('initialBranch prop prefills the branch input', () => {
    renderWithMantine(
      <AddWorkspaceWorktreeModal {...defaultProps} initialBranch="feat/prefilled" />
    )

    const input = screen.getByLabelText('Branch name') as HTMLInputElement
    expect(input.value).toBe('feat/prefilled')
  })

  it('error state shows per-repo error details', async () => {
    addWorktreeRequest.mockResolvedValue({
      success: false,
      perRepo: [
        { repoId: 'repo-1', success: false, error: 'branch already exists' },
        { repoId: 'repo-2', success: true }
      ]
    })

    renderWithMantine(<AddWorkspaceWorktreeModal {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feat/conflict' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }))

    await waitFor(() => {
      expect(screen.getByText(/Failed to create worktree on some repos/i)).toBeTruthy()
      expect(screen.getByText('frontend:')).toBeTruthy()
      expect(screen.getByText('branch already exists')).toBeTruthy()
    })
  })
})
