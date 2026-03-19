import { useState, useEffect, useCallback, useRef } from 'react'
import { rpc } from '../rpc'
import type { PRInfo } from '../shared/types'

export function usePR(repoPath: string | null, branch: string | null, pollIntervalSec: number, refreshKey?: number) {
  const [pr, setPR] = useState<PRInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    if (!repoPath || !branch) {
      setPR(null)
      return
    }
    setLoading(true)
    try {
      const result = await rpc().request['gh:pr']({ repoPath, branch })
      setPR(result)
    } catch {
      setPR(null)
    } finally {
      setLoading(false)
    }
  }, [repoPath, branch, refreshKey])

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

  return { pr, loading, refresh: fetch }
}
