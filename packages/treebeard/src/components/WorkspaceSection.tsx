import { useState, useEffect } from 'react'
import { Stack, Group, Title, Badge, ActionIcon, Loader, Collapse } from '@mantine/core'
import { IconPlus, IconRefresh, IconChevronDown, IconChevronRight, IconGripVertical } from '@tabler/icons-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AddWorkspaceWorktreeModal } from './AddWorkspaceWorktreeModal'
import { WorkspaceWorktreeCard } from './WorkspaceWorktreeCard'
import { useWorkspaceWorktrees } from '../hooks/useWorkspaceWorktrees'
import { rpc } from '../rpc'
import type { IdeId, RepoConfig, Workspace } from '../shared/types'

interface WorkspaceSectionProps {
  workspace: Workspace
  repos: RepoConfig[]
  pollIntervalSec: number
  fetchIntervalSec: number
  search: string
  defaultIde: IdeId
  isCollapsed: boolean
  onToggleCollapse: () => void
  isDropTarget: boolean
  isOver: boolean
  jiraDropBranch: string | null
  onJiraDropBranchClear: () => void
}

export function WorkspaceSection({
  workspace,
  repos,
  pollIntervalSec,
  search,
  defaultIde,
  isCollapsed,
  onToggleCollapse,
  isDropTarget,
  isOver,
  jiraDropBranch,
  onJiraDropBranchClear,
}: WorkspaceSectionProps) {
  const { worktrees, loading, refresh } = useWorkspaceWorktrees(workspace.id, pollIntervalSec)
  const [addOpened, setAddOpened] = useState(false)
  const [fetching, setFetching] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: workspace.id })

  useEffect(() => {
    if (jiraDropBranch) setAddOpened(true)
  }, [jiraDropBranch])

  const handleClose = () => {
    setAddOpened(false)
    onJiraDropBranchClear()
  }

  const handleCreated = async () => {
    onJiraDropBranchClear()
    await refresh()
  }

  const handleFetch = async () => {
    setFetching(true)
    try {
      await rpc().request['workspace:fetch']({ workspaceId: workspace.id })
      await refresh()
    } catch {
      // silently fail
    } finally {
      setFetching(false)
    }
  }

  const dropHighlight = isDropTarget && isOver

  const query = search.toLowerCase()
  const visibleWorktrees = query
    ? worktrees.filter((wt) => wt.branch.toLowerCase().includes(query))
    : worktrees

  const memberRepos = repos.filter((r) => workspace.repoIds.includes(r.id))
  const shouldShowBody = loading || visibleWorktrees.length > 0

  if (!loading && visibleWorktrees.length === 0 && query) return null

  return (
    <div
      ref={setNodeRef}
      data-workspace-id={workspace.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? (transition ?? undefined) : 'border-color 0.1s, background 0.1s',
        opacity: isDragging ? 0.4 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderRadius: 8,
        borderTop: isDropTarget
          ? dropHighlight ? '1px dashed rgba(0, 136, 255, 0.9)' : '1px dashed rgba(0, 136, 255, 0.35)'
          : '1px solid transparent',
        borderRight: isDropTarget
          ? dropHighlight ? '1px dashed rgba(0, 136, 255, 0.9)' : '1px dashed rgba(0, 136, 255, 0.35)'
          : '1px solid transparent',
        borderBottom: isDropTarget
          ? dropHighlight ? '1px dashed rgba(0, 136, 255, 0.9)' : '1px dashed rgba(0, 136, 255, 0.35)'
          : '1px solid transparent',
        borderLeft: '3px solid var(--mantine-color-neon-6)',
        background: dropHighlight ? 'rgba(0, 136, 255, 0.06)' : undefined,
        padding: isDropTarget ? 8 : undefined,
        paddingLeft: isDropTarget ? 12 : 8,
      }}
    >
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <ActionIcon
            variant="subtle"
            color="dimmed"
            size="sm"
            style={{ cursor: 'grab', touchAction: 'none' }}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={14} />
          </ActionIcon>
          {shouldShowBody && (
            <ActionIcon variant="subtle" color="dimmed" size="sm" onClick={onToggleCollapse}>
              {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
            </ActionIcon>
          )}
          <Title
            order={4}
            fw={600}
            style={{ cursor: shouldShowBody ? 'pointer' : 'default' }}
            onClick={shouldShowBody ? onToggleCollapse : undefined}
          >
            {workspace.name}
          </Title>
          <Group gap={4} wrap="nowrap">
            {memberRepos.map((repo) => (
              <Badge key={repo.id} variant="light" color="neon" size="sm">
                {repo.name}
              </Badge>
            ))}
          </Group>
        </Group>
        <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
          <ActionIcon variant="subtle" color="neon" onClick={() => setAddOpened(true)}>
            <IconPlus size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="neon" onClick={handleFetch} loading={fetching}>
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <AddWorkspaceWorktreeModal
        workspace={workspace}
        repos={memberRepos}
        opened={addOpened}
        onClose={handleClose}
        onCreated={handleCreated}
        initialBranch={jiraDropBranch ?? undefined}
      />

      <Collapse in={!isCollapsed && shouldShowBody}>
        {loading && worktrees.length === 0 ? (
          <Group justify="center" p="md">
            <Loader size="sm" />
          </Group>
        ) : (
          <Stack gap="sm">
            {visibleWorktrees.map((wt) => (
              <WorkspaceWorktreeCard
                key={wt.branch}
                workspaceWorktree={wt}
                workspace={workspace}
                pollIntervalSec={pollIntervalSec}
                refreshKey={0}
                defaultIde={defaultIde}
                onDelete={async (force: boolean) => {
                  await rpc().request['workspace:removeWorktree']({ workspaceId: workspace.id, branch: wt.branch, force })
                  await refresh()
                }}
                onRepair={async () => {
                  await rpc().request['workspace:repair']({ workspaceId: workspace.id, branch: wt.branch })
                  await refresh()
                }}
              />
            ))}
          </Stack>
        )}
      </Collapse>
    </div>
  )
}
