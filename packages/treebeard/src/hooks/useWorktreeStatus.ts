import { useState, useEffect, useCallback } from 'react'
import { rpc } from '../rpc'
import type { WorktreeStatus } from '../shared/types'

export function useWorktreeStatus(worktreePath: string) {
  const [status, setStatus] = useState<WorktreeStatus | null>(null)
  const [loading, setLoading] = useState(false)

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
  }, [worktreePath])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { status, loading, refresh: fetch }
}
