import { useEffect, useCallback } from 'react'
import { rpc } from '../rpc'

export function useFetchRepo(repoPath: string, fetchIntervalSec: number, onFetched: () => void) {
  const fetch = useCallback(async () => {
    try {
      await rpc().request['git:fetchRepo']({ repoPath })
    } catch {
      // fetch failures are non-critical; status poll will show stale data
    }
    onFetched()
  }, [repoPath, onFetched])

  useEffect(() => {
    if (fetchIntervalSec <= 0) return
    const interval = setInterval(fetch, fetchIntervalSec * 1000)
    return () => clearInterval(interval)
  }, [fetch, fetchIntervalSec])
}
