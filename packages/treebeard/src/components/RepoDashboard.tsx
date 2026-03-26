import { useState, useEffect, useCallback } from 'react'
import { Stack, Group, Title, Text, ActionIcon, Loader, Alert, Collapse, Code } from '@mantine/core'
import { IconRefresh, IconPlus, IconChevronDown, IconChevronRight, IconGripVertical, IconAlertCircle, IconCheck, IconX } from '@tabler/icons-react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { WorktreeCard } from './WorktreeCard'
import { AddWorktreeModal } from './AddWorktreeModal'
import { useWorktrees } from '../hooks/useWorktrees'
import { useCollapsed } from '../hooks/useCollapsed'
import { useHomedir } from '../hooks/useHomedir'
import { useFetchRepo } from '../hooks/useFetchRepo'
import type { IdeId, RepoConfig } from '../shared/types'

// --- RepoSection ---

interface RepoSectionProps {
  repo: RepoConfig
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

function RepoSection({
  repo,
  pollIntervalSec,
  fetchIntervalSec,
  search,
  defaultIde,
  isCollapsed,
  onToggleCollapse,
  isDropTarget,
  isOver,
  jiraDropBranch,
  onJiraDropBranchClear
}: RepoSectionProps) {
  const { worktrees, loading, error, deleteError, deletingPaths, startDelete, clearDeleteError, settingUpPaths, setupError, startSetup, clearSetupError, refresh } = useWorktrees(repo.path, pollIntervalSec)
  const [addOpened, setAddOpened] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: repo.id })
  const { shortenPath } = useHomedir()

  const handleFetched = useCallback(() => setRefreshKey((k) => k + 1), [])
  useFetchRepo(repo.path, fetchIntervalSec, handleFetched)

  useEffect(() => {
    if (jiraDropBranch) setAddOpened(true)
  }, [jiraDropBranch])

  const handleClose = () => {
    setAddOpened(false)
    onJiraDropBranchClear()
  }

  const handleWorktreeCreated = async (worktreePath: string) => {
    onJiraDropBranchClear()
    await refresh()
    const commands = repo.setupCommands ?? []
    if (commands.length > 0) void startSetup(worktreePath, commands)
  }

  const dropHighlight = isDropTarget && isOver

  const query = search.toLowerCase()
  const filtered = query
    ? worktrees.filter(
        (wt) =>
          wt.branch.toLowerCase().includes(query) ||
          wt.path.toLowerCase().includes(query)
      )
    : worktrees

  if (!loading && filtered.length === 0 && query) return null

  return (
    <div
      ref={setNodeRef}
      data-repo-id={repo.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? transition ?? undefined : 'border-color 0.1s, background 0.1s',
        opacity: isDragging ? 0.4 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderRadius: 8,
        border: isDropTarget
          ? dropHighlight
            ? '1px dashed rgba(0, 136, 255, 0.9)'
            : '1px dashed rgba(0, 136, 255, 0.35)'
          : '1px solid transparent',
        background: dropHighlight ? 'rgba(0, 136, 255, 0.06)' : undefined,
        padding: isDropTarget ? 8 : undefined,
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
          <ActionIcon variant="subtle" color="dimmed" size="sm" onClick={onToggleCollapse}>
            {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
          </ActionIcon>
          <Title order={4} style={{ fontFamily: 'monospace', cursor: 'pointer' }} onClick={onToggleCollapse}>
            {repo.name}
          </Title>
          <Text size="xs" c="dimmed">
            {shortenPath(repo.path)}
          </Text>
        </Group>
        <Group gap={4}>
          <ActionIcon variant="subtle" color="neon" onClick={() => setAddOpened(true)}>
            <IconPlus size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="neon" onClick={() => { refresh(); setRefreshKey((k) => k + 1) }} loading={loading}>
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <AddWorktreeModal
        repo={repo}
        opened={addOpened}
        onClose={handleClose}
        onCreated={handleWorktreeCreated}
        initialBranch={jiraDropBranch ?? undefined}
      />

      <Collapse in={!isCollapsed}>
        {error && (
          <Alert color="pink" variant="light" title="Error" mb="sm">{error}</Alert>
        )}
        {deleteError && (
          <Alert color="pink" variant="light" icon={<IconAlertCircle size={16} />} mb="sm" withCloseButton onClose={clearDeleteError}>
            {deleteError}
          </Alert>
        )}
        {setupError && (
          <Alert color="orange" variant="light" icon={<IconAlertCircle size={16} />} title={`Setup failed for ${setupError.worktreeName}`} mb="sm" withCloseButton onClose={clearSetupError}>
            <Stack gap="xs" mt={4}>
              {setupError.results.map((result, idx) => (
                <div key={idx}>
                  <Group gap="xs" wrap="nowrap">
                    {result.success
                      ? <IconCheck size={14} color="var(--mantine-color-green-6)" />
                      : <IconX size={14} color="var(--mantine-color-pink-6)" />}
                    <Code style={{ fontSize: 12 }}>{result.command}</Code>
                  </Group>
                  {!result.success && result.output && (
                    <Code block style={{ fontSize: 11, maxHeight: 120, overflow: 'auto', marginTop: 4 }}>
                      {result.output}
                    </Code>
                  )}
                </div>
              ))}
            </Stack>
          </Alert>
        )}
        {loading && worktrees.length === 0 ? (
          <Group justify="center" p="md">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">Loading worktrees...</Text>
          </Group>
        ) : (
          <Stack gap="sm">
            {filtered.map((wt) => (
              <WorktreeCard
                key={wt.path}
                worktree={wt}
                repoPath={repo.path}
                pollIntervalSec={pollIntervalSec}
                refreshKey={refreshKey}
                defaultIde={defaultIde}
                deleting={deletingPaths.has(wt.path)}
                settingUp={settingUpPaths.has(wt.path)}
                onConfirmDelete={(force) => startDelete(wt.path, force)}
              />
            ))}
          </Stack>
        )}
      </Collapse>
    </div>
  )
}

// --- RepoDashboard ---

interface RepoDashboardProps {
  repos: RepoConfig[]
  pollIntervalSec: number
  fetchIntervalSec: number
  search: string
  defaultIde: IdeId
  onReorder: (repos: RepoConfig[]) => void
  // Jira drag state from native drag (useJiraDrag)
  isDraggingJira: boolean
  overRepoId: string | null
  jiraDropTargets: Record<string, string | null>
  onJiraDropBranchClear: (repoId: string) => void
}

export function RepoDashboard({
  repos,
  pollIntervalSec,
  fetchIntervalSec,
  search,
  defaultIde,
  onReorder,
  isDraggingJira,
  overRepoId,
  jiraDropTargets,
  onJiraDropBranchClear
}: RepoDashboardProps) {
  const { collapsed, toggle } = useCollapsed()
  const [orderedRepos, setOrderedRepos] = useState(repos)

  useEffect(() => {
    setOrderedRepos(repos)
  }, [repos])

  if (orderedRepos.length === 0) {
    return (
      <Stack align="center" justify="center" h={300} gap="md">
        <Text size="lg" c="dimmed">No repositories configured</Text>
        <Text size="sm" c="dimmed">Open Settings to add your Git repositories.</Text>
      </Stack>
    )
  }

  return (
    <SortableContext items={orderedRepos.map((r) => r.id)} strategy={verticalListSortingStrategy}>
      <Stack gap="xl">
        {orderedRepos.map((repo) => (
          <RepoSection
            key={repo.id}
            repo={repo}
            pollIntervalSec={pollIntervalSec}
            fetchIntervalSec={fetchIntervalSec}
            search={search}
            defaultIde={defaultIde}
            isCollapsed={collapsed.has(repo.id)}
            onToggleCollapse={() => toggle(repo.id)}
            isDropTarget={isDraggingJira}
            isOver={overRepoId === repo.id}
            jiraDropBranch={jiraDropTargets[repo.id] ?? null}
            onJiraDropBranchClear={() => onJiraDropBranchClear(repo.id)}
          />
        ))}
      </Stack>
    </SortableContext>
  )
}
