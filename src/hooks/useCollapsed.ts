import { useState, useEffect, useCallback } from 'react'

export function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.treebeard.config.getCollapsed().then((ids) => {
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
      window.treebeard.config.setCollapsed([...next])
      return next
    })
  }, [])

  return { collapsed, toggle }
}
