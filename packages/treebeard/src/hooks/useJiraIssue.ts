import { useState, useEffect, useCallback, useRef } from 'react'
import { rpc } from '../rpc'
import type { JiraIssue } from '../shared/types'

export function useJiraIssue(issueKey: string | null, pollIntervalSec: number, refreshKey?: number) {
  const [issue, setIssue] = useState<JiraIssue | null>(null)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
  }, [issueKey, refreshKey])

  useEffect(() => {
    fetch()

    if (intervalRef.current) clearInterval(intervalRef.current)
    if (pollIntervalSec > 0) {
      intervalRef.current = setInterval(fetch, pollIntervalSec * 1000)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetch, pollIntervalSec])

  return { issue, loading, refresh: fetch }
}
