import { useEffect, useState } from 'react'
import { Alert, Button, Code, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { rpc } from '../rpc'
import type { Workspace } from '../shared/types'

interface CreateWorkspaceModalProps {
  opened: boolean
  onClose: () => void
  onCreated: (workspace: Workspace) => void
}

function workspaceSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function CreateWorkspaceModal({ opened, onClose, onCreated }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) return
    setName('')
    setSubmitting(false)
    setError(null)
  }, [opened])

  const slug = workspaceSlug(name)
  const canSubmit = Boolean(slug) && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await rpc().request['workspace:create']({ name })
      if (!result.success || !result.workspace) {
        setError(result.error ?? 'Failed to create workspace.')
        return
      }
      onCreated(result.workspace)
      onClose()
    } catch {
      setError('Failed to create workspace.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Create workspace" size="md">
      <Stack gap="md">
        <TextInput
          label="Workspace name"
          placeholder="Authentication refresh"
          value={name}
          onChange={(event) => { setName(event.currentTarget.value); setError(null) }}
          onKeyDown={(event) => { if (event.key === 'Enter') void handleSubmit() }}
          autoFocus
        />
        {slug && (
          <Text size="xs" c="dimmed">
            Folder: <Code>~/Developer/workspaces/{slug}</Code>
          </Text>
        )}
        {error && <Alert color="pink" variant="light" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>Create workspace</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
