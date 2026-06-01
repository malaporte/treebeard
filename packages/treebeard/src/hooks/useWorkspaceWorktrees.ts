import { useState, useEffect, useCallback, useRef } from 'react'
import { rpc } from '../rpc'
import type { WorkspaceWorktree } from '../shared/types'

export function useWorkspaceWorktrees(workspaceId: string | null, pollIntervalSec: number) {
  const [worktrees, setWorktrees] = useState<WorkspaceWorktree[]>([])
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const result = await rpc().request['workspace:list']({ workspaceId })
      setWorktrees(result)
    } catch {
      setWorktrees([])
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  const createWorktree = useCallback(
    async (branch: string, isNewBranch: boolean) => {
      if (!workspaceId) return null
      try {
        const result = await rpc().request['workspace:addWorktree']({ workspaceId, branch, isNewBranch })
        return result
      } catch {
        return null
      }
    },
    [workspaceId]
  )

  const removeWorktree = useCallback(
    async (branch: string, force?: boolean) => {
      if (!workspaceId) return
      try {
        const result = await rpc().request['workspace:removeWorktree']({ workspaceId, branch, force })
        if (result.success) {
          await fetch()
        }
      } catch {
        // silently fail
      }
    },
    [workspaceId, fetch]
  )

  const repairWorktree = useCallback(
    async (branch: string) => {
      if (!workspaceId) return
      try {
        await rpc().request['workspace:repair']({ workspaceId, branch })
        await fetch()
      } catch {
        // silently fail
      }
    },
    [workspaceId, fetch]
  )

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

  return {
    worktrees,
    loading,
    refresh: fetch,
    createWorktree,
    removeWorktree,
    repairWorktree
  }
}
