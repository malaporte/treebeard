import { useState, useEffect, useCallback, useMemo } from 'react'
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
import { DirtyBadge } from './DirtyBadge'
import { LaunchButtons } from './LaunchButtons'
import { WorkspaceSection } from './WorkspaceSection'
import { useWorktrees } from '../hooks/useWorktrees'
import { useCollapsed } from '../hooks/useCollapsed'
import { useHomedir } from '../hooks/useHomedir'
import { useFetchRepo } from '../hooks/useFetchRepo'
import { useWorktreeStatus } from '../hooks/useWorktreeStatus'
import type { IdeId, RepoConfig, Workspace, Worktree } from '../shared/types'

type RepoActivity = 'active' | 'inactive' | 'unknown'

type SectionItem =
  | { type: 'repo'; id: string; repo: RepoConfig }
  | { type: 'workspace'; id: string; workspace: Workspace }

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
  onActivityChange: (repoId: string, activity: RepoActivity) => void
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
  onActivityChange,
  onJiraDropBranchClear
}: RepoSectionProps) {
  const { worktrees, loading, loaded, error, deleteError, deletingPaths, startDelete, clearDeleteError, settingUpPaths, setupError, startSetup, clearSetupError, refresh } = useWorktrees(repo.path, pollIntervalSec)
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
  const visibleWorktrees = query
    ? worktrees.filter(
        (wt) =>
          wt.branch.toLowerCase().includes(query) ||
          wt.path.toLowerCase().includes(query)
      )
    : worktrees.filter((wt) => !wt.isMain)
  const mainWorktree = worktrees.find((wt) => wt.isMain)
  const hasActiveWorktrees = worktrees.some((wt) => !wt.isMain)
  const activity: RepoActivity = loaded && !error
    ? hasActiveWorktrees ? 'active' : 'inactive'
    : 'unknown'
  const shouldShowBody = loading || Boolean(error) || Boolean(deleteError) || Boolean(setupError) || visibleWorktrees.length > 0

  useEffect(() => {
    onActivityChange(repo.id, activity)
  }, [repo.id, activity, onActivityChange])

  if (!loading && visibleWorktrees.length === 0 && query) return null

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

      <Collapse in={!isCollapsed && shouldShowBody}>
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
  workspaces?: Workspace[]
  pollIntervalSec: number
  fetchIntervalSec: number
  search: string
  defaultIde: IdeId
  onReorder: (repos: RepoConfig[]) => void
  // Jira drag state from native drag (useJiraDrag)
  isDraggingJira: boolean
  overRepoId: string | null
  jiraDropTargets: Record<string, string | null>
  onJiraDropBranchClear: (id: string) => void
}

function activityRank(activity: RepoActivity | undefined): number {
  if (activity === 'active') return 0
  if (activity === 'inactive') return 2
  return 1
}

