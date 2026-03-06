import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea
} from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { rpc } from '../rpc'
import type {
  CodexConversationItem,
  CodexConversationSnapshot,
  CodexConversationUpdate,
  CodexPendingAction,
  CodexSessionStatus
} from '../shared/types'

interface CodexSessionModalProps {
  opened: boolean
  onClose: () => void
  worktreePath: string
  branch: string
}

const SESSION_RECOVERY_POLL_INTERVAL_MS = 15000

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

export function CodexSessionModal({ opened, onClose, worktreePath, branch }: CodexSessionModalProps) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<CodexSessionStatus | null>(null)
  const [snapshot, setSnapshot] = useState<CodexConversationSnapshot | null>(null)
  const [pendingActions, setPendingActions] = useState<CodexPendingAction[]>([])
  const hasResumedRef = useRef(false)
  const viewportRef = useRef<HTMLDivElement>(null)

  const conversationItems = useMemo(() => {
    if (!snapshot) return []
    return snapshot.turns.flatMap((turn) => turn.items)
  }, [snapshot])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth'
    })
  }, [
    conversationItems.length,
    conversationItems[conversationItems.length - 1]?.updatedAt,
    pendingActions.length
  ])

  useEffect(() => {
    if (!opened) return

    let cancelled = false

    const syncSession = async (resume: boolean) => {
      const [conversationResult, actionsResult] = await Promise.all([
        resume
          ? rpc().request['codex:resumeConversation']({ worktreePath })
          : rpc().request['codex:getConversation']({ worktreePath }),
        rpc().request['codex:getPendingActions']({ worktreePath })
      ])

      if (cancelled) return

      if (conversationResult.success) {
        setStatus(conversationResult.status || null)
        setSnapshot(conversationResult.snapshot || null)
      } else if (conversationResult.error !== 'Session not found') {
        setError(conversationResult.error || 'Failed to fetch conversation')
      } else {
        setStatus(null)
        setSnapshot(null)
      }

      if (actionsResult.success) {
        setPendingActions(actionsResult.actions)
      }
    }

    setError(null)
    setSnapshot(null)
    setPendingActions([])
    setStatus(null)
    hasResumedRef.current = false

    const handleConversationUpdate = (event: Event) => {
      const detail = (event as CustomEvent<CodexConversationUpdate>).detail
      if (!detail || detail.worktreePath !== worktreePath) return
      setStatus(detail.status)
      setSnapshot(detail.snapshot)
      setPendingActions(detail.pendingActions)
    }

    window.addEventListener('treebeard:codex-conversation-update', handleConversationUpdate as EventListener)
    void syncSession(true).then(() => {
      hasResumedRef.current = true
    })
    const interval = setInterval(() => {
      void syncSession(hasResumedRef.current)
    }, SESSION_RECOVERY_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.removeEventListener('treebeard:codex-conversation-update', handleConversationUpdate as EventListener)
      clearInterval(interval)
    }
  }, [opened, worktreePath])

  useEffect(() => {
    if (!opened) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!status?.running || loading) return

      event.preventDefault()
      void handleInterrupt()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [opened, status?.running, loading])

  const handleStartOrSteer = async () => {
    const nextPrompt = prompt.trim()
    if (nextPrompt.length === 0) return

    setLoading(true)
    setError(null)

    try {
      if (status?.running) {
        const response = await rpc().request['codex:steerSession']({ worktreePath, prompt: nextPrompt })
        if (!response.success) {
          setError(response.error || 'Failed to send prompt')
          return
        }
      } else {
        const response = await rpc().request['codex:startSession']({ worktreePath, prompt: nextPrompt })
        if (!response.success) {
          setError(response.error || 'Failed to start session')
          return
        }
      }

      setPrompt('')
      const [conversationResult, actionsResult] = await Promise.all([
        rpc().request['codex:getConversation']({ worktreePath }),
        rpc().request['codex:getPendingActions']({ worktreePath })
      ])

      if (conversationResult.success) {
        setStatus(conversationResult.status || null)
        setSnapshot(conversationResult.snapshot || null)
      }
      if (actionsResult.success) {
        setPendingActions(actionsResult.actions)
      }
    } catch {
      setError('Failed to send prompt')
    } finally {
      setLoading(false)
    }
  }

  const handleInterrupt = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await rpc().request['codex:interruptSession']({ worktreePath })
      if (!response.success) {
        setError(response.error || 'Failed to interrupt session')
        return
      }
      setStatus(response.status || null)
    } catch {
      setError('Failed to interrupt session')
    } finally {
      setLoading(false)
    }
  }

  const handleResolveAction = async (actionId: string, response: string) => {
    setLoading(true)
    setError(null)

    try {
      const result = await rpc().request['codex:respondPendingAction']({
        worktreePath,
        actionId,
        response
      })
      if (!result.success) {
        setError(result.error || 'Failed to respond to action')
        return
      }

      const [conversationResult, actionsResult] = await Promise.all([
        rpc().request['codex:getConversation']({ worktreePath }),
        rpc().request['codex:getPendingActions']({ worktreePath })
      ])

      if (conversationResult.success) {
        setStatus(conversationResult.status || null)
        setSnapshot(conversationResult.snapshot || null)
      }
      if (actionsResult.success) {
        setPendingActions(actionsResult.actions)
      }
    } catch {
      setError('Failed to respond to action')
    } finally {
      setLoading(false)
    }
  }

  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return
    if (event.metaKey) return

    event.preventDefault()
    if (!loading && prompt.trim().length > 0) {
      void handleStartOrSteer()
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title={`Codex Session: ${branch}`}>
      <Stack gap="sm">
        {error && (
          <Alert color="pink" variant="light" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        )}

        {pendingActions.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" fw={600}>Pending actions</Text>
            {pendingActions.map((action) => {
              const options = action.options.length > 0
                ? action.options
                : ['approve', 'deny']

              return (
                <Paper key={action.id} withBorder p="sm" radius="md">
                  <Stack gap="xs">
                    <Text size="sm">{action.prompt}</Text>
                    <Group gap="xs">
                      {options.map((option) => (
                        <Button
                          key={`${action.id}-${option}`}
                          size="xs"
                          variant={option.toLowerCase().includes('deny') ? 'light' : 'filled'}
                          color={option.toLowerCase().includes('deny') ? 'gray' : 'blue'}
                          onClick={() => { void handleResolveAction(action.id, option) }}
                          disabled={loading}
                        >
                          {option}
                        </Button>
                      ))}
                    </Group>
                  </Stack>
                </Paper>
              )
            })}
          </Stack>
        )}

        <ScrollArea h={260} offsetScrollbars viewportRef={viewportRef}>
          <Stack gap="xs" p={2}>
            {conversationItems.length === 0 && (
              <Text size="sm" c="dimmed">No messages yet. Start with a prompt.</Text>
            )}
            {conversationItems.map((item) => renderConversationItem(item))}
            {status?.running && (
              <Group key="running-indicator" gap="xs" align="center">
                <Loader size="xs" color="blue" />
                <Text size="sm" c="dimmed">Codex is working…</Text>
              </Group>
            )}
          </Stack>
        </ScrollArea>

        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            onKeyDown={handlePromptKeyDown}
            autosize
            minRows={2}
            maxRows={5}
            placeholder="Ask Codex..."
            style={{ flex: 1 }}
          />
          <Button
            onClick={() => { void handleStartOrSteer() }}
            loading={loading}
            disabled={prompt.trim().length === 0}
          >
            {status?.running ? 'Send' : 'Start'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function renderConversationItem(item: CodexConversationItem) {
  if (item.type === 'user_message' || item.type === 'assistant_message') {
    const isUser = item.type === 'user_message'
    return (
      <Box
        key={item.id}
        style={{
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          maxWidth: '85%'
        }}
      >
        <Paper
          withBorder
          p="sm"
          radius="md"
          style={{
            backgroundColor: isUser ? 'rgba(0, 136, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)',
            borderColor: isUser ? 'rgba(0, 136, 255, 0.4)' : 'rgba(255, 255, 255, 0.12)',
            opacity: item.status === 'streaming' ? 0.9 : 1
          }}
        >
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{item.text || ' '}</Text>
          <Text size="xs" c="dimmed" mt={4}>{formatTime(item.updatedAt)}</Text>
        </Paper>
      </Box>
    )
  }

  const card = summarizeConversationItem(item)
  if (!card) return null

  return (
    <Paper
      key={item.id}
      withBorder
      p="sm"
      radius="md"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderColor: 'rgba(255, 255, 255, 0.08)'
      }}
    >
      <Stack gap={4}>
        <Group justify="space-between" gap="xs">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.title}</Text>
          <Text size="xs" c="dimmed">{formatTime(item.updatedAt)}</Text>
        </Group>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{card.body}</Text>
      </Stack>
    </Paper>
  )
}

