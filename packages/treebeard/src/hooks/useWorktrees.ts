import { useState, useEffect, useCallback, useRef } from 'react'
import { rpc } from '../rpc'
import type { Worktree } from '../shared/types'

export function useWorktrees(repoPath: string | null, pollIntervalSec: number) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingPaths, setDeletingPaths] = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    setError(null)
    try {
      const wts = await rpc().request['git:worktrees']({ repoPath })
      setWorktrees(wts)
      // Prune paths that are no longer in the list (deletion completed)
      setDeletingPaths((prev) => {
        const remaining = new Set<string>()
        for (const p of prev) {
          if (wts.some((w: Worktree) => w.path === p)) remaining.add(p)
        }
        return remaining.size === prev.size ? prev : remaining
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list worktrees')
      setWorktrees([])
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  const startDelete = useCallback(async (worktreePath: string, force: boolean) => {
    if (!repoPath) return
    setDeletingPaths((prev) => new Set(prev).add(worktreePath))
    setDeleteError(null)

    const result = await rpc().request['git:removeWorktree']({
      repoPath,
      worktreePath,
      force: force || undefined
    })

    if (result.success) {
      await fetch()
    } else {
      setDeletingPaths((prev) => {
        const next = new Set(prev)
        next.delete(worktreePath)
        return next
      })
      setDeleteError(result.error || 'Failed to remove worktree')
    }
  }, [repoPath, fetch])

  const clearDeleteError = useCallback(() => {
    setDeleteError(null)
  }, [])

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

  return { worktrees, loading, error, deleteError, deletingPaths, startDelete, clearDeleteError, refresh: fetch }
}
