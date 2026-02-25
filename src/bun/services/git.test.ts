import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addWorktree,
  buildWorktreePath,
  getDefaultBranch,
  getGitHubRepo,
  getRemoteBranches,
  getWorktreeStatus,
  getWorktrees,
  removeWorktree
} from './git'
import { setBunSpawnQueue } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

describe('git service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses porcelain worktree output and excludes bare trees', async () => {
    setBunSpawnQueue([
      {
        stdout: [
          'worktree /repo',
          'HEAD 111',
          'branch refs/heads/main',
          '',
          'worktree /repo-feature',
          'HEAD 222',
          'branch refs/heads/feat/TB-123',
          '',
          'worktree /repo-bare',
          'HEAD 333',
          'bare'
        ].join('\n')
      }
    ])

    const result = await getWorktrees('/repo')
    expect(result).toEqual([
      { path: '/repo', branch: 'main', head: '111', isMain: true },
      { path: '/repo-feature', branch: 'feat/TB-123', head: '222', isMain: false }
    ])
  })

  it('extracts owner/repo from ssh and https remote urls', async () => {
    setBunSpawnQueue([{ stdout: 'git@github.com:acme/treebeard.git\n' }])
    await expect(getGitHubRepo('/repo')).resolves.toBe('acme/treebeard')

    setBunSpawnQueue([{ stdout: 'https://github.com/acme/another-repo\n' }])
    await expect(getGitHubRepo('/repo')).resolves.toBe('acme/another-repo')
  })

  it('falls back through remote HEAD then main/master for default branch', async () => {
    setBunSpawnQueue([{ stdout: 'origin/trunk\n' }])
    await expect(getDefaultBranch('/repo')).resolves.toBe('trunk')

    setBunSpawnQueue([
      { stderr: 'not set', exitCode: 1 },
      { stdout: 'abc123\n' }
    ])
    await expect(getDefaultBranch('/repo')).resolves.toBe('main')

    setBunSpawnQueue([
      { stderr: 'not set', exitCode: 1 },
      { stderr: 'missing main', exitCode: 1 },
      { stdout: 'def456\n' }
    ])
    await expect(getDefaultBranch('/repo')).resolves.toBe('master')
  })

  it('returns sorted remote branches excluding HEAD pointers and used branches', async () => {
    setBunSpawnQueue([
      { stdout: '' },
      {
        stdout: [
          'origin/main',
          'origin/feature/used',
          'origin/HEAD -> origin/main',
          'origin/zzz',
          'origin/alpha'
        ].join('\n')
      },
      {
        stdout: [
          'worktree /repo',
          'HEAD 111',
          'branch refs/heads/feature/used'
        ].join('\n')
      }
    ])

    const branches = await getRemoteBranches('/repo')
    expect(branches).toEqual(['alpha', 'main', 'zzz'])
  })

  it('builds worktree paths using repo slug and HOME', () => {
    expect(buildWorktreePath('My Repo', 'feature/a')).toBe('/Users/test/Developer/worktrees/my-repo/feature/a')
  })

  it('computes worktree status counts and ahead/behind commits', async () => {
    setBunSpawnQueue([
      { stdout: ' M src/file.ts\n' },
      { stdout: '3\t2\tsrc/file.ts\n-\t-\tbinary.dat\n1\t0\tsrc/other.ts\n' },
      { stdout: '111 first\n222 second\n' },
      { stdout: '333 remote\n' }
    ])

    const status = await getWorktreeStatus('/worktree')
    expect(status).toEqual({
      hasUncommittedChanges: true,
      unpushedCommits: 2,
      unpulledCommits: 1,
      linesAdded: 4,
      linesDeleted: 2
    })
  })

  it('treats status failures as potentially dirty', async () => {
    setBunSpawnQueue([
      { stderr: 'status failed', exitCode: 1 },
      { stdout: '' },
      { stdout: '' },
      { stdout: '' }
    ])

    const status = await getWorktreeStatus('/worktree')
    expect(status.hasUncommittedChanges).toBe(true)
  })

  it('adds and removes worktrees with structured success/error responses', async () => {
    const addSpawn = setBunSpawnQueue([{ stdout: '' }])
    await expect(addWorktree('/repo', 'feat/TB-7', '/tmp/wt', true, 'main')).resolves.toEqual({ success: true })
    expect(addSpawn).toHaveBeenCalledWith(
      ['git', 'worktree', 'add', '-b', 'feat/TB-7', '/tmp/wt', 'main'],
      expect.any(Object)
    )

    setBunSpawnQueue([{ stderr: 'cannot remove worktree', exitCode: 1 }])
    await expect(removeWorktree('/repo', '/tmp/wt')).resolves.toEqual({
      success: false,
      error: 'cannot remove worktree'
    })
  })
})
