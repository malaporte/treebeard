import { useState, useEffect, useCallback } from 'react'
import { rpc } from '../rpc'

export function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    rpc().request['config:getCollapsed']({}).then((ids: string[]) => {
      setCollapsed(new Set(ids))
    })
  }, [])

  const toggle = useCallback(async (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      rpc().request['config:setCollapsed']({ ids: [...next] })
      return next
    })
  }, [])

  return { collapsed, toggle }
}
