import { useState, useEffect, useCallback } from 'react'
import { rpc } from '../rpc'
import type { JiraIssue } from '../shared/types'

export function useJiraIssue(issueKey: string | null) {
  const [issue, setIssue] = useState<JiraIssue | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!issueKey) {
      setIssue(null)
      return
    }
    setLoading(true)
    try {
      const result = await rpc().request['jira:issue']({ issueKey })
      setIssue(result)
    } catch {
      setIssue(null)
    } finally {
      setLoading(false)
    }
  }, [issueKey])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { issue, loading, refresh: fetch }
}
