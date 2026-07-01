import { useState, useEffect } from 'react'
import { Modal, Button, Stack, Text, TextInput, Alert, Group } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { rpc } from '../rpc'
import type { Worktree } from '../shared/types'

interface RenameWorktreeModalProps {
  worktree: Worktree
  repoPath: string
  opened: boolean
  onClose: () => void
  onRenamed: () => void
}

function currentName(worktree: Worktree): string {
  return worktree.path.split('/').pop() ?? ''
}

export function RenameWorktreeModal({ worktree, repoPath, opened, onClose, onRenamed }: RenameWorktreeModalProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (opened) {
      setName(currentName(worktree))
      setError(null)
    }
  }, [opened, worktree])

  const trimmed = name.trim()
  const isValid = trimmed.length > 0 && !trimmed.includes('/') && trimmed !== currentName(worktree)

  const handleSubmit = async () => {
    if (!isValid) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await rpc().request['git:renameWorktree']({
        repoPath,
        worktreePath: worktree.path,
        newName: trimmed
      })
      if (result.success) {
        onRenamed()
        onClose()
      } else {
        setError(result.error ?? 'Rename failed')
      }
    } catch {
      setError('Rename failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Rename worktree"
      size="md"
    >
      <Stack gap="md">
        <Text size="sm">
          Rename the worktree directory for <Text span fw={600} ff="monospace">{worktree.branch}</Text>
        </Text>

        <TextInput
          label="New name"
          placeholder="worktree-name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          autoFocus
          error={trimmed.includes('/') ? 'Name cannot contain slashes' : undefined}
        />

        {error && (
          <Alert color="pink" variant="light" icon={<IconAlertTriangle size={16} />}>
            {error}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="neon"
            onClick={handleSubmit}
            disabled={!isValid}
            loading={submitting}
          >
            Rename
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
