import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppConfig, RepoConfig } from '../../electron/types'

export function useConfig() {
  const [config, setConfigState] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const cfg = await window.treebeard.config.get()
    setConfigState(cfg)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (cfg: AppConfig) => {
    await window.treebeard.config.set(cfg)
    setConfigState(cfg)
  }, [])

  const addRepo = useCallback(
    async (name: string, path: string) => {
      if (!config) return
      const newRepo: RepoConfig = {
        id: crypto.randomUUID(),
        name,
        path
      }
      const updated = {
        ...config,
        repositories: [...config.repositories, newRepo]
      }
      await save(updated)
    },
    [config, save]
  )

  const removeRepo = useCallback(
    async (id: string) => {
      if (!config) return
      const updated = {
        ...config,
        repositories: config.repositories.filter((r) => r.id !== id)
      }
      await save(updated)
    },
    [config, save]
  )

  const setPollInterval = useCallback(
    async (sec: number) => {
      if (!config) return
      const updated = { ...config, pollIntervalSec: sec }
      await save(updated)
    },
    [config, save]
  )

  const reorderRepos = useCallback(
    async (repositories: RepoConfig[]) => {
      if (!config) return
      await save({ ...config, repositories })
    },
    [config, save]
  )

  return { config, loading, addRepo, removeRepo, setPollInterval, reorderRepos, reload: load }
}
