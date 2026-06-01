import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceWorktreeCard } from './WorkspaceWorktreeCard'
import { renderWithMantine } from '../test/render'
import type { IdeId, Workspace, WorkspaceWorktree } from '../shared/types'

const launchWorkspaceIdeRequest = vi.fn()
const useWorkspaceWorktreeStatusMock = vi.fn()
const useJiraIssueMock = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'launch:workspaceIde': launchWorkspaceIdeRequest
    }
  })
}))

vi.mock('../hooks/useWorkspaceWorktreeStatus', () => ({
  useWorkspaceWorktreeStatus: (...args: unknown[]) => useWorkspaceWorktreeStatusMock(...args)
}))

vi.mock('../hooks/useJiraIssue', () => ({
  useJiraIssue: (...args: unknown[]) => useJiraIssueMock(...args)
}))

interface DirtyBadgeProps {
  status: unknown
  loading: boolean
}

interface LaunchButtonsProps {
  worktreePath: string
  defaultIde: IdeId
}

interface JiraBadgeProps {
  jiraKey: string | null
}

vi.mock('./DirtyBadge', () => ({
  DirtyBadge: ({ status, loading }: DirtyBadgeProps) => (
    <div data-testid="dirty-badge">{String(Boolean(status))}:{String(loading)}</div>
  )
}))

vi.mock('./LaunchButtons', () => ({
  LaunchButtons: ({ worktreePath, defaultIde }: LaunchButtonsProps) => (
    <div data-testid="launch-buttons" data-path={worktreePath} data-ide={defaultIde}>{worktreePath}</div>
  )
}))

vi.mock('./JiraBadge', () => ({
  JiraBadge: ({ jiraKey }: JiraBadgeProps) => (
    <div data-testid="jira-badge">{jiraKey ?? 'none'}</div>
  )
}))

const workspace: Workspace = {
  id: 'ws-1',
  name: 'My Workspace',
  slug: 'my-workspace',
  repoIds: ['repo-1', 'repo-2']
}

const completeWorktree: WorkspaceWorktree = {
  workspaceId: 'ws-1',
  branch: 'feat/my-feature',
  rootPath: '/worktrees/my-workspace/feat/my-feature',
  members: [
    { repoId: 'repo-1', repoName: 'frontend', path: '/worktrees/my-workspace/feat/my-feature/frontend', worktree: null },
    { repoId: 'repo-2', repoName: 'backend', path: '/worktrees/my-workspace/feat/my-feature/backend', worktree: null }
  ],
  isComplete: true
}

const incompleteWorktree: WorkspaceWorktree = {
  ...completeWorktree,
  isComplete: false,
  members: [
    { repoId: 'repo-1', repoName: 'frontend', path: '/worktrees/my-workspace/feat/my-feature/frontend', worktree: null },
    { repoId: 'repo-2', repoName: 'backend', path: null, worktree: null }
  ]
}

const defaultProps = {
  workspaceWorktree: completeWorktree,
  workspace,
  pollIntervalSec: 60,
  refreshKey: 0,
  defaultIde: 'vscode' as const,
  onDelete: vi.fn(),
  onRepair: vi.fn()
}

describe('WorkspaceWorktreeCard', () => {
  beforeEach(() => {
    launchWorkspaceIdeRequest.mockReset()
    useWorkspaceWorktreeStatusMock.mockReset()
    useJiraIssueMock.mockReset()

    useWorkspaceWorktreeStatusMock.mockReturnValue({ status: null, loading: false, refresh: vi.fn() })
    useJiraIssueMock.mockReturnValue({ issue: null, loading: false })
  })

  it('renders branch name', () => {
    renderWithMantine(<WorkspaceWorktreeCard {...defaultProps} />)
    expect(screen.getByText('feat/my-feature')).toBeTruthy()
  })

  it('shows Incomplete badge when isComplete is false', () => {
    renderWithMantine(
      <WorkspaceWorktreeCard {...defaultProps} workspaceWorktree={incompleteWorktree} />
    )
    expect(screen.getByText('Incomplete')).toBeTruthy()
  })

  it('does not show Incomplete badge when isComplete is true', () => {
    renderWithMantine(<WorkspaceWorktreeCard {...defaultProps} />)
    expect(screen.queryByText('Incomplete')).toBeNull()
  })

  it('launch buttons target workspace root path', () => {
    renderWithMantine(<WorkspaceWorktreeCard {...defaultProps} />)
    const launchButtons = screen.getAllByTestId('launch-buttons')
    // The top-level LaunchButtons should target the workspace rootPath
    const rootLaunchButton = launchButtons.find(
      (el) => el.getAttribute('data-path') === completeWorktree.rootPath
    )
    expect(rootLaunchButton).toBeTruthy()
  })

  it('expand chevron shows per-repo details', () => {
    renderWithMantine(<WorkspaceWorktreeCard {...defaultProps} />)

    // Before expanding: only the workspace-level LaunchButtons (targeting rootPath) should be visible
    // The per-repo LaunchButtons are inside a Collapse that starts closed
    const launchButtonsBefore = screen.getAllByTestId('launch-buttons')
    const memberPathsBefore = launchButtonsBefore.map((el) => el.getAttribute('data-path'))
    // Only the root-level launch button should be present initially
    expect(memberPathsBefore.some((p) => p === completeWorktree.rootPath)).toBe(true)

    // Click the expand chevron (first action icon button)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])

    // After expanding, per-repo launch buttons targeting member paths should appear
    const launchButtonsAfter = screen.getAllByTestId('launch-buttons')
    const memberPathsAfter = launchButtonsAfter.map((el) => el.getAttribute('data-path'))
    expect(memberPathsAfter).toContain('/worktrees/my-workspace/feat/my-feature/frontend')
    expect(memberPathsAfter).toContain('/worktrees/my-workspace/feat/my-feature/backend')
  })

  it('incomplete state shows Repair and Remove partial buttons', () => {
    renderWithMantine(
      <WorkspaceWorktreeCard {...defaultProps} workspaceWorktree={incompleteWorktree} />
    )
    expect(screen.getByRole('button', { name: /repair/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /remove partial/i })).toBeTruthy()
  })

  it('complete state does not show Repair and Remove partial buttons', () => {
    renderWithMantine(<WorkspaceWorktreeCard {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /repair/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /remove partial/i })).toBeNull()
  })
})