export function RepoDashboard({
  repos,
  workspaces = [],
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
  const [repoActivityById, setRepoActivityById] = useState<Record<string, RepoActivity>>({})

  // Combined ordered section ids: repos first, then workspaces
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => [
    ...repos.map((r) => r.id),
    ...workspaces.map((w) => w.id),
  ])

  useEffect(() => {
    setOrderedRepos(repos)
  }, [repos])

  // Keep sectionOrder in sync when repos/workspaces change (add/remove)
  useEffect(() => {
    setSectionOrder((prev) => {
      const allIds = new Set([...repos.map((r) => r.id), ...workspaces.map((w) => w.id)])
      // Remove stale ids, then append any new ones (repos first, workspaces after)
      const kept = prev.filter((id) => allIds.has(id))
      const keptSet = new Set(kept)
      const newRepoIds = repos.map((r) => r.id).filter((id) => !keptSet.has(id))
      const newWorkspaceIds = workspaces.map((w) => w.id).filter((id) => !keptSet.has(id))
      return [...kept, ...newRepoIds, ...newWorkspaceIds]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos.map((r) => r.id).join(','), workspaces.map((w) => w.id).join(',')])

  useEffect(() => {
    setRepoActivityById((prev) => {
      const repoIds = new Set(repos.map((repo) => repo.id))
      const next: Record<string, RepoActivity> = {}
      for (const [repoId, activity] of Object.entries(prev)) {
        if (repoIds.has(repoId)) next[repoId] = activity
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
  }, [repos])

  const handleActivityChange = useCallback((repoId: string, activity: RepoActivity) => {
    setRepoActivityById((prev) => {
      if (prev[repoId] === activity) return prev
      return { ...prev, [repoId]: activity }
    })
  }, [])

  // Build unified section list in sectionOrder, with repo activity sorting applied within repo items
  const displaySections = useMemo((): SectionItem[] => {
    const repoById = new Map(repos.map((r) => [r.id, r]))
    const workspaceById = new Map(workspaces.map((w) => [w.id, w]))

    // Separate repo ids and workspace ids from sectionOrder
    const repoIds = sectionOrder.filter((id) => repoById.has(id))
    const workspaceIds = sectionOrder.filter((id) => workspaceById.has(id))

    // Sort repo ids by activity rank, preserving relative order within same rank
    const orderById = new Map(repoIds.map((id, index) => [id, index]))
    const sortedRepoIds = [...repoIds].sort((a, b) => {
      const rankDiff = activityRank(repoActivityById[a]) - activityRank(repoActivityById[b])
      if (rankDiff !== 0) return rankDiff
      return (orderById.get(a) ?? 0) - (orderById.get(b) ?? 0)
    })

    const repoSections: SectionItem[] = sortedRepoIds.reduce<SectionItem[]>((acc, id) => {
      const repo = repoById.get(id)
      if (repo) acc.push({ type: 'repo', id, repo })
      return acc
    }, [])

    const workspaceSections: SectionItem[] = workspaceIds.reduce<SectionItem[]>((acc, id) => {
      const workspace = workspaceById.get(id)
      if (workspace) acc.push({ type: 'workspace', id, workspace })
      return acc
    }, [])

    return [...repoSections, ...workspaceSections]
  }, [sectionOrder, repos, workspaces, repoActivityById])

  const allSectionIds = displaySections.map((s) => s.id)

  if (repos.length === 0 && workspaces.length === 0) {
    return (
      <Stack align="center" justify="center" h={300} gap="md">
        <Text size="lg" c="dimmed">No repositories configured</Text>
        <Text size="sm" c="dimmed">Open Settings to add your Git repositories.</Text>
      </Stack>
    )
  }

  return (
    <SortableContext items={allSectionIds} strategy={verticalListSortingStrategy}>
      <Stack gap="xl">
        {displaySections.map((section) => {
          if (section.type === 'repo') {
            return (
              <RepoSection
                key={section.id}
                repo={section.repo}
                pollIntervalSec={pollIntervalSec}
                fetchIntervalSec={fetchIntervalSec}
                search={search}
                defaultIde={defaultIde}
                isCollapsed={collapsed.has(section.id)}
                onToggleCollapse={() => toggle(section.id)}
                isDropTarget={isDraggingJira}
                isOver={overRepoId === section.id}
                jiraDropBranch={jiraDropTargets[section.id] ?? null}
                onActivityChange={handleActivityChange}
                onJiraDropBranchClear={() => onJiraDropBranchClear(section.id)}
              />
            )
          }

          return (
            <WorkspaceSection
              key={section.id}
              workspace={section.workspace}
              repos={repos}
              pollIntervalSec={pollIntervalSec}
              fetchIntervalSec={fetchIntervalSec}
              search={search}
              defaultIde={defaultIde}
              isCollapsed={collapsed.has(section.id)}
              onToggleCollapse={() => toggle(section.id)}
              isDropTarget={isDraggingJira}
              isOver={overRepoId === section.id}
              jiraDropBranch={jiraDropTargets[section.id] ?? null}
              onJiraDropBranchClear={() => onJiraDropBranchClear(section.id)}
            />
          )
        })}
      </Stack>
    </SortableContext>
  )
}
