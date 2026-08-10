import { useEffect, useState } from 'react'
import { ActionIcon, Alert, Button, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconAlertCircle, IconFolderPlus, IconRefresh, IconTrash } from '@tabler/icons-react'
import { useDroppable } from '@dnd-kit/core'
import { CreateWorkspaceModal } from './CreateWorkspaceModal'
import { DeleteWorkspaceModal } from './DeleteWorkspaceModal'
import { WorktreeCard } from './WorktreeCard'
import { WorkspaceLaunchButtons } from './WorkspaceLaunchButtons'
import { useWorktrees } from '../hooks/useWorktrees'
import { rpc } from '../rpc'
import { WORKSPACE_TARGET_PREFIX } from '../shared/workspace-dnd'
import type { IdeId, RepoConfig, Workspace, WorkspaceMember } from '../shared/types'

interface WorkspaceDashboardProps {
  workspaces: Workspace[]
  repositories: RepoConfig[]
  pollIntervalSec: number
  defaultIde: IdeId
  search: string
  onChanged: () => Promise<void>
  attachError: string | null
}

interface WorkspaceMemberCardProps {
  workspace: Workspace
  member: WorkspaceMember
  repo: RepoConfig
  pollIntervalSec: number
  defaultIde: IdeId
  search: string
  onChanged: () => Promise<void>
}

function WorkspaceMemberCard({ workspace, member, repo, pollIntervalSec, defaultIde, search, onChanged }: WorkspaceMemberCardProps) {
  const { worktrees, loading, refresh } = useWorktrees(repo.path, pollIntervalSec)
  const [detaching, setDetaching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const worktree = worktrees.find((candidate) => candidate.path === member.worktreePath)
  const query = search.toLowerCase()

  const handleDetach = async () => {
    if (detaching) return
    setDetaching(true)
    setError(null)
    try {
      const result = await rpc().request['workspace:removeMember']({ workspaceId: workspace.id, repoId: repo.id })
      if (!result.success) {
        setError(result.error ?? 'Failed to remove workspace link.')
        return
      }
      await onChanged()
    } catch {
      setError('Failed to remove workspace link.')
    } finally {
      setDetaching(false)
    }
  }

  if (loading && !worktree) return null
  if (!worktree) {
    return (
      <Alert color="yellow" variant="light" icon={<IconAlertCircle size={16} />}>
        <Text size="sm">{repo.name} worktree is missing from <Text component="span" fw={600}>{member.worktreePath}</Text>.</Text>
      </Alert>
    )
  }
  if (query && !worktree.branch.toLowerCase().includes(query) && !worktree.path.toLowerCase().includes(query)) return null

  return (
    <Stack gap={4}>
      {error && <Alert color="pink" variant="light" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
      {detaching && <Text size="xs" c="dimmed">Removing workspace link...</Text>}
      <WorktreeCard
        worktree={worktree}
        repoPath={repo.path}
        repoName={repo.name}
        pollIntervalSec={pollIntervalSec}
        refreshKey={0}
        defaultIde={defaultIde}
        onDetach={() => { void handleDetach() }}
        onRenamed={() => { void onChanged(); void refresh() }}
      />
    </Stack>
  )
}

interface WorkspaceSectionProps {
  workspace: Workspace
  repositories: RepoConfig[]
  pollIntervalSec: number
  defaultIde: IdeId
  search: string
  onDelete: (workspace: Workspace) => void
  onChanged: () => Promise<void>
}

function WorkspaceSection({ workspace, repositories, pollIntervalSec, defaultIde, search, onDelete, onChanged }: WorkspaceSectionProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `${WORKSPACE_TARGET_PREFIX}${workspace.id}` })
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <Stack
      ref={setNodeRef}
      gap="sm"
      p="md"
      style={{
        border: isOver ? '1px dashed rgba(0, 229, 255, 0.9)' : '1px solid rgba(0, 136, 255, 0.2)',
        background: isOver ? 'rgba(0, 229, 255, 0.06)' : 'rgba(0, 136, 255, 0.02)',
        borderRadius: 8
      }}
    >
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={4}>{workspace.name}</Title>
          <Text size="xs" c="dimmed">{workspace.path}</Text>
        </div>
        <Group gap={4} align="flex-start">
          <WorkspaceLaunchButtons workspacePath={workspace.path} />
          <Tooltip label="Refresh workspace worktrees">
            <ActionIcon variant="subtle" color="neon" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete workspace links">
            <ActionIcon variant="subtle" color="pink" size="sm" onClick={() => onDelete(workspace)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {workspace.members.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">Drag an existing worktree here to link it into this workspace.</Text>
      ) : (
        <Stack gap="sm">
          {workspace.members.map((member) => {
            const repo = repositories.find((candidate) => candidate.id === member.repoId)
            if (!repo) {
              return <Alert key={member.worktreePath} color="yellow" variant="light">Repository configuration is missing for {member.worktreePath}.</Alert>
            }
            return (
              <WorkspaceMemberCard
                key={`${member.worktreePath}-${refreshKey}`}
                workspace={workspace}
                member={member}
                repo={repo}
                pollIntervalSec={pollIntervalSec}
                defaultIde={defaultIde}
                search={search}
                onChanged={onChanged}
              />
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}

export function WorkspaceDashboard({ workspaces, repositories, pollIntervalSec, defaultIde, search, onChanged, attachError }: WorkspaceDashboardProps) {
  const [createOpened, setCreateOpened] = useState(false)
  const [deletingWorkspace, setDeletingWorkspace] = useState<Workspace | null>(null)

  useEffect(() => {
    void onChanged()
  }, [onChanged])

  return (
    <>
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={3}>Workspaces</Title>
            <Text size="sm" c="dimmed">Link existing worktrees into a shared folder for multi-repository sessions.</Text>
          </div>
          <Button leftSection={<IconFolderPlus size={16} />} onClick={() => setCreateOpened(true)}>New workspace</Button>
        </Group>
        {attachError && <Alert color="pink" variant="light" icon={<IconAlertCircle size={16} />}>{attachError}</Alert>}
        {workspaces.length === 0 ? (
          <Stack align="center" justify="center" py="sm" gap="sm">
            <Text size="lg" c="dimmed">No workspaces yet</Text>
            <Text size="sm" c="dimmed">Create one, then drag a worktree from its repository below.</Text>
          </Stack>
        ) : (
          <Stack gap="md">
            {workspaces.map((workspace) => (
              <WorkspaceSection
                key={workspace.id}
                workspace={workspace}
                repositories={repositories}
                pollIntervalSec={pollIntervalSec}
                defaultIde={defaultIde}
                search={search}
                onDelete={setDeletingWorkspace}
                onChanged={onChanged}
              />
            ))}
          </Stack>
        )}
      </Stack>
      <CreateWorkspaceModal opened={createOpened} onClose={() => setCreateOpened(false)} onCreated={() => { void onChanged() }} />
      <DeleteWorkspaceModal
        workspace={deletingWorkspace}
        opened={Boolean(deletingWorkspace)}
        onClose={() => setDeletingWorkspace(null)}
        onDeleted={() => { void onChanged() }}
      />
    </>
  )
}
