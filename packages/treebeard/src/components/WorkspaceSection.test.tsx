import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSection } from './WorkspaceSection'
import { renderWithMantine } from '../test/render'
import type { RepoConfig, Workspace } from '../shared/types'

const workspaceFetchRequest = vi.fn()
const useWorkspaceWorktreesMock = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'workspace:fetch': workspaceFetchRequest,
      'workspace:removeWorktree': vi.fn(),
      'workspace:repair': vi.fn()
    }
  })
}))

vi.mock('../hooks/useWorkspaceWorktrees', () => ({
  useWorkspaceWorktrees: (...args: unknown[]) => useWorkspaceWorktreesMock(...args)
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false
  })
}))

interface AddWorkspaceWorktreeModalProps {
  opened: boolean
}

interface WorkspaceWorktreeCardProps {
  workspaceWorktree: { branch: string }
}

vi.mock('./AddWorkspaceWorktreeModal', () => ({
  AddWorkspaceWorktreeModal: ({ opened }: AddWorkspaceWorktreeModalProps) => (
    <div data-testid="add-workspace-worktree-modal" data-opened={String(opened)} />
  )
}))

vi.mock('./WorkspaceWorktreeCard', () => ({
  WorkspaceWorktreeCard: ({ workspaceWorktree }: WorkspaceWorktreeCardProps) => (
    <div data-testid="workspace-worktree-card">{workspaceWorktree.branch}</div>
  )
}))

const workspace: Workspace = {
  id: 'ws-1',
  name: 'My Workspace',
  slug: 'my-workspace',
  repoIds: ['repo-1', 'repo-2']
}

const repos: RepoConfig[] = [
  { id: 'repo-1', name: 'frontend', path: '/repos/frontend' },
  { id: 'repo-2', name: 'backend', path: '/repos/backend' },
  { id: 'repo-3', name: 'other', path: '/repos/other' }
]

const defaultProps = {
  workspace,
  repos,
  pollIntervalSec: 60,
  fetchIntervalSec: 300,
  search: '',
  defaultIde: 'vscode' as const,
  isCollapsed: false,
  onToggleCollapse: vi.fn(),
  isDropTarget: false,
  isOver: false,
  jiraDropBranch: null,
  onJiraDropBranchClear: vi.fn()
}

describe('WorkspaceSection', () => {
  beforeEach(() => {
    workspaceFetchRequest.mockReset()
    useWorkspaceWorktreesMock.mockReset()
    useWorkspaceWorktreesMock.mockReturnValue({
      worktrees: [],
      loading: false,
      refresh: vi.fn(),
      createWorktree: vi.fn(),
      removeWorktree: vi.fn(),
      repairWorktree: vi.fn()
    })
    workspaceFetchRequest.mockResolvedValue(undefined)
  })

  it('renders workspace name', () => {
    renderWithMantine(<WorkspaceSection {...defaultProps} />)
    expect(screen.getByText('My Workspace')).toBeTruthy()
  })

  it('renders member repo name chips', () => {
    renderWithMantine(<WorkspaceSection {...defaultProps} />)
    expect(screen.getByText('frontend')).toBeTruthy()
    expect(screen.getByText('backend')).toBeTruthy()
    expect(screen.queryByText('other')).toBeNull()
  })

  it('collapse toggle works — clicking chevron calls onToggleCollapse', () => {
    const onToggleCollapse = vi.fn()
    useWorkspaceWorktreesMock.mockReturnValue({
      worktrees: [
        {
          workspaceId: 'ws-1',
          branch: 'feat/test',
          rootPath: '/worktrees/my-workspace/feat/test',
          members: [],
          isComplete: true
        }
      ],
      loading: false,
      refresh: vi.fn(),
      createWorktree: vi.fn(),
      removeWorktree: vi.fn(),
      repairWorktree: vi.fn()
    })

    renderWithMantine(<WorkspaceSection {...defaultProps} onToggleCollapse={onToggleCollapse} />)

    const buttons = screen.getAllByRole('button')
    // The collapse toggle is the second button (after the drag handle)
    const collapseButton = buttons[1]
    fireEvent.click(collapseButton)

    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('add button opens modal — AddWorkspaceWorktreeModal receives opened={true}', async () => {
    renderWithMantine(<WorkspaceSection {...defaultProps} />)

    const modal = screen.getByTestId('add-workspace-worktree-modal')
    expect(modal.getAttribute('data-opened')).toBe('false')

    // Find the add (+) button — it's the first action button in the right group
    const buttons = screen.getAllByRole('button')
    const addButton = buttons.find((btn) => btn.querySelector('svg'))
    // Click the add button (IconPlus button)
    const allButtons = screen.getAllByRole('button')
    // The add button is the second-to-last button (before fetch)
    fireEvent.click(allButtons[allButtons.length - 2])

    await waitFor(() => {
      expect(screen.getByTestId('add-workspace-worktree-modal').getAttribute('data-opened')).toBe('true')
    })
  })

  it('fetch button calls workspace:fetch RPC', async () => {
    renderWithMantine(<WorkspaceSection {...defaultProps} />)

    const buttons = screen.getAllByRole('button')
    const fetchButton = buttons[buttons.length - 1]
    fireEvent.click(fetchButton)

    await waitFor(() => {
      expect(workspaceFetchRequest).toHaveBeenCalledWith({ workspaceId: 'ws-1' })
    })
  })
})
