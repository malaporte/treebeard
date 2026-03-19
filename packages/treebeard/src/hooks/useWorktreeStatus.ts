import { useState, useEffect, useCallback, useRef } from 'react'
import { rpc } from '../rpc'
import type { WorktreeStatus } from '../shared/types'

export function useWorktreeStatus(worktreePath: string, pollIntervalSec: number, refreshKey?: number) {
  const [status, setStatus] = useState<WorktreeStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpc().request['git:worktreeStatus']({ worktreePath })
      setStatus(result)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [worktreePath, refreshKey])

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

  return { status, loading, refresh: fetch }
}
