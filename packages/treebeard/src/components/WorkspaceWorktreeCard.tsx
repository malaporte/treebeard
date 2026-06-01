import { useState } from 'react'
import { Card, Text, Group, Badge, ActionIcon, Tooltip, Stack, Collapse, Button } from '@mantine/core'
import { IconGitBranch, IconTrash, IconChevronDown, IconChevronRight, IconAlertTriangle, IconTool } from '@tabler/icons-react'
import { DirtyBadge } from './DirtyBadge'
import { JiraBadge } from './JiraBadge'
import { LaunchButtons } from './LaunchButtons'
import { useWorkspaceWorktreeStatus } from '../hooks/useWorkspaceWorktreeStatus'
import { useJiraIssue } from '../hooks/useJiraIssue'
import { rpc } from '../rpc'
import type { IdeId, Workspace, WorkspaceWorktree } from '../shared/types'

const JIRA_KEY_REGEX = /([a-zA-Z][a-zA-Z0-9]+-\d+)/i

function extractJiraKey(branch: string): string | null {
  const match = branch.match(JIRA_KEY_REGEX)
  return match ? match[1].toUpperCase() : null
}

interface MemberRowProps {
  member: WorkspaceWorktree['members'][number]
  memberStatus: { hasUncommittedChanges: boolean; unpushedCommits: number; unpulledCommits: number; linesAdded: number; linesDeleted: number } | null
  jiraKey: string | null
  pollIntervalSec: number
  refreshKey: number
  defaultIde: IdeId
}

function MemberRow({ member, memberStatus, jiraKey, pollIntervalSec, refreshKey, defaultIde }: MemberRowProps) {
  const { issue: jiraIssue, loading: jiraLoading } = useJiraIssue(jiraKey, pollIntervalSec, refreshKey)

  return (
    <Group justify="space-between" align="center" wrap="nowrap" style={{ paddingLeft: 24 }}>
      <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', minWidth: 0, flex: 1 }} truncate>
        {member.repoName}
      </Text>
      <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
        <DirtyBadge status={memberStatus} loading={false} />
        <JiraBadge jiraKey={jiraKey} issue={jiraIssue} loading={jiraLoading} />
        {member.path !== null && (
          <LaunchButtons worktreePath={member.path} defaultIde={defaultIde} />
        )}
      </Group>
    </Group>
  )
}

interface WorkspaceWorktreeCardProps {
  workspaceWorktree: WorkspaceWorktree
  workspace: Workspace
  pollIntervalSec: number
  refreshKey: number
  defaultIde: IdeId
  onDelete: (force: boolean) => void
  onRepair: () => void
}

export function WorkspaceWorktreeCard({
  workspaceWorktree,
  workspace,
  pollIntervalSec,
  refreshKey,
  defaultIde,
  onDelete,
  onRepair
}: WorkspaceWorktreeCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hovered, setHovered] = useState(false)

  const { status, loading: statusLoading } = useWorkspaceWorktreeStatus(
    workspace.id,
    workspaceWorktree.branch,
    pollIntervalSec,
    refreshKey
  )

  const jiraKey = extractJiraKey(workspaceWorktree.branch)

  const hasUncommittedChanges = status?.perRepo.some((r) => r.status?.hasUncommittedChanges) ?? false

  const handleDoubleClick = () => {
    rpc().request['launch:workspaceIde']({ ideId: defaultIde, workspacePath: workspaceWorktree.rootPath })
  }

  const handleDeleteConfirm = () => {
    onDelete(hasUncommittedChanges)
    setConfirmDelete(false)
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
        borderColor: hovered ? 'rgba(0, 255, 136, 0.45)' : 'rgba(0, 255, 136, 0.2)',
        background: hovered
          ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.08) 0%, rgba(0, 255, 136, 0.02) 100%)'
          : 'linear-gradient(135deg, rgba(0, 255, 136, 0.03) 0%, transparent 100%)',
        transition: 'background 150ms ease, border-color 150ms ease',
      }}
    >
      <Stack gap="xs">
        {/* Top row */}
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <ActionIcon
              variant="subtle"
              color="dimmed"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </ActionIcon>
            <IconGitBranch size={18} color="var(--mantine-color-teal-5)" style={{ flexShrink: 0 }} />
            <Text size="sm" fw={600} truncate style={{ fontFamily: 'monospace', minWidth: 0 }}>
              {workspaceWorktree.branch}
            </Text>
            {!workspaceWorktree.isComplete && (
              <Badge variant="light" color="yellow" size="xs" leftSection={<IconAlertTriangle size={10} />} style={{ flexShrink: 0 }}>
                Incomplete
              </Badge>
            )}
          </Group>

          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            <DirtyBadge status={status?.rollup ?? null} loading={statusLoading} />
            <LaunchButtons worktreePath={workspaceWorktree.rootPath} defaultIde={defaultIde} />
            {!confirmDelete ? (
              <Tooltip label="Delete workspace worktree">
                <ActionIcon
                  variant="subtle"
                  color="pink"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <Group gap={4} wrap="nowrap">
                {hasUncommittedChanges && (
                  <Tooltip label="Has uncommitted changes">
                    <IconAlertTriangle size={14} color="var(--mantine-color-yellow-5)" />
                  </Tooltip>
                )}
                <Text size="xs" c="dimmed">Confirm?</Text>
                <Button size="compact-xs" color="pink" onClick={handleDeleteConfirm}>Yes</Button>
                <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setConfirmDelete(false)}>No</Button>
              </Group>
            )}
          </Group>
        </Group>

        {/* Incomplete state actions */}
        {!workspaceWorktree.isComplete && (
          <Group gap="xs" style={{ paddingLeft: 24 }}>
            <Button
              size="compact-xs"
              variant="light"
              color="teal"
              leftSection={<IconTool size={12} />}
              onClick={onRepair}
            >
              Repair
            </Button>
            <Button
              size="compact-xs"
              variant="light"
              color="pink"
              onClick={() => onDelete(false)}
            >
              Remove partial
            </Button>
          </Group>
        )}

        {/* Expandable per-repo section */}
        <Collapse in={expanded}>
          <Stack gap={4} mt={4}>
            {workspaceWorktree.members.map((member) => {
              const memberStatus = status?.perRepo.find((r) => r.repoId === member.repoId)?.status ?? null
              return (
                <MemberRow
                  key={member.repoId}
                  member={member}
                  memberStatus={memberStatus}
                  jiraKey={jiraKey}
                  pollIntervalSec={pollIntervalSec}
                  refreshKey={refreshKey}
                  defaultIde={defaultIde}
                />
              )
            })}
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  )
}
