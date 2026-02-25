import { useState, useEffect, useCallback } from 'react'
import { rpc } from '../rpc'
import type { OpencodeServerStatus } from '../shared/types'

export function useOpencodeServer(worktreePath: string) {
  const [status, setStatus] = useState<OpencodeServerStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpc().request['opencode:getStatus']({ worktreePath })
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

  const toggle = useCallback(async () => {
    if (!status || toggling) return
    const nextEnabled = !status.enabled
    setToggling(true)
    try {
      const result = await rpc().request['opencode:setEnabled']({
        worktreePath,
        enabled: nextEnabled
      })
      setStatus(result)
    } catch {
      setStatus(null)
    } finally {
      setToggling(false)
    }
  }, [worktreePath, status, toggling])

  return { status, loading, toggling, toggle, refresh: fetch }
}
