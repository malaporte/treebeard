import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RepoDashboard } from './RepoDashboard'
import { renderWithMantine } from '../test/render'
import type { RepoConfig } from '../shared/types'
import type { ReactNode } from 'react'

const useWorktreesMock = vi.fn()
const useCollapsedMock = vi.fn()
const useWorktreeStatusMock = vi.fn()

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  closestCenter: () => null,
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    isDragging: false
  }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>
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
    },
    Translate: {
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

vi.mock('../hooks/useWorktreeStatus', () => ({
  useWorktreeStatus: (worktreePath: string, pollIntervalSec: number, refreshKey?: number) =>
    useWorktreeStatusMock(worktreePath, pollIntervalSec, refreshKey)
}))

vi.mock('../hooks/useHomedir', () => ({
  useHomedir: () => ({
    shortenPath: (value: string) => value
  })
}))

interface DirtyBadgeProps {
  worktreePath?: string
}

vi.mock('./DirtyBadge', () => ({
  DirtyBadge: ({ worktreePath }: DirtyBadgeProps) => <div data-testid="main-status">{worktreePath}</div>
}))

interface LaunchButtonsProps {
  worktreePath: string
  defaultIde: string
}

vi.mock('./LaunchButtons', () => ({
  LaunchButtons: ({ worktreePath, defaultIde }: LaunchButtonsProps) => <div data-testid="main-actions">{`${defaultIde}:${worktreePath}`}</div>
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
    useWorktreeStatusMock.mockReset()
    useCollapsedMock.mockReturnValue({ collapsed: new Set<string>(), toggle: vi.fn() })
    useWorktreeStatusMock.mockReturnValue({
      status: null,
      loading: false,
      refresh: vi.fn()
    })
    useWorktreesMock.mockReturnValue({
      worktrees: [],
      loading: false,
      loaded: true,
      error: null,
      deleteError: null,
      deletingPaths: new Set<string>(),
      startDelete: vi.fn(),
      clearDeleteError: vi.fn(),
      settingUpPaths: new Set<string>(),
      setupError: null,
      startSetup: vi.fn(),
      clearSetupError: vi.fn(),
      refresh: vi.fn()
    })
  })

  it('shows empty state when no repositories are configured', () => {
    renderWithMantine(
      <RepoDashboard
        repos={[]}
        pollIntervalSec={60}
        fetchIntervalSec={300}
        search={''}
        defaultIde="vscode"
        onReorder={() => {}}
        isDraggingJira={false}
        overRepoId={null}
        jiraDropTargets={{}}
        onJiraDropBranchClear={() => {}}
      />
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
      loaded: true,
      error: null,
      deleteError: null,
      deletingPaths: new Set<string>(),
      startDelete: vi.fn(),
      clearDeleteError: vi.fn(),
      settingUpPaths: new Set<string>(),
      setupError: null,
      startSetup: vi.fn(),
      clearSetupError: vi.fn(),
      refresh: vi.fn()
    })

    const { rerender } = renderWithMantine(
      <RepoDashboard
        repos={repos}
        pollIntervalSec={60}
        fetchIntervalSec={300}
        search={'feat'}
        defaultIde="vscode"
        onReorder={() => {}}
        isDraggingJira={false}
        overRepoId={null}
        jiraDropTargets={{}}
        onJiraDropBranchClear={() => {}}
      />
    )

    expect(screen.getByText('treebeard')).toBeTruthy()
    expect(screen.getByText('feat/testing')).toBeTruthy()
    expect(screen.queryByText('main')).toBeNull()

    rerender(
      <RepoDashboard
        repos={repos}
        pollIntervalSec={60}
        fetchIntervalSec={300}
        search={'missing'}
        defaultIde="vscode"
        onReorder={() => {}}
        isDraggingJira={false}
        overRepoId={null}
        jiraDropTargets={{}}
        onJiraDropBranchClear={() => {}}
      />
    )

    expect(screen.queryByText('treebeard')).toBeNull()
  })

  it('renders active repositories before inactive repositories without showing main worktrees by default', async () => {
    const repos: RepoConfig[] = [
      { id: 'repo-1', name: 'repo-one', path: '/repo-one' },
      { id: 'repo-2', name: 'repo-two', path: '/repo-two' },
      { id: 'repo-3', name: 'repo-three', path: '/repo-three' },
      { id: 'repo-4', name: 'repo-four', path: '/repo-four' }
    ]

    useWorktreesMock.mockImplementation((repoPath: string) => ({
      worktrees: repoPath === '/repo-one'
        ? [{ path: '/repo-one/main', branch: 'main', head: 'abc', isMain: true }]
        : repoPath === '/repo-two'
          ? [
              { path: '/repo-two/main', branch: 'main', head: 'abc', isMain: true },
              { path: '/repo-two/feature', branch: 'feat/two', head: 'def', isMain: false }
            ]
          : repoPath === '/repo-three'
            ? [
                { path: '/repo-three/main', branch: 'main', head: 'abc', isMain: true },
                { path: '/repo-three/feature', branch: 'feat/three', head: 'def', isMain: false }
              ]
            : [{ path: '/repo-four/main', branch: 'main', head: 'abc', isMain: true }],
      loading: false,
      loaded: true,
      error: null,
      deleteError: null,
      deletingPaths: new Set<string>(),
      startDelete: vi.fn(),
      clearDeleteError: vi.fn(),
      settingUpPaths: new Set<string>(),
      setupError: null,
      startSetup: vi.fn(),
      clearSetupError: vi.fn(),
      refresh: vi.fn()
    }))

    renderWithMantine(
      <RepoDashboard
        repos={repos}
        pollIntervalSec={60}
        fetchIntervalSec={300}
        search={''}
        defaultIde="vscode"
        onReorder={() => {}}
        isDraggingJira={false}
        overRepoId={null}
        jiraDropTargets={{}}
        onJiraDropBranchClear={() => {}}
      />
    )

    await waitFor(() => {
      const names = screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)
      expect(names).toEqual(['repo-two', 'repo-three', 'repo-one', 'repo-four'])
    })

    expect(screen.getAllByTestId('worktree-card').map((card) => card.textContent)).toEqual(['feat/two', 'feat/three'])
  })

  it('shows main status and action controls for inactive repositories without rendering a main card body', () => {
    const repos: RepoConfig[] = [{ id: 'repo-1', name: 'treebeard', path: '/repo' }]

    useWorktreesMock.mockReturnValue({
      worktrees: [
        { path: '/repo/wt/main', branch: 'main', head: 'abc', isMain: true }
      ],
      loading: false,
      loaded: true,
      error: null,
      deleteError: null,
      deletingPaths: new Set<string>(),
      startDelete: vi.fn(),
      clearDeleteError: vi.fn(),
      settingUpPaths: new Set<string>(),
      setupError: null,
      startSetup: vi.fn(),
      clearSetupError: vi.fn(),
      refresh: vi.fn()
    })

    renderWithMantine(
      <RepoDashboard
        repos={repos}
        pollIntervalSec={60}
        fetchIntervalSec={300}
        search={''}
        defaultIde="vscode"
        onReorder={() => {}}
        isDraggingJira={false}
        overRepoId={null}
        jiraDropTargets={{}}
        onJiraDropBranchClear={() => {}}
      />
    )

    expect(screen.queryAllByTestId('worktree-card')).toEqual([])
    expect(screen.getByTestId('main-status').textContent).toBe('/repo/wt/main')
    expect(screen.getByTestId('main-actions').textContent).toBe('vscode:/repo/wt/main')
    expect(useWorktreeStatusMock).toHaveBeenCalledWith('/repo/wt/main', 60, 0)
  })

  it('keeps main status and action controls visible for collapsed active repositories', () => {
    const repos: RepoConfig[] = [{ id: 'repo-1', name: 'treebeard', path: '/repo' }]

    useCollapsedMock.mockReturnValue({ collapsed: new Set<string>(['repo-1']), toggle: vi.fn() })
    useWorktreesMock.mockReturnValue({
      worktrees: [
        { path: '/repo/wt/main', branch: 'main', head: 'abc', isMain: true },
        { path: '/repo/wt/feat', branch: 'feat/testing', head: 'def', isMain: false }
      ],
      loading: false,
      loaded: true,
      error: null,
      deleteError: null,
      deletingPaths: new Set<string>(),
      startDelete: vi.fn(),
      clearDeleteError: vi.fn(),
      settingUpPaths: new Set<string>(),
      setupError: null,
      startSetup: vi.fn(),
      clearSetupError: vi.fn(),
      refresh: vi.fn()
    })

    renderWithMantine(
      <RepoDashboard
        repos={repos}
        pollIntervalSec={60}
        fetchIntervalSec={300}
        search={''}
        defaultIde="intellij"
        onReorder={() => {}}
        isDraggingJira={false}
        overRepoId={null}
        jiraDropTargets={{}}
        onJiraDropBranchClear={() => {}}
      />
    )

    expect(screen.getByTestId('main-status').textContent).toBe('/repo/wt/main')
    expect(screen.getByTestId('main-actions').textContent).toBe('intellij:/repo/wt/main')
  })

  it('can surface main worktrees through search', async () => {
    const repos: RepoConfig[] = [{ id: 'repo-1', name: 'treebeard', path: '/repo' }]

    useWorktreesMock.mockReturnValue({
      worktrees: [
        { path: '/repo/wt/main', branch: 'main', head: 'abc', isMain: true },
        { path: '/repo/wt/feat', branch: 'feat/testing', head: 'def', isMain: false }
      ],
      loading: false,
      loaded: true,
      error: null,
      deleteError: null,
      deletingPaths: new Set<string>(),
      startDelete: vi.fn(),
      clearDeleteError: vi.fn(),
      settingUpPaths: new Set<string>(),
      setupError: null,
      startSetup: vi.fn(),
      clearSetupError: vi.fn(),
      refresh: vi.fn()
    })

    renderWithMantine(
      <RepoDashboard
        repos={repos}
        pollIntervalSec={60}
        fetchIntervalSec={300}
        search={'main'}
        defaultIde="vscode"
        onReorder={() => {}}
        isDraggingJira={false}
        overRepoId={null}
        jiraDropTargets={{}}
        onJiraDropBranchClear={() => {}}
      />
    )

    expect(await screen.findByText('main')).toBeTruthy()
    expect(screen.queryByText('feat/testing')).toBeNull()
  })
})
