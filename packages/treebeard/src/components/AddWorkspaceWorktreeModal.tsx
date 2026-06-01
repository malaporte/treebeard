import { useState, useEffect } from 'react'
import {
  Modal,
  TextInput,
  Select,
  SegmentedControl,
  Button,
  Stack,
  Text,
  Alert,
  Code,
  Group,
  Loader,
  List
} from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { rpc } from '../rpc'
import type { RepoConfig, Workspace } from '../shared/types'

interface AddWorkspaceWorktreeModalProps {
  workspace: Workspace
  repos: RepoConfig[]
  opened: boolean
  onClose: () => void
  onCreated: (workspacePath: string) => void
  initialBranch?: string
}

export function AddWorkspaceWorktreeModal({
  workspace,
  repos,
  opened,
  onClose,
  onCreated,
  initialBranch
}: AddWorkspaceWorktreeModalProps) {
  const [branch, setBranch] = useState('')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [perRepoErrors, setPerRepoErrors] = useState<{ repoId: string; error: string }[]>([])

  // Member repos resolved from workspace.repoIds
  const memberRepos = workspace.repoIds
    .map((id) => repos.find((r) => r.id === id))
    .filter((r): r is RepoConfig => r !== undefined)

  useEffect(() => {
    if (opened) {
      setBranch(initialBranch ?? '')
      setMode('new')
      setError(null)
      setPerRepoErrors([])
      setSubmitting(false)
      setRemoteBranches([])
    }
  }, [opened, initialBranch])

  // Fetch remote branches (intersection across all members) when switching to "existing" mode
  useEffect(() => {
    if (opened && mode === 'existing') {
      setLoadingBranches(true)
      setBranch('')
      rpc().request['workspace:remoteBranches']({ workspaceId: workspace.id })
        .then((branches: string[]) => setRemoteBranches(branches))
        .catch(() => setRemoteBranches([]))
        .finally(() => setLoadingBranches(false))
    }
  }, [opened, mode, workspace.id])

  const pathPreview = branch
    ? `~/Developer/worktrees/${workspace.slug}/${branch}/`
    : null

  const canSubmit = branch.trim().length > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    setPerRepoErrors([])

    const isNewBranch = mode === 'new'

    const result = await rpc().request['workspace:addWorktree']({
      workspaceId: workspace.id,
      branch: branch.trim(),
      isNewBranch
    })

    setSubmitting(false)

    if (result.success) {
      onCreated(result.workspacePath!)
      onClose()
    } else {
      const failed = (result.perRepo as { repoId: string; success: boolean; error?: string }[])
        .filter((r) => !r.success && r.error)
        .map((r) => ({ repoId: r.repoId, error: r.error! }))

      if (failed.length > 0) {
        setPerRepoErrors(failed)
      } else {
        setError('Failed to create workspace worktree')
      }
    }
  }

  // Resolve a repo name from its id for error display
  const repoNameById = (repoId: string) => {
    const repo = repos.find((r) => r.id === repoId)
    return repo?.name ?? repoId
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Add worktree to ${workspace.name}`}
      size="md"
    >
      <Stack gap="md">
        <SegmentedControl
          value={mode}
          onChange={(v) => {
            setMode(v as 'new' | 'existing')
            setBranch('')
            setError(null)
            setPerRepoErrors([])
          }}
          data={[
            { label: 'New branch', value: 'new' },
            { label: 'Existing branch', value: 'existing' }
          ]}
          fullWidth
        />

        {mode === 'new' ? (
          <TextInput
            label="Branch name"
            placeholder="feat/my-feature"
            value={branch}
            onChange={(e) => {
              setBranch(e.currentTarget.value)
              setError(null)
              setPerRepoErrors([])
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        ) : (
          <Select
            label="Branch"
            placeholder={loadingBranches ? 'Fetching branches...' : 'Search branches...'}
            searchable
            data={remoteBranches}
            value={branch || null}
            onChange={(v) => {
              setBranch(v || '')
              setError(null)
              setPerRepoErrors([])
            }}
            nothingFoundMessage={loadingBranches ? 'Loading...' : 'No matching branches'}
            disabled={loadingBranches}
            rightSection={loadingBranches ? <Loader size={14} /> : undefined}
            autoFocus
          />
        )}

        {pathPreview && (
          <Stack gap={4}>
            <Text size="xs" c="dimmed">Filesystem layout:</Text>
            <Code block style={{ fontSize: 12 }}>
              {pathPreview}{'\n'}
              {memberRepos.map((repo, i) => {
                const isLast = i === memberRepos.length - 1
                return `  ${isLast ? '└─' : '├─'} ${repo.name}/\n`
              }).join('')}
            </Code>
          </Stack>
        )}

        {perRepoErrors.length > 0 && (
          <Alert color="pink" variant="light" icon={<IconAlertCircle size={16} />}>
            <Text size="sm" fw={500} mb={4}>Failed to create worktree on some repos:</Text>
            <List size="sm" spacing={2}>
              {perRepoErrors.map((e) => (
                <List.Item key={e.repoId}>
                  <Text size="sm" span fw={500}>{repoNameById(e.repoId)}:</Text>{' '}
                  <Text size="sm" span>{e.error}</Text>
                </List.Item>
              ))}
            </List>
          </Alert>
        )}

        {error && (
          <Alert color="pink" variant="light" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
            Create worktree
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
