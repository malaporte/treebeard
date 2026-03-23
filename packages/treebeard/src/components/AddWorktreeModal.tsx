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
  Loader
} from '@mantine/core'
import { IconAlertCircle, IconInfoCircle, IconCheck, IconX } from '@tabler/icons-react'
import { rpc } from '../rpc'
import type { RepoConfig, SetupCommandResult } from '../shared/types'

interface AddWorktreeModalProps {
  repo: RepoConfig
  opened: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AddWorktreeModal({ repo, opened, onClose, onSuccess }: AddWorktreeModalProps) {
  const [branch, setBranch] = useState('')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null)
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [branchExists, setBranchExists] = useState(false)
  const [setupResults, setSetupResults] = useState<SetupCommandResult[] | null>(null)
  const [setupFailed, setSetupFailed] = useState(false)

  useEffect(() => {
    if (opened) {
      setBranch('')
      setError(null)
      setSubmitting(false)
      setBranchExists(false)
      setRemoteBranches([])
      setSetupResults(null)
      setSetupFailed(false)
      rpc().request['git:defaultBranch']({ repoPath: repo.path }).then(setDefaultBranch).catch(() => {
        setDefaultBranch('main')
      })
    }
  }, [opened, repo.path])

  // Fetch remote branches when switching to "existing" mode
  useEffect(() => {
    if (opened && mode === 'existing') {
      setLoadingBranches(true)
      setBranch('')
      rpc().request['git:remoteBranches']({ repoPath: repo.path })
        .then(setRemoteBranches)
        .catch(() => setRemoteBranches([]))
        .finally(() => setLoadingBranches(false))
    }
  }, [opened, mode, repo.path])

  const slug = repo.name.toLowerCase().replace(/\s+/g, '-')
  const pathPreview = branch
    ? `~/Developer/worktrees/${slug}/${branch}`
    : null

  const hasSetupCommands = (repo.setupCommands?.length ?? 0) > 0
  const canSubmit = branch.trim().length > 0 && !submitting && !setupResults

  const handleClose = () => {
    setSetupResults(null)
    setSetupFailed(false)
    onClose()
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    // If branchExists is set, the user confirmed — use existing branch (isNewBranch: false)
    const isNewBranch = mode === 'new' && !branchExists

    const result = await rpc().request['git:addWorktree']({
      repoPath: repo.path,
      repoName: repo.name,
      branch: branch.trim(),
      isNewBranch
    })

    setSubmitting(false)

    if (result.success) {
      onSuccess()

      // If setup commands ran, show results before closing
      if (result.setupResults?.length) {
        setSetupResults(result.setupResults)
        setSetupFailed(result.setupFailed ?? false)
        if (!result.setupFailed) {
          // Auto-close after a brief delay on full success
          setTimeout(handleClose, 1500)
        }
      } else {
        handleClose()
      }
    } else if (mode === 'new' && !branchExists && result.error?.includes("already exists")) {
      // Branch exists locally — prompt the user to reuse it instead
      setBranchExists(true)
    } else {
      setError(result.error || 'Failed to create worktree')
    }
  }

  // Setup results view — shown after worktree creation when setup commands ran
  if (setupResults) {
    return (
      <Modal
        opened={opened}
        onClose={handleClose}
        title={`Add worktree to ${repo.name}`}
        size="md"
      >
        <Stack gap="md">
          {setupFailed ? (
            <Alert color="orange" variant="light" icon={<IconAlertCircle size={16} />}>
              Worktree created, but setup commands failed.
            </Alert>
          ) : (
            <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
              Worktree created and setup completed.
            </Alert>
          )}

          <Stack gap="xs">
            {setupResults.map((result, idx) => (
              <div key={idx}>
                <Group gap="xs" wrap="nowrap">
                  {result.success
                    ? <IconCheck size={14} color="var(--mantine-color-green-6)" />
                    : <IconX size={14} color="var(--mantine-color-pink-6)" />}
                  <Code style={{ flex: 1 }}>{result.command}</Code>
                </Group>
                {result.output && (
                  <Code block style={{ fontSize: 11, maxHeight: 120, overflow: 'auto', marginTop: 4 }}>
                    {result.output}
                  </Code>
                )}
              </div>
            ))}
          </Stack>

          <Group justify="flex-end">
            <Button onClick={handleClose}>
              {setupFailed ? 'Dismiss' : 'Done'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    )
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={`Add worktree to ${repo.name}`}
      size="md"
    >
      <Stack gap="md">
        <SegmentedControl
          value={mode}
          onChange={(v) => {
            setMode(v as 'new' | 'existing')
            setBranch('')
            setError(null)
            setBranchExists(false)
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
              setBranchExists(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            autoCapitalize="off"
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
            }}
            nothingFoundMessage={loadingBranches ? 'Loading...' : 'No matching branches'}
            disabled={loadingBranches}
            rightSection={loadingBranches ? <Loader size={14} /> : undefined}
            autoFocus
          />
        )}

        {mode === 'new' && defaultBranch && !branchExists && (
          <Text size="xs" c="dimmed">
            Will branch off <Code>{defaultBranch}</Code>
          </Text>
        )}

        {pathPreview && (
          <Text size="xs" c="dimmed">
            Path: <Code>{pathPreview}</Code>
          </Text>
        )}

        {branchExists && (
          <Alert color="neon" variant="light" icon={<IconInfoCircle size={16} />}>
            A local branch <Code>{branch.trim()}</Code> already exists. Confirm to check it out into a new worktree instead.
          </Alert>
        )}

        {error && (
          <Alert color="pink" variant="light" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
            {submitting && hasSetupCommands
              ? 'Running setup...'
              : branchExists
                ? 'Use existing branch'
                : 'Create worktree'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
