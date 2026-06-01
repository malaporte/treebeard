import { useState, useEffect, useCallback } from 'react'
import { rpc } from '../rpc'
import type { AppConfig, Workspace } from '../shared/types'

export function useWorkspaces() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cfg = await rpc().request['config:get']({})
      setConfig(cfg)
    } catch {
      setConfig(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (updated: AppConfig) => {
    await rpc().request['config:set']({ config: updated })
    setConfig(updated)
  }, [])

  const addWorkspace = useCallback(
    async (workspace: Workspace) => {
      if (!config) return
      const updated: AppConfig = {
        ...config,
        workspaces: [...(config.workspaces ?? []), workspace]
      }
      await save(updated)
    },
    [config, save]
  )

  const updateWorkspace = useCallback(
    async (workspace: Workspace) => {
      if (!config) return
      const updated: AppConfig = {
        ...config,
        workspaces: (config.workspaces ?? []).map((w) => (w.id === workspace.id ? workspace : w))
      }
      await save(updated)
    },
    [config, save]
  )

  const removeWorkspace = useCallback(
    async (id: string) => {
      if (!config) return
      const updated: AppConfig = {
        ...config,
        workspaces: (config.workspaces ?? []).filter((w) => w.id !== id)
      }
      await save(updated)
    },
    [config, save]
  )

  return {
    workspaces: config?.workspaces ?? [],
    loading,
    addWorkspace,
    updateWorkspace,
    removeWorkspace
  }
}
