import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBundledBinaryPath } from './paths'

describe('paths', () => {
  const originalExecPath = process.execPath

  afterEach(() => {
    process.execPath = originalExecPath
  })

  describe('getBundledBinaryPath', () => {
    it('returns production path when running inside a .app bundle', () => {
      process.execPath = '/Applications/Treebeard.app/Contents/MacOS/bun'

      const result = getBundledBinaryPath('pippin')

      expect(result).toBe(
        path.join('/Applications/Treebeard.app/Contents/MacOS', '..', 'Resources', 'app', 'bin', 'pippin')
      )
    })

    it('returns dev workspace path when not running inside a .app bundle', () => {
      process.execPath = '/usr/local/bin/bun'

      const result = getBundledBinaryPath('pippin-server-linux-arm64')

      expect(result).toContain('pippin/dist/pippin-server-linux-arm64')
    })
  })
})
