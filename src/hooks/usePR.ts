import { useState, useEffect, useCallback } from 'react'
import type { PRInfo } from '../../electron/types'

export function usePR(repoPath: string | null, branch: string | null) {
  const [pr, setPR] = useState<PRInfo | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!repoPath || !branch) {
      setPR(null)
      return
    }
    setLoading(true)
    try {
      const result = await window.treebeard.gh.pr(repoPath, branch)
      setPR(result)
    } catch {
      setPR(null)
    } finally {
      setLoading(false)
    }
  }, [repoPath, branch])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { pr, loading, refresh: fetch }
}
