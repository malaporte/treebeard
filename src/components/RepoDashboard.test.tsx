import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RepoDashboard } from './RepoDashboard'
import { renderWithMantine } from '../test/render'
import type { RepoConfig } from '../shared/types'
import type { ReactNode } from 'react'

const useWorktreesMock = vi.fn()
const useCollapsedMock = vi.fn()

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  closestCenter: () => null,
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => []
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false
  }),
  verticalListSortingStrategy: {},
  arrayMove: <T,>(array: T[], from: number, to: number) => {
    const copy = [...array]
    const [item] = copy.splice(from, 1)
    copy.splice(to, 0, item)
    return copy
  }
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => ''
    }
  }
}))

vi.mock('../hooks/useWorktrees', () => ({
  useWorktrees: (repoPath: string | null, pollIntervalSec: number) =>
    useWorktreesMock(repoPath, pollIntervalSec)
}))

vi.mock('../hooks/useCollapsed', () => ({
  useCollapsed: () => useCollapsedMock()
}))

vi.mock('../hooks/useHomedir', () => ({
  useHomedir: () => ({
    shortenPath: (value: string) => value
  })
}))

interface WorktreeCardProps {
  worktree: { branch: string }
}

vi.mock('./WorktreeCard', () => ({
  WorktreeCard: ({ worktree }: WorktreeCardProps) => <div data-testid="worktree-card">{worktree.branch}</div>
}))

vi.mock('./AddWorktreeModal', () => ({
  AddWorktreeModal: () => null
}))

describe('RepoDashboard', () => {
  beforeEach(() => {
    useCollapsedMock.mockReset()
    useWorktreesMock.mockReset()
    useCollapsedMock.mockReturnValue({ collapsed: new Set<string>(), toggle: vi.fn() })
    useWorktreesMock.mockReturnValue({
      worktrees: [],
      loading: false,
      error: null,
      refresh: vi.fn()
    })
  })

  it('shows empty state when no repositories are configured', () => {
    renderWithMantine(
      <RepoDashboard repos={[]} pollIntervalSec={60} search={''} onReorder={() => {}} />
    )

    expect(screen.getByText('No repositories configured')).toBeTruthy()
  })

  it('renders filtered worktrees for repository sections', () => {
    const repos: RepoConfig[] = [{ id: 'repo-1', name: 'treebeard', path: '/repo' }]

    useWorktreesMock.mockReturnValue({
      worktrees: [
        { path: '/repo/wt/main', branch: 'main', head: 'abc', isMain: true },
        { path: '/repo/wt/feat', branch: 'feat/testing', head: 'def', isMain: false }
      ],
      loading: false,
      error: null,
      refresh: vi.fn()
    })

    const { rerender } = renderWithMantine(
      <RepoDashboard repos={repos} pollIntervalSec={60} search={'feat'} onReorder={() => {}} />
    )

    expect(screen.getByText('treebeard')).toBeTruthy()
    expect(screen.getByText('feat/testing')).toBeTruthy()
    expect(screen.queryByText('main')).toBeNull()

    rerender(
      <RepoDashboard repos={repos} pollIntervalSec={60} search={'missing'} onReorder={() => {}} />
    )

    expect(screen.queryByText('treebeard')).toBeNull()
  })
})
