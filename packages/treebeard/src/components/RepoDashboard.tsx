import { useState, useEffect, useCallback, useMemo } from 'react'
import { Stack, Group, Title, Text, ActionIcon, Loader, Alert, Collapse, Code } from '@mantine/core'
import { IconRefresh, IconPlus, IconChevronDown, IconChevronRight, IconAlertCircle, IconCheck, IconX } from '@tabler/icons-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { WorktreeCard } from './WorktreeCard'
import { AddWorktreeModal } from './AddWorktreeModal'
import { DirtyBadge } from './DirtyBadge'
import { LaunchButtons } from './LaunchButtons'
import { useWorktrees } from '../hooks/useWorktrees'
import { useCollapsed } from '../hooks/useCollapsed'
import { useHomedir } from '../hooks/useHomedir'
import { useFetchRepo } from '../hooks/useFetchRepo'
import { useWorktreeStatus } from '../hooks/useWorktreeStatus'
import { WORKTREE_DRAG_PREFIX } from '../shared/workspace-dnd'
import type { IdeId, RepoConfig, Worktree } from '../shared/types'

// --- RepoSection ---

interface MainWorktreeControlsProps {
  worktree: Worktree
  pollIntervalSec: number
  refreshKey: number
  defaultIde: IdeId
}

function MainWorktreeControls({ worktree, pollIntervalSec, refreshKey, defaultIde }: MainWorktreeControlsProps) {
  const { status, loading, refresh } = useWorktreeStatus(worktree.path, pollIntervalSec, refreshKey)

  return (
    <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
      <DirtyBadge status={status} loading={loading} worktreePath={worktree.path} onPullComplete={refresh} />
      <LaunchButtons worktreePath={worktree.path} defaultIde={defaultIde} />
    </Group>
  )
}

interface DraggableWorktreeCardProps {
  repo: RepoConfig
  worktree: Worktree
  pollIntervalSec: number
  refreshKey: number
  defaultIde: IdeId
  deleting: boolean
  settingUp: boolean
  onConfirmDelete: (force: boolean) => void
  onRenamed: () => void
}

function DraggableWorktreeCard({
  repo,
  worktree,
  pollIntervalSec,
  refreshKey,
  defaultIde,
  deleting,
  settingUp,
  onConfirmDelete,
  onRenamed
}: DraggableWorktreeCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${WORKTREE_DRAG_PREFIX}${repo.id}:${worktree.path}`
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.45 : 1,
        transform: CSS.Translate.toString(transform),
        touchAction: 'none'
      }}
      {...attributes}
      {...listeners}
    >
      <WorktreeCard
        worktree={worktree}
        repoPath={repo.path}
        pollIntervalSec={pollIntervalSec}
        refreshKey={refreshKey}
        defaultIde={defaultIde}
        deleting={deleting}
        settingUp={settingUp}
        onConfirmDelete={onConfirmDelete}
        onRenamed={onRenamed}
      />
    </div>
  )
}

interface RepoSectionProps {
  repo: RepoConfig
  pollIntervalSec: number
  fetchIntervalSec: number
  search: string
  defaultIde: IdeId
  isCollapsed: boolean
  onToggleCollapse: () => void
  onExpand: () => Promise<void>
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
  onExpand,
  isDropTarget,
  isOver,
  jiraDropBranch,
  onJiraDropBranchClear
}: RepoSectionProps) {
  const { worktrees, loading, error, deleteError, deletingPaths, startDelete, clearDeleteError, settingUpPaths, setupError, startSetup, clearSetupError, refresh } = useWorktrees(repo.path, pollIntervalSec)
  const [addOpened, setAddOpened] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
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
    await onExpand()
    const commands = repo.setupCommands ?? []
    if (commands.length > 0) void startSetup(worktreePath, commands)
  }

  const dropHighlight = isDropTarget && isOver

  const query = search.toLowerCase()
  const visibleWorktrees = query
    ? worktrees.filter(
        (wt) =>
          wt.branch.toLowerCase().includes(query) ||
          wt.path.toLowerCase().includes(query)
      )
    : worktrees.filter((wt) => !wt.isMain)
  const mainWorktree = worktrees.find((wt) => wt.isMain)
  const shouldShowBody = loading || Boolean(error) || Boolean(deleteError) || Boolean(setupError) || visibleWorktrees.length > 0

  if (!loading && visibleWorktrees.length === 0 && query) return null

  return (
    <div
      data-repo-id={repo.id}
      style={{
        transition: 'border-color 0.1s, background 0.1s',
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
          {shouldShowBody && (
            <ActionIcon variant="subtle" color="dimmed" size="sm" onClick={onToggleCollapse}>
              {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
            </ActionIcon>
          )}
          <Title
            order={4}
            style={{ fontFamily: 'monospace', cursor: shouldShowBody ? 'pointer' : 'default' }}
            onClick={shouldShowBody ? onToggleCollapse : undefined}
          >
            {repo.name}
          </Title>
          <Text size="xs" c="dimmed">
            {shortenPath(repo.path)}
          </Text>
        </Group>
        <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
          {mainWorktree && (
            <MainWorktreeControls
              worktree={mainWorktree}
              pollIntervalSec={pollIntervalSec}
              refreshKey={refreshKey}
              defaultIde={defaultIde}
            />
          )}
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
            {visibleWorktrees.map((wt) => (
              wt.isMain ? (
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
                  onRenamed={refresh}
                />
              ) : (
                <DraggableWorktreeCard
                  key={wt.path}
                  repo={repo}
                  worktree={wt}
                  pollIntervalSec={pollIntervalSec}
                  refreshKey={refreshKey}
                  defaultIde={defaultIde}
                  deleting={deletingPaths.has(wt.path)}
                  settingUp={settingUpPaths.has(wt.path)}
                  onConfirmDelete={(force) => startDelete(wt.path, force)}
                  onRenamed={refresh}
                />
              )
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
  isDraggingJira,
  overRepoId,
  jiraDropTargets,
  onJiraDropBranchClear
}: RepoDashboardProps) {
  const { collapsed, toggle, expand } = useCollapsed()

  const sortedRepos = useMemo(
    () => [...repos].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [repos]
  )

  if (sortedRepos.length === 0) {
    return (
      <Stack align="center" justify="center" h={300} gap="md">
        <Text size="lg" c="dimmed">No repositories configured</Text>
        <Text size="sm" c="dimmed">Open Settings to add your Git repositories.</Text>
      </Stack>
    )
  }

  return (
    <Stack gap="xl">
      {sortedRepos.map((repo) => (
        <RepoSection
          key={repo.id}
          repo={repo}
          pollIntervalSec={pollIntervalSec}
          fetchIntervalSec={fetchIntervalSec}
          search={search}
          defaultIde={defaultIde}
          isCollapsed={collapsed.has(repo.id)}
          onToggleCollapse={() => toggle(repo.id)}
          onExpand={() => expand(repo.id)}
          isDropTarget={isDraggingJira}
          isOver={overRepoId === repo.id}
          jiraDropBranch={jiraDropTargets[repo.id] ?? null}
          onJiraDropBranchClear={() => onJiraDropBranchClear(repo.id)}
        />
      ))}
    </Stack>
  )
}
