import { useState, useEffect } from 'react'
import { Modal, Button, Stack, Text, Alert, Code, Group, Loader } from '@mantine/core'
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react'
import { useHomedir } from '../hooks/useHomedir'
import { rpc } from '../rpc'
import type { Worktree, WorktreeStatus } from '../shared/types'

interface DeleteWorktreeModalProps {
  worktree: Worktree
  opened: boolean
  onClose: () => void
  onConfirm: (force: boolean) => void
}

export function DeleteWorktreeModal({ worktree, opened, onClose, onConfirm }: DeleteWorktreeModalProps) {
  const [status, setStatus] = useState<WorktreeStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const { shortenPath } = useHomedir()

  useEffect(() => {
    if (opened) {
      setStatus(null)
      setLoadingStatus(true)
      rpc().request['git:worktreeStatus']({ worktreePath: worktree.path })
        .then(setStatus)
        .catch(() => setStatus(null))
        .finally(() => setLoadingStatus(false))
    }
  }, [opened, worktree.path])

  const hasWarnings = status?.hasUncommittedChanges || (status?.unpushedCommits ?? 0) > 0

  const handleDelete = () => {
    onConfirm(!!hasWarnings)
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Delete worktree"
      size="md"
    >
      <Stack gap="md">
        <Text size="sm">
          Remove the worktree for <Code>{worktree.branch}</Code>?
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {shortenPath(worktree.path)}
        </Text>

        {loadingStatus && (
          <Group justify="center" p="xs">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">Checking worktree status...</Text>
          </Group>
        )}

        {!loadingStatus && status && (
          <>
            {status.hasUncommittedChanges && (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
                This worktree has uncommitted changes that will be lost.
              </Alert>
            )}

            {status.unpushedCommits > 0 && (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
                {status.unpushedCommits} unpushed commit{status.unpushedCommits === 1 ? '' : 's'} not yet on remote.
              </Alert>
            )}

            {!hasWarnings && (
              <Alert color="teal" variant="light" icon={<IconCircleCheck size={16} />}>
                No pending changes. Safe to remove.
              </Alert>
            )}
          </>
        )}

        {!loadingStatus && !status && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
            Could not determine worktree status. Proceed with caution.
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="pink"
            onClick={handleDelete}
            disabled={loadingStatus}
          >
            Delete worktree
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
