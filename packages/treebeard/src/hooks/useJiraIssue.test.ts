import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useJiraIssue } from './useJiraIssue'

const jiraIssueRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'jira:issue': jiraIssueRequest
    }
  })
}))

describe('useJiraIssue', () => {
  beforeEach(() => {
    jiraIssueRequest.mockReset()
  })

  it('returns null without issue key', async () => {
    const { result } = renderHook(() => useJiraIssue(null))

    await waitFor(() => {
      expect(result.current.issue).toBeNull()
      expect(result.current.loading).toBe(false)
    })

    expect(jiraIssueRequest).not.toHaveBeenCalled()
  })

  it('loads issue and resets on failure', async () => {
    jiraIssueRequest.mockResolvedValueOnce({
      key: 'TB-1',
      summary: 'Test issue',
      status: 'Open',
      assignee: null,
      issueType: 'Task',
      url: 'https://acme.atlassian.net/browse/TB-1'
    })

    const { result, rerender } = renderHook(
      ({ key }) => useJiraIssue(key),
      { initialProps: { key: 'TB-1' as string | null } }
    )

    await waitFor(() => {
      expect(result.current.issue?.key).toBe('TB-1')
    })

    jiraIssueRequest.mockRejectedValueOnce(new Error('boom'))
    rerender({ key: 'TB-2' })

    await waitFor(() => {
      expect(result.current.issue).toBeNull()
    })
  })
})
