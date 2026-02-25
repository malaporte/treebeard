import { useState } from 'react'
import { Card, Text, Group, Badge, ActionIcon, Tooltip, Loader } from '@mantine/core'
import { IconGitBranch, IconTrash, IconServer } from '@tabler/icons-react'
import { JiraBadge } from './JiraBadge'
import { PRBadge } from './PRBadge'
import { DirtyBadge } from './DirtyBadge'
import { LaunchButtons } from './LaunchButtons'
import { DeleteWorktreeModal } from './DeleteWorktreeModal'
import { useJiraIssue } from '../hooks/useJiraIssue'
import { usePR } from '../hooks/usePR'
import { useWorktreeStatus } from '../hooks/useWorktreeStatus'
import { useHomedir } from '../hooks/useHomedir'
import { useOpencodeServer } from '../hooks/useOpencodeServer'
import { rpc } from '../rpc'
import type { Worktree } from '../shared/types'

interface WorktreeCardProps {
  worktree: Worktree
  repoPath: string
  onDelete: () => void
}

const JIRA_KEY_REGEX = /([a-zA-Z][a-zA-Z0-9]+-\d+)/i

function extractJiraKey(branch: string): string | null {
  const match = branch.match(JIRA_KEY_REGEX)
  return match ? match[1].toUpperCase() : null
}

const SERVER_COLOR_MAP: Record<string, string> = {
  off: 'dimmed',
  starting: 'yellow',
  running: 'teal',
  error: 'pink'
}

function serverVisualState(
  status: { enabled: boolean; running: boolean; url?: string | null; error: string | null } | null,
  toggling: boolean
): { state: string; label: string; color: string } {
  if (!status || (!status.enabled && !toggling)) {
    return { state: 'off', label: 'OpenCode server: off', color: SERVER_COLOR_MAP.off }
  }
  if (toggling) {
    return { state: 'starting', label: 'OpenCode server: starting...', color: SERVER_COLOR_MAP.starting }
  }
  if (status.error) {
    return { state: 'error', label: `OpenCode server: ${status.error}`, color: SERVER_COLOR_MAP.error }
  }
  if (status.running) {
    return { state: 'running', label: `OpenCode server: ${status.url ?? 'running'}`, color: SERVER_COLOR_MAP.running }
  }
  return { state: 'off', label: 'OpenCode server: off', color: SERVER_COLOR_MAP.off }
}

export function WorktreeCard({ worktree, repoPath, onDelete }: WorktreeCardProps) {
  const [deleteOpened, setDeleteOpened] = useState(false)
  const [hovered, setHovered] = useState(false)
  const jiraKey = extractJiraKey(worktree.branch)
  const { issue: jiraIssue, loading: jiraLoading } = useJiraIssue(jiraKey)
  const { pr, loading: prLoading } = usePR(repoPath, worktree.isMain ? null : worktree.branch)
  const { status: wtStatus, loading: wtStatusLoading } = useWorktreeStatus(worktree.path)
  const { shortenPath } = useHomedir()
  const { status: serverStatus, toggling: serverToggling, toggle: toggleServer } = useOpencodeServer(worktree.path)
  const serverVis = serverVisualState(serverStatus, serverToggling)

  const handleDoubleClick = () => {
    rpc().request['launch:vscode']({ worktreePath: worktree.path })
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
        borderColor: hovered ? 'rgba(0, 136, 255, 0.45)' : 'rgba(0, 136, 255, 0.2)',
        background: hovered
          ? 'linear-gradient(135deg, rgba(0, 136, 255, 0.08) 0%, rgba(0, 136, 255, 0.02) 100%)'
          : 'linear-gradient(135deg, rgba(0, 136, 255, 0.03) 0%, transparent 100%)',
        transition: 'background 150ms ease, border-color 150ms ease',
        cursor: 'default'
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <IconGitBranch size={20} color="#0088ff" style={{ flexShrink: 0 }} />
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
            </Group>
            <Text size="xs" c="dimmed" truncate>
              {shortenPath(worktree.path)}
            </Text>
          </div>
        </Group>

        <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
          <JiraBadge jiraKey={jiraKey} issue={jiraIssue} loading={jiraLoading} />
          <PRBadge pr={pr} loading={prLoading} />
          <DirtyBadge status={wtStatus} loading={wtStatusLoading} />
        </Group>

        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          <LaunchButtons worktreePath={worktree.path} />
          <Tooltip label={serverVis.label}>
            <ActionIcon
              variant="subtle"
              color={serverVis.color}
              size="sm"
              onClick={toggleServer}
              disabled={serverToggling}
            >
              {serverToggling ? <Loader size={14} /> : <IconServer size={16} />}
            </ActionIcon>
          </Tooltip>
          {!worktree.isMain && (
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
        </Group>
      </Group>

      <DeleteWorktreeModal
        worktree={worktree}
        repoPath={repoPath}
        opened={deleteOpened}
        onClose={() => setDeleteOpened(false)}
        onSuccess={onDelete}
      />
    </Card>
  )
}
