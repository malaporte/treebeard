import { useState, useEffect, useCallback, useRef } from 'react'
import { rpc } from '../rpc'
import type { SandboxStatus } from '../shared/types'

const POLL_INTERVAL_MS = 3000

export function useSandbox() {
  const [status, setStatus] = useState<SandboxStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const result = await rpc().request['leash:status']({})
      setStatus(result)
    } catch {
      setStatus(null)
    }
  }, [])

  const start = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpc().request['leash:start']({})
      setStatus(result)
    } catch {
      await fetchStatus()
    } finally {
      setLoading(false)
    }
  }, [fetchStatus])

  const stop = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpc().request['leash:stop']({})
      setStatus(result)
    } catch {
      await fetchStatus()
    } finally {
      setLoading(false)
    }
  }, [fetchStatus])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Poll while in a transitional or running state
  useEffect(() => {
    const shouldPoll = status?.state === 'running' || status?.state === 'starting' || status?.state === 'stopping'

    if (shouldPoll) {
      pollingRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS)
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [status?.state, fetchStatus])

  return { status, loading, start, stop, refresh: fetchStatus }
}
