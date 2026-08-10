import { useState } from 'react'
import { Card, Text, Group, Badge, ActionIcon, Tooltip, Loader } from '@mantine/core'
import { IconGitBranch, IconTrash, IconPencil, IconUnlink } from '@tabler/icons-react'
import { JiraBadge } from './JiraBadge'
import { PRBadge } from './PRBadge'
import { DirtyBadge } from './DirtyBadge'
import { LaunchButtons } from './LaunchButtons'
import { DeleteWorktreeModal } from './DeleteWorktreeModal'
import { RenameWorktreeModal } from './RenameWorktreeModal'
import { useJiraIssue } from '../hooks/useJiraIssue'
import { usePR } from '../hooks/usePR'
import { useWorktreeStatus } from '../hooks/useWorktreeStatus'
import { useHomedir } from '../hooks/useHomedir'
import { rpc } from '../rpc'
import type { IdeId, Worktree } from '../shared/types'

interface WorktreeCardProps {
  worktree: Worktree
  repoPath: string
  pollIntervalSec: number
  refreshKey: number
  defaultIde: IdeId
  deleting?: boolean
  settingUp?: boolean
  repoName?: string
  onConfirmDelete?: (force: boolean) => void
  onDetach?: () => void
  onRenamed: () => void
}

const JIRA_KEY_REGEX = /([a-zA-Z][a-zA-Z0-9]+-\d+)/i

function extractJiraKey(branch: string): string | null {
  const match = branch.match(JIRA_KEY_REGEX)
  return match ? match[1].toUpperCase() : null
}

export function WorktreeCard({
  worktree,
  repoPath,
  pollIntervalSec,
  refreshKey,
  defaultIde,
  deleting,
  settingUp,
  repoName,
  onConfirmDelete,
  onDetach,
  onRenamed
}: WorktreeCardProps) {
  const [deleteOpened, setDeleteOpened] = useState(false)
  const [renameOpened, setRenameOpened] = useState(false)
  const [hovered, setHovered] = useState(false)
  const jiraKey = extractJiraKey(worktree.branch)
  const { issue: jiraIssue, loading: jiraLoading } = useJiraIssue(jiraKey, pollIntervalSec, refreshKey)
  const { pr, loading: prLoading } = usePR(repoPath, worktree.isMain ? null : worktree.branch, pollIntervalSec, refreshKey)
  const { status: wtStatus, loading: wtStatusLoading, refresh: refreshStatus } = useWorktreeStatus(worktree.path, pollIntervalSec, refreshKey)
  const { shortenPath } = useHomedir()

  const handleDoubleClick = () => {
    if (deleting) return
    rpc().request['launch:ide']({ ideId: defaultIde, worktreePath: worktree.path })
  }

  return (
    <Card
      shadow="sm"
      padding="sm"
      radius="md"
      withBorder
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderColor: deleting
          ? 'rgba(255, 255, 255, 0.08)'
          : hovered ? 'rgba(0, 136, 255, 0.45)' : 'rgba(0, 136, 255, 0.2)',
        background: deleting
          ? 'rgba(255, 255, 255, 0.02)'
          : hovered
            ? 'linear-gradient(135deg, rgba(0, 136, 255, 0.08) 0%, rgba(0, 136, 255, 0.02) 100%)'
            : 'linear-gradient(135deg, rgba(0, 136, 255, 0.03) 0%, transparent 100%)',
        opacity: deleting ? 0.45 : 1,
        transition: 'background 150ms ease, border-color 150ms ease, opacity 150ms ease',
        cursor: deleting ? 'default' : 'default',
        pointerEvents: deleting ? 'none' : undefined
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <IconGitBranch size={20} color={deleting ? '#666' : '#0088ff'} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={600} truncate style={{ fontFamily: 'monospace' }}>
                {worktree.branch}
              </Text>
              {worktree.isMain && (
                <Badge variant="light" color="neon" size="xs" style={{ flexShrink: 0 }}>
                  main
                </Badge>
              )}
              {repoName && (
                <Badge variant="light" color="gray" size="xs" style={{ flexShrink: 0 }}>
                  {repoName}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" truncate>
              {shortenPath(worktree.path)}
            </Text>
          </div>
        </Group>

        {deleting ? (
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            <Loader size={14} color="dimmed" />
            <Text size="xs" c="dimmed">Deleting…</Text>
          </Group>
        ) : (
          <>
            <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
              {settingUp && (
                <Badge variant="light" color="neon" size="xs" leftSection={<Loader size={8} color="neon" />}>
                  Setting up…
                </Badge>
              )}
              <JiraBadge jiraKey={jiraKey} issue={jiraIssue} loading={jiraLoading} />
              <PRBadge pr={pr} loading={prLoading} />
              <DirtyBadge status={wtStatus} loading={wtStatusLoading} worktreePath={worktree.path} onPullComplete={refreshStatus} />
            </Group>

            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              {!worktree.isMain && (
                <Tooltip label="Rename worktree">
                  <ActionIcon
                    variant="subtle"
                    color="neon"
                    size="sm"
                    onClick={() => setRenameOpened(true)}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              {onDetach && (
                <Tooltip label="Remove from workspace">
                  <ActionIcon
                    variant="subtle"
                    color="orange"
                    size="sm"
                    onClick={onDetach}
                  >
                    <IconUnlink size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              {!onDetach && !worktree.isMain && onConfirmDelete && (
                <Tooltip label="Delete worktree">
                  <ActionIcon
                    variant="subtle"
                    color="pink"
                    size="sm"
                    onClick={() => setDeleteOpened(true)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              <LaunchButtons worktreePath={worktree.path} defaultIde={defaultIde} />
            </Group>
          </>
        )}
      </Group>

      {onConfirmDelete && (
        <DeleteWorktreeModal
          worktree={worktree}
          opened={deleteOpened}
          onClose={() => setDeleteOpened(false)}
          onConfirm={onConfirmDelete}
        />
      )}
      <RenameWorktreeModal
        worktree={worktree}
        repoPath={repoPath}
        opened={renameOpened}
        onClose={() => setRenameOpened(false)}
        onRenamed={onRenamed}
      />
    </Card>
  )
}
