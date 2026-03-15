import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExistsSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockCopyFileSync = vi.fn()
const mockChmodSync = vi.fn()
const mockStatSync = vi.fn()

vi.mock('node:fs', () => ({
  default: {
    existsSync: (p: string) => mockExistsSync(p),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
    chmodSync: (...args: unknown[]) => mockChmodSync(...args),
    statSync: (...args: unknown[]) => mockStatSync(...args),
  },
}))

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/Users/test',
  },
}))

vi.mock('./paths', () => ({
  getBundledBinaryPath: (name: string) => `/app/bin/${name}`,
}))

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin:/Users/test/.local/bin' })),
}))

const { installPippinCli, getPippinCliStatus } = await import('./pippin-cli')

describe('pippin-cli service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockExistsSync.mockReset()
    mockMkdirSync.mockReset()
    mockCopyFileSync.mockReset()
    mockChmodSync.mockReset()
    mockStatSync.mockReset()
  })

  describe('installPippinCli', () => {
    it('copies binary to ~/.local/bin when not already installed', async () => {
      // Bundled binary exists, destination does not
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/app/bin/pippin') return true
        return false
      })
      mockStatSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const status = await installPippinCli()

      expect(status.installed).toBe(true)
      expect(status.needsUpdate).toBe(false)
      expect(status.error).toBeNull()
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.local/bin'),
        { recursive: true }
      )
      expect(mockCopyFileSync).toHaveBeenCalledWith(
        '/app/bin/pippin',
        expect.stringContaining('.local/bin/pippin')
      )
      expect(mockChmodSync).toHaveBeenCalledWith(
        expect.stringContaining('.local/bin/pippin'),
        0o755
      )
    })

    it('skips copy when installed binary matches bundled version', async () => {
      mockExistsSync.mockReturnValue(true)
      // Same size, dest is newer
      mockStatSync.mockReturnValue({ size: 5000, mtimeMs: 200 })

      const status = await installPippinCli()

      expect(status.installed).toBe(true)
      expect(status.needsUpdate).toBe(false)
      expect(mockCopyFileSync).not.toHaveBeenCalled()
    })

    it('copies binary when installed version is outdated', async () => {
      mockExistsSync.mockReturnValue(true)
      let callCount = 0
      mockStatSync.mockImplementation(() => {
        callCount++
        // First call: source (newer, bigger)
        if (callCount === 1) return { size: 6000, mtimeMs: 300 }
        // Second call: destination (older, smaller)
        return { size: 5000, mtimeMs: 100 }
      })

      const status = await installPippinCli()

      expect(status.installed).toBe(true)
      expect(mockCopyFileSync).toHaveBeenCalled()
    })

    it('returns error when bundled binary is not found', async () => {
      mockExistsSync.mockReturnValue(false)

      const status = await installPippinCli()

      expect(status.installed).toBe(false)
      expect(status.error).toBe('Bundled pippin binary not found')
    })

    it('reports onPath status based on shell environment', async () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ size: 5000, mtimeMs: 200 })

      const status = await installPippinCli()

      expect(status.onPath).toBe(true)
    })
  })

  describe('getPippinCliStatus', () => {
    it('reports not installed when binary does not exist at install path', async () => {
      mockExistsSync.mockReturnValue(false)

      const status = await getPippinCliStatus()

      expect(status.installed).toBe(false)
      expect(status.needsUpdate).toBe(false)
      expect(status.installPath).toContain('.local/bin/pippin')
    })

    it('reports installed and up to date when binary matches', async () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ size: 5000, mtimeMs: 200 })

      const status = await getPippinCliStatus()

      expect(status.installed).toBe(true)
      expect(status.needsUpdate).toBe(false)
    })

    it('reports needsUpdate when installed binary differs from bundled', async () => {
      mockExistsSync.mockReturnValue(true)
      let callCount = 0
      mockStatSync.mockImplementation(() => {
        callCount++
        if (callCount === 1) return { size: 6000, mtimeMs: 300 }
        return { size: 5000, mtimeMs: 100 }
      })

      const status = await getPippinCliStatus()

      expect(status.installed).toBe(true)
      expect(status.needsUpdate).toBe(true)
    })
  })
})
