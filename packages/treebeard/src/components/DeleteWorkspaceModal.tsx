import { useEffect, useState } from 'react'
import { Alert, Button, Code, Group, Modal, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { rpc } from '../rpc'
import type { Workspace } from '../shared/types'

interface DeleteWorkspaceModalProps {
  workspace: Workspace | null
  opened: boolean
  onClose: () => void
  onDeleted: () => void
}

export function DeleteWorkspaceModal({ workspace, opened, onClose, onDeleted }: DeleteWorkspaceModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!opened || !workspace) return
    setDeleting(false)
    setError(null)
  }, [opened, workspace])

  const handleDelete = async () => {
    if (!workspace) return
    setDeleting(true)
    setError(null)
    try {
      const result = await rpc().request['workspace:remove']({ workspaceId: workspace.id })
      onDeleted()
      if (result.success) {
        onClose()
        return
      }
      setError(result.error ?? 'Could not remove workspace links.')
    } catch {
      setError('Could not remove workspace links.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Delete workspace" size="lg">
      <Stack gap="md">
        <Text>
          Delete <Code>{workspace?.name}</Code> and remove its {workspace?.members.length ?? 0} workspace link{workspace?.members.length === 1 ? '' : 's'}?
        </Text>
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          This only removes workspace symlinks. Your Git worktrees remain unchanged.
        </Alert>
        {error && <Alert color="pink" variant="light" icon={<IconAlertTriangle size={16} />} style={{ whiteSpace: 'pre-line' }}>{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button color="pink" onClick={handleDelete} loading={deleting}>
            Delete workspace
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
