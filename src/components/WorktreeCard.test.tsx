import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorktreeCard } from './WorktreeCard'
import { renderWithMantine } from '../test/render'

const launchVSCodeRequest = vi.fn()
const useJiraIssueMock = vi.fn()
const usePRMock = vi.fn()
const useWorktreeStatusMock = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'launch:vscode': launchVSCodeRequest
    }
  })
}))

vi.mock('../hooks/useJiraIssue', () => ({
  useJiraIssue: (issueKey: string | null) => useJiraIssueMock(issueKey)
}))

vi.mock('../hooks/usePR', () => ({
  usePR: (repoPath: string | null, branch: string | null) => usePRMock(repoPath, branch)
}))

vi.mock('../hooks/useWorktreeStatus', () => ({
  useWorktreeStatus: (worktreePath: string) => useWorktreeStatusMock(worktreePath)
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
    launchVSCodeRequest.mockReset()
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
        embeddedCodexEnabled={true}
        onDelete={() => {}}
        onOpenCodex={() => {}}
      />
    )

    expect(screen.getByTestId('jira-key').textContent).toBe('TB-123')
  })

  it('opens vscode on card double click and hides delete button for main branch', () => {
    const { rerender } = renderWithMantine(
      <WorktreeCard
        worktree={{
          path: '/repo/worktrees/main',
          branch: 'main',
          head: 'abc',
          isMain: true
        }}
        repoPath={'/repo'}
        embeddedCodexEnabled={true}
        onDelete={() => {}}
        onOpenCodex={() => {}}
      />
    )

    fireEvent.doubleClick(screen.getAllByText('main')[0])
    expect(launchVSCodeRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/main' })
    // Open Codex button is present, delete button is hidden for main
    expect(screen.queryAllByRole('button')).toHaveLength(1)

    rerender(
      <WorktreeCard
        worktree={{
          path: '/repo/worktrees/feat',
          branch: 'feat/one',
          head: 'def',
          isMain: false
        }}
        repoPath={'/repo'}
        embeddedCodexEnabled={true}
        onDelete={() => {}}
        onOpenCodex={() => {}}
      />
    )

    expect(screen.queryAllByRole('button').length).toBeGreaterThan(0)
  })

  it('calls onOpenCodex when button is clicked', async () => {
    const onOpenCodex = vi.fn()

    renderWithMantine(
      <WorktreeCard
        worktree={{
          path: '/repo/worktrees/main',
          branch: 'main',
          head: 'abc',
          isMain: true
        }}
        repoPath={'/repo'}
        embeddedCodexEnabled={true}
        onDelete={() => {}}
        onOpenCodex={onOpenCodex}
      />
    )

    const openButton = screen.getByRole('button')
    fireEvent.click(openButton)
    expect(onOpenCodex).toHaveBeenCalledWith({
      path: '/repo/worktrees/main',
      branch: 'main',
      head: 'abc',
      isMain: true
    })
  })

  it('hides the embedded codex button when mobile bridge support is disabled', () => {
    renderWithMantine(
      <WorktreeCard
        worktree={{
          path: '/repo/worktrees/main',
          branch: 'main',
          head: 'abc',
          isMain: true
        }}
        repoPath={'/repo'}
        embeddedCodexEnabled={false}
        onDelete={() => {}}
        onOpenCodex={() => {}}
      />
    )

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
