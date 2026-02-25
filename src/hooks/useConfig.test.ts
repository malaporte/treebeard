import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConfig } from './useConfig'
import type { AppConfig } from '../shared/types'

const getConfigRequest = vi.fn()
const setConfigRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'config:get': getConfigRequest,
      'config:set': setConfigRequest
    }
  })
}))

describe('useConfig', () => {
  beforeEach(() => {
    getConfigRequest.mockReset()
    setConfigRequest.mockReset()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000')
  })

  it('loads configuration on mount', async () => {
    const initial: AppConfig = {
      repositories: [],
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      opencodeServers: {},
      mobileBridge: {
        enabled: false,
        host: '0.0.0.0',
        port: 8787,
        pairingCode: '123456'
      }
    }
    getConfigRequest.mockResolvedValue(initial)

    const { result } = renderHook(() => useConfig())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.config).toEqual(initial)
    })
  })

  it('adds and removes repos through config:set', async () => {
    const initial: AppConfig = {
      repositories: [{ id: '1', name: 'repo', path: '/repo' }],
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      opencodeServers: {},
      mobileBridge: {
        enabled: false,
        host: '0.0.0.0',
        port: 8787,
        pairingCode: '123456'
      }
    }
    getConfigRequest.mockResolvedValue(initial)
    setConfigRequest.mockResolvedValue(undefined)

    const { result } = renderHook(() => useConfig())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.addRepo('new-repo', '/tmp/new-repo')
    })

    expect(setConfigRequest).toHaveBeenLastCalledWith({
      config: {
        ...initial,
        repositories: [
          { id: '1', name: 'repo', path: '/repo' },
          { id: '00000000-0000-4000-8000-000000000000', name: 'new-repo', path: '/tmp/new-repo' }
        ]
      }
    })

    await act(async () => {
      await result.current.removeRepo('1')
    })

    expect(setConfigRequest).toHaveBeenLastCalledWith({
      config: {
        ...initial,
        repositories: [{ id: '00000000-0000-4000-8000-000000000000', name: 'new-repo', path: '/tmp/new-repo' }]
      }
    })
  })

  it('updates poll interval, update settings, and repo order', async () => {
    const initial: AppConfig = {
      repositories: [
        { id: '1', name: 'repo-a', path: '/repo-a' },
        { id: '2', name: 'repo-b', path: '/repo-b' }
      ],
      pollIntervalSec: 60,
      autoUpdateEnabled: true,
      updateCheckIntervalMin: 30,
      collapsedRepos: [],
      opencodeServers: {},
      mobileBridge: {
        enabled: false,
        host: '0.0.0.0',
        port: 8787,
        pairingCode: '123456'
      }
    }
    getConfigRequest.mockResolvedValue(initial)
    setConfigRequest.mockResolvedValue(undefined)

    const { result } = renderHook(() => useConfig())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.setPollInterval(120)
      await result.current.setAutoUpdateEnabled(false)
      await result.current.setUpdateCheckInterval(45)
      await result.current.reorderRepos([initial.repositories[1], initial.repositories[0]])
    })

    expect(setConfigRequest).toHaveBeenNthCalledWith(1, {
      config: { ...initial, pollIntervalSec: 120 }
    })
    expect(setConfigRequest).toHaveBeenNthCalledWith(2, {
      config: { ...initial, autoUpdateEnabled: false }
    })
    expect(setConfigRequest).toHaveBeenNthCalledWith(3, {
      config: { ...initial, updateCheckIntervalMin: 45 }
    })
    expect(setConfigRequest).toHaveBeenNthCalledWith(4, {
      config: { ...initial, repositories: [initial.repositories[1], initial.repositories[0]] }
    })
  })
})
