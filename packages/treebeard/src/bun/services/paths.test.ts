import { describe, expect, it, vi } from 'vitest'

const mockExistsSync = vi.fn()

vi.mock('node:fs', () => ({
  default: {
    existsSync: (p: string) => mockExistsSync(p),
  },
}))

// Dynamic import so the fs mock is in place before the module loads
const { getBundledBinaryPath } = await import('./paths')

describe('paths', () => {
  describe('getBundledBinaryPath', () => {
    it('returns production path when binary exists next to bun directory', () => {
      mockExistsSync.mockReturnValue(true)

      const result = getBundledBinaryPath('pippin')

      expect(result).toContain('bin/pippin')
      expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining('bin/pippin'))
    })

    it('falls back to dev workspace path when production binary does not exist', () => {
      mockExistsSync.mockReturnValue(false)

      const result = getBundledBinaryPath('pippin-server-linux-arm64')

      expect(result).toContain('pippin/dist/pippin-server-linux-arm64')
    })
  })
})
