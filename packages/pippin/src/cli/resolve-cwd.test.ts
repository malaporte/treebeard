import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock node:fs so we can control realpathSync behavior
const mockRealpathSync = vi.fn()
const mockReadFileSync = vi.fn()

vi.mock('node:fs', () => ({
  default: {
    realpathSync: (...args: unknown[]) => mockRealpathSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  },
}))

let translateCwd: typeof import('./resolve-cwd').translateCwd
let readMountConfig: typeof import('./resolve-cwd').readMountConfig

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  mockRealpathSync.mockReset()
  mockReadFileSync.mockReset()

  // Default: realpathSync returns the input unchanged
  mockRealpathSync.mockImplementation((p: string) => p)

  const mod = await import('./resolve-cwd')
  translateCwd = mod.translateCwd
  readMountConfig = mod.readMountConfig
})

describe('translateCwd', () => {
  it('returns null when sandboxMountPath is null', () => {
    const result = translateCwd('/any/path', null)
    expect(result).toBeNull()
  })

  it('returns null when sandboxMountPath is empty string', () => {
    const result = translateCwd('/any/path', '')
    expect(result).toBeNull()
  })

  it('translates cwd at the root of the mount path', () => {
    const result = translateCwd('/Users/test/Developer', '/Users/test/Developer')
    expect(result).toEqual({ containerCwd: '/workspace' })
  })

  it('translates cwd under the mount path', () => {
    const result = translateCwd(
      '/Users/test/Developer/my-project',
      '/Users/test/Developer',
    )
    expect(result).toEqual({ containerCwd: '/workspace/my-project' })
  })

  it('translates deeply nested cwd under the mount path', () => {
    const result = translateCwd(
      '/Users/test/Developer/org/repo/packages/foo',
      '/Users/test/Developer',
    )
    expect(result).toEqual({ containerCwd: '/workspace/org/repo/packages/foo' })
  })

  it('returns error when cwd is outside the mount path', () => {
    const result = translateCwd('/tmp/random', '/Users/test/Developer')
    expect(result).toEqual({
      error: "cwd '/tmp/random' is outside sandbox mount '/Users/test/Developer'",
    })
  })

  it('returns error when cwd shares a prefix but is not a child', () => {
    // /Users/test/Developer-other should NOT match /Users/test/Developer
    const result = translateCwd(
      '/Users/test/Developer-other/project',
      '/Users/test/Developer',
    )
    expect(result).toEqual({
      error: "cwd '/Users/test/Developer-other/project' is outside sandbox mount '/Users/test/Developer'",
    })
  })

  it('resolves symlinks via realpathSync', () => {
    mockRealpathSync.mockImplementation((p: string) => {
      if (p === '/home/link') return '/Users/test/Developer'
      if (p === '/home/link/project') return '/Users/test/Developer/project'
      return p
    })

    const result = translateCwd('/home/link/project', '/home/link')
    expect(result).toEqual({ containerCwd: '/workspace/project' })
  })

  it('returns error when mount path does not exist', () => {
    mockRealpathSync.mockImplementation((p: string) => {
      if (p === '/nonexistent') throw new Error('ENOENT')
      return p
    })

    const result = translateCwd('/any/path', '/nonexistent')
    expect(result).toEqual({
      error: "sandbox mount path '/nonexistent' does not exist",
    })
  })

  it('returns error when cwd does not exist', () => {
    mockRealpathSync.mockImplementation((p: string) => {
      if (p === '/nonexistent/cwd') throw new Error('ENOENT')
      return p
    })

    const result = translateCwd('/nonexistent/cwd', '/Users/test/Developer')
    expect(result).toEqual({
      error: "working directory '/nonexistent/cwd' does not exist",
    })
  })

  it('handles trailing slashes in mount path', () => {
    // path.normalize removes trailing slashes
    const result = translateCwd(
      '/Users/test/Developer/project',
      '/Users/test/Developer/',
    )
    expect(result).toEqual({ containerCwd: '/workspace/project' })
  })
})

describe('readMountConfig', () => {
  it('reads sandboxMountPath from config file', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ sandboxMountPath: '/Users/test/Developer' }),
    )

    const config = readMountConfig()
    expect(config.sandboxMountPath).toBe('/Users/test/Developer')
  })

  it('returns null when sandboxMountPath is not set', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({}))

    const config = readMountConfig()
    expect(config.sandboxMountPath).toBeNull()
  })

  it('returns null when config file does not exist', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const config = readMountConfig()
    expect(config.sandboxMountPath).toBeNull()
  })

  it('returns null when sandboxMountPath is empty string', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ sandboxMountPath: '' }))

    const config = readMountConfig()
    expect(config.sandboxMountPath).toBeNull()
  })

  it('returns null when sandboxMountPath is whitespace-only', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ sandboxMountPath: '   ' }))

    const config = readMountConfig()
    expect(config.sandboxMountPath).toBeNull()
  })

  it('trims whitespace from sandboxMountPath', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ sandboxMountPath: '  /Users/test/Developer  ' }),
    )

    const config = readMountConfig()
    expect(config.sandboxMountPath).toBe('/Users/test/Developer')
  })

  it('returns null when sandboxMountPath is a non-string value', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ sandboxMountPath: 42 }))

    const config = readMountConfig()
    expect(config.sandboxMountPath).toBeNull()
  })
})
