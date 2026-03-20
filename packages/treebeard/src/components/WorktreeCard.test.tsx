import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorktreeCard } from './WorktreeCard'
import { renderWithMantine } from '../test/render'

const launchIdeRequest = vi.fn()
const useJiraIssueMock = vi.fn()
const usePRMock = vi.fn()
const useWorktreeStatusMock = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'launch:ide': launchIdeRequest
    }
  })
}))

vi.mock('../hooks/useJiraIssue', () => ({
  useJiraIssue: (issueKey: string | null, _pollIntervalSec: number, _refreshKey?: number) => useJiraIssueMock(issueKey)
}))

vi.mock('../hooks/usePR', () => ({
  usePR: (repoPath: string | null, branch: string | null, _pollIntervalSec: number, _refreshKey?: number) => usePRMock(repoPath, branch)
}))

vi.mock('../hooks/useWorktreeStatus', () => ({
  useWorktreeStatus: (worktreePath: string, _pollIntervalSec: number, _refreshKey?: number) => useWorktreeStatusMock(worktreePath)
}))

vi.mock('../hooks/useHomedir', () => ({
  useHomedir: () => ({
    shortenPath: (value: string) => value
  })
}))

interface JiraBadgeProps {
  jiraKey: string | null
}

interface PRBadgeProps {
  pr: unknown
  loading: boolean
}

interface DirtyBadgeProps {
  status: unknown
  loading: boolean
}

interface LaunchButtonsProps {
  worktreePath: string
}

vi.mock('./JiraBadge', () => ({
  JiraBadge: ({ jiraKey }: JiraBadgeProps) => <div data-testid="jira-key">{jiraKey ?? 'none'}</div>
}))

vi.mock('./PRBadge', () => ({
  PRBadge: ({ pr, loading }: PRBadgeProps) => <div data-testid="pr-props">{String(Boolean(pr))}:{String(loading)}</div>
}))

vi.mock('./DirtyBadge', () => ({
  DirtyBadge: ({ status, loading }: DirtyBadgeProps) => (
    <div data-testid="dirty-props">{String(Boolean(status))}:{String(loading)}</div>
  )
}))

vi.mock('./LaunchButtons', () => ({
  LaunchButtons: ({ worktreePath }: LaunchButtonsProps) => <div data-testid="launch-buttons">{worktreePath}</div>
}))

vi.mock('./DeleteWorktreeModal', () => ({
  DeleteWorktreeModal: () => <div data-testid="delete-modal" />
}))

describe('WorktreeCard', () => {
  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn())
    launchIdeRequest.mockReset()
    useJiraIssueMock.mockReset()
    usePRMock.mockReset()
    useWorktreeStatusMock.mockReset()

    useJiraIssueMock.mockReturnValue({ issue: null, loading: false })
    usePRMock.mockReturnValue({ pr: null, loading: false })
    useWorktreeStatusMock.mockReturnValue({ status: null, loading: false })
  })

  it('extracts and normalizes jira key from branch name', () => {
    renderWithMantine(
      <WorktreeCard
        worktree={{
          path: '/repo/worktrees/feat',
          branch: 'feature/tb-123-add-tests',
          head: 'abc',
          isMain: false
        }}
        repoPath={'/repo'}
        pollIntervalSec={60}
        refreshKey={0}
        defaultIde="vscode"
        onDelete={() => {}}
      />
    )

    expect(screen.getByTestId('jira-key').textContent).toBe('TB-123')
  })

  it('opens configured IDE on card double click and hides delete button for main branch', () => {
    const { rerender } = renderWithMantine(
      <WorktreeCard
        worktree={{
          path: '/repo/worktrees/main',
          branch: 'main',
          head: 'abc',
          isMain: true
        }}
        repoPath={'/repo'}
        pollIntervalSec={60}
        refreshKey={0}
        defaultIde="intellij"
        onDelete={() => {}}
      />
    )

    fireEvent.doubleClick(screen.getAllByText('main')[0])
    expect(launchIdeRequest).toHaveBeenCalledWith({ ideId: 'intellij', worktreePath: '/repo/worktrees/main' })
    // Delete button is hidden for main
    expect(screen.queryAllByRole('button')).toHaveLength(0)

    rerender(
      <WorktreeCard
        worktree={{
          path: '/repo/worktrees/feat',
          branch: 'feat/one',
          head: 'def',
          isMain: false
        }}
        repoPath={'/repo'}
        pollIntervalSec={60}
        refreshKey={0}
        defaultIde="intellij"
        onDelete={() => {}}
      />
    )

    expect(screen.queryAllByRole('button').length).toBeGreaterThan(0)
  })
})
