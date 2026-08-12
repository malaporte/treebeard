import { useState, useEffect, useCallback, useRef } from 'react'
import { rpc } from '../rpc'
import type { PRStackDetails, PRStackSummary } from '../shared/types'

export function usePRStack(
  worktreePath: string | null,
  enabled: boolean,
  detailsEnabled: boolean,
  pollIntervalSec: number,
  refreshKey?: number
) {
  const [summary, setSummary] = useState<PRStackSummary | null>(null)
  const [details, setDetails] = useState<PRStackDetails | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const summaryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detailsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSummary = useCallback(async () => {
    if (!worktreePath || !enabled) {
      setSummary(null)
      setSummaryLoading(false)
      return
    }

    setSummaryLoading(true)
    try {
      const result = await rpc().request['gh:stackSummary']({ worktreePath })
      setSummary(result)
    } catch {
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [worktreePath, enabled, refreshKey])

  const fetchDetails = useCallback(async () => {
    if (!worktreePath || !enabled || !detailsEnabled) {
      setDetails(null)
      setDetailsLoading(false)
      return
    }

    setDetailsLoading(true)
    try {
      const result = await rpc().request['gh:stackDetails']({ worktreePath })
      setDetails(result)
    } catch {
      setDetails(null)
    } finally {
      setDetailsLoading(false)
    }
  }, [worktreePath, enabled, detailsEnabled, refreshKey])

  useEffect(() => {
    void fetchSummary()

    if (summaryIntervalRef.current) clearInterval(summaryIntervalRef.current)
    if (enabled && pollIntervalSec > 0) {
      summaryIntervalRef.current = setInterval(fetchSummary, pollIntervalSec * 1000)
    }

    return () => {
      if (summaryIntervalRef.current) clearInterval(summaryIntervalRef.current)
    }
  }, [fetchSummary, enabled, pollIntervalSec])

  useEffect(() => {
    void fetchDetails()

    if (detailsIntervalRef.current) clearInterval(detailsIntervalRef.current)
    if (detailsEnabled && pollIntervalSec > 0) {
      detailsIntervalRef.current = setInterval(fetchDetails, pollIntervalSec * 1000)
    }

    return () => {
      if (detailsIntervalRef.current) clearInterval(detailsIntervalRef.current)
    }
  }, [fetchDetails, detailsEnabled, pollIntervalSec])

  return { summary, details, summaryLoading, detailsLoading, refreshSummary: fetchSummary, refreshDetails: fetchDetails }
}
