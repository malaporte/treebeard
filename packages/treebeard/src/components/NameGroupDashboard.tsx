import { useState, useCallback, useMemo, useEffect } from 'react'
import { Stack, Group, Title, Text, ActionIcon, Loader, Collapse } from '@mantine/core'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { WorktreeCard } from './WorktreeCard'
import { useWorktrees } from '../hooks/useWorktrees'
import { useFetchRepo } from '../hooks/useFetchRepo'
import type { IdeId, RepoConfig, Worktree } from '../shared/types'

// --- Per-repo data loader ---

interface RepoWorktreeEntry {
  worktree: Worktree
  repo: RepoConfig
  repoPath: string
  deleting: boolean
  settingUp: boolean
  onConfirmDelete: (force: boolean) => void
  onRenamed: () => void
}

interface RepoLoaderProps {
  repo: RepoConfig
  pollIntervalSec: number
  fetchIntervalSec: number
  onData: (repoId: string, entries: RepoWorktreeEntry[], loading: boolean) => void
  onFetched: () => void
}

function RepoLoader({ repo, pollIntervalSec, fetchIntervalSec, onData, onFetched }: RepoLoaderProps) {
  const { worktrees, loading, deletingPaths, settingUpPaths, startDelete, refresh } = useWorktrees(repo.path, pollIntervalSec)

  useFetchRepo(repo.path, fetchIntervalSec, onFetched)

  const entries: RepoWorktreeEntry[] = useMemo(
    () =>
      worktrees
        .filter((wt) => !wt.isMain)
        .map((wt) => ({
          worktree: wt,
          repo,
          repoPath: repo.path,
          deleting: deletingPaths.has(wt.path),
          settingUp: settingUpPaths.has(wt.path),
          onConfirmDelete: (force: boolean) => startDelete(wt.path, force),
          onRenamed: refresh,
        })),
    [worktrees, repo, deletingPaths, settingUpPaths, startDelete, refresh]
  )

  // Report data to parent
  useEffect(() => {
    onData(repo.id, entries, loading)
  }, [repo.id, entries, loading, onData])

  return null
}

// --- Name group section ---

interface NameGroup {
  name: string
  entries: RepoWorktreeEntry[]
}

interface NameGroupSectionProps {
  group: NameGroup
  pollIntervalSec: number
  defaultIde: IdeId
  refreshKey: number
}

function NameGroupSection({ group, pollIntervalSec, defaultIde, refreshKey }: NameGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const repoCount = new Set(group.entries.map((e) => e.repo.id)).size

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Group gap="xs">
        <ActionIcon variant="subtle" color="dimmed" size="sm" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
        </ActionIcon>
        <Title
          order={4}
          style={{ fontFamily: 'monospace', cursor: 'pointer' }}
          onClick={() => setCollapsed(!collapsed)}
        >
          {group.name}
        </Title>
        {repoCount > 1 && (
          <Text size="xs" c="dimmed">
            {repoCount} repos
          </Text>
        )}
      </Group>

      <Collapse in={!collapsed}>
        <Stack gap="sm">
          {group.entries.map((entry) => (
            <WorktreeCard
              key={entry.worktree.path}
              worktree={entry.worktree}
              repoPath={entry.repoPath}
              pollIntervalSec={pollIntervalSec}
              refreshKey={refreshKey}
              defaultIde={defaultIde}
              deleting={entry.deleting}
              settingUp={entry.settingUp}
              repoName={entry.repo.name}
              onConfirmDelete={entry.onConfirmDelete}
              onRenamed={entry.onRenamed}
            />
          ))}
        </Stack>
      </Collapse>
    </div>
  )
}

// --- Main dashboard ---

interface NameGroupDashboardProps {
  repos: RepoConfig[]
  pollIntervalSec: number
  fetchIntervalSec: number
  search: string
  defaultIde: IdeId
}

function worktreeName(worktree: Worktree): string {
  return worktree.path.split('/').pop() ?? worktree.path
}

export function NameGroupDashboard({
  repos,
  pollIntervalSec,
  fetchIntervalSec,
  search,
  defaultIde
}: NameGroupDashboardProps) {
  const [repoData, setRepoData] = useState<Record<string, RepoWorktreeEntry[]>>({})
  const [repoLoading, setRepoLoading] = useState<Record<string, boolean>>({})
  const [refreshKey, setRefreshKey] = useState(0)

  const handleFetched = useCallback(() => setRefreshKey((k) => k + 1), [])

  const handleData = useCallback((repoId: string, entries: RepoWorktreeEntry[], loading: boolean) => {
    setRepoData((prev) => {
      if (prev[repoId] === entries) return prev
      return { ...prev, [repoId]: entries }
    })
    setRepoLoading((prev) => {
      if (prev[repoId] === loading) return prev
      return { ...prev, [repoId]: loading }
    })
  }, [])

  const allEntries = useMemo(
    () => Object.values(repoData).flat(),
    [repoData]
  )

  const anyLoading = useMemo(
    () => Object.values(repoLoading).some(Boolean),
    [repoLoading]
  )

  const groups: NameGroup[] = useMemo(() => {
    const query = search.toLowerCase()
    const filtered = query
      ? allEntries.filter(
          (e) =>
            worktreeName(e.worktree).toLowerCase().includes(query) ||
            e.worktree.branch.toLowerCase().includes(query) ||
            e.worktree.path.toLowerCase().includes(query)
        )
      : allEntries

    const map = new Map<string, RepoWorktreeEntry[]>()
    for (const entry of filtered) {
      const name = worktreeName(entry.worktree)
      const existing = map.get(name)
      if (existing) {
        existing.push(entry)
      } else {
        map.set(name, [entry])
      }
    }

    return Array.from(map.entries())
      .map(([name, entries]) => ({ name, entries }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allEntries, search])

  return (
    <>
      {repos.map((repo) => (
        <RepoLoader
          key={repo.id}
          repo={repo}
          pollIntervalSec={pollIntervalSec}
          fetchIntervalSec={fetchIntervalSec}
          onData={handleData}
          onFetched={handleFetched}
        />
      ))}

      {anyLoading && allEntries.length === 0 ? (
        <Group justify="center" p="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading worktrees...</Text>
        </Group>
      ) : groups.length === 0 ? (
        <Stack align="center" justify="center" h={300} gap="md">
          <Text size="lg" c="dimmed">No worktrees found</Text>
          <Text size="sm" c="dimmed">
            {search ? 'No worktrees match your filter.' : 'Create worktrees from the Repos view.'}
          </Text>
        </Stack>
      ) : (
        <Stack gap="xl">
          {groups.map((group) => (
            <NameGroupSection
              key={group.name}
              group={group}
              pollIntervalSec={pollIntervalSec}
              defaultIde={defaultIde}
              refreshKey={refreshKey}
            />
          ))}
        </Stack>
      )}
    </>
  )
}
