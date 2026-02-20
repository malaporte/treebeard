import { useState, useEffect, useCallback, useRef } from 'react'
import type { Worktree } from '../../electron/types'

export function useWorktrees(repoPath: string | null, pollIntervalSec: number) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    setError(null)
    try {
      const wts = await window.treebeard.git.worktrees(repoPath)
      setWorktrees(wts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list worktrees')
      setWorktrees([])
    } finally {
      setLoading(false)
    }
  }, [repoPath])

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

  return { worktrees, loading, error, refresh: fetch }
}
