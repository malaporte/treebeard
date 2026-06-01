import { useState, useEffect, useCallback, useRef } from 'react'
import { rpc } from '../rpc'
import type { WorkspaceWorktreeStatus } from '../shared/types'

export function useWorkspaceWorktreeStatus(
  workspaceId: string | null,
  branch: string | null,
  pollIntervalSec: number,
  refreshKey: number
) {
  const [status, setStatus] = useState<WorkspaceWorktreeStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    if (!workspaceId || !branch) return
    setLoading(true)
    try {
      const result = await rpc().request['workspace:status']({ workspaceId, branch })
      setStatus(result)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, branch, refreshKey])

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