function summarizeConversationItem(item: CodexConversationItem): { title: string; body: string } | null {
  if (item.type === 'reasoning') {
    const text = item.summary.join('\n').trim() || item.content.join('\n').trim()
    return text.length > 0 ? { title: 'Reasoning', body: text } : null
  }
  if (item.type === 'plan') {
    return item.text.trim().length > 0 ? { title: 'Plan', body: item.text } : null
  }
  if (item.type === 'command_execution') {
    const details = [
      item.command.trim(),
      item.executionStatus,
      item.exitCode !== null ? `exit ${item.exitCode}` : null
    ].filter((value): value is string => value !== null && value.length > 0)
    return {
      title: 'Command',
      body: details.join(' • ')
    }
  }
  if (item.type === 'file_change') {
    return {
      title: 'File change',
      body: `${item.changeCount} file change${item.changeCount === 1 ? '' : 's'} • ${item.patchStatus}`
    }
  }
  if (item.type === 'mcp_tool_call') {
    const details = [
      `${item.server}:${item.tool}`,
      item.toolStatus,
      item.errorSummary,
      item.resultSummary
    ].filter((value): value is string => value !== null && value.length > 0)
    return {
      title: 'MCP tool',
      body: details.join(' • ')
    }
  }
  if (item.type === 'status') {
    return {
      title: item.title,
      body: item.text
    }
  }
  return null
}
