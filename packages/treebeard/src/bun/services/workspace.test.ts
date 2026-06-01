import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listWorkspaceWorktrees,
  addWorkspaceWorktree,
  removeWorkspaceWorktree,
  getWorkspaceWorktreeStatus,
  getWorkspaceRemoteBranches,
  repairWorkspaceWorktree
} from './workspace'
import type { Workspace, RepoConfig } from '../../shared/types'

vi.mock('./git', () => ({
  getWorktrees: vi.fn(),
  addWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  getWorktreeStatus: vi.fn(),
  fetchRepo: vi.fn(),
  pullWorktree: vi.fn(),
  getRemoteBranches: vi.fn()
}))

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    rmdirSync: vi.fn()
  }
}))

import * as git from './git'
import fs from 'node:fs'

const WORKSPACE: Workspace = {
  id: 'ws-1',
  name: 'My Workspace',
  slug: 'my-workspace',
  repoIds: ['repo-a', 'repo-b']
}

const REPO_A: RepoConfig = { id: 'repo-a', name: 'repo-a', path: '/repos/repo-a' }
const REPO_B: RepoConfig = { id: 'repo-b', name: 'repo-b', path: '/repos/repo-b' }
const REPOS = [REPO_A, REPO_B]

const WORKSPACE_ROOT = '/Users/test/Developer/worktrees/my-workspace'

describe('workspace service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.stubGlobal('Bun', { env: { HOME: '/Users/test' } })
  })

  describe('listWorkspaceWorktrees', () => {
    it('returns isComplete: true when both repos have the branch worktree under workspace root', async () => {
      const branchPath = path.join(WORKSPACE_ROOT, 'feat/x')
      vi.mocked(git.getWorktrees)
        .mockResolvedValueOnce([
          { path: path.join(branchPath, 'repo-a'), branch: 'feat/x', head: 'aaa', isMain: false }
        ])
        .mockResolvedValueOnce([
          { path: path.join(branchPath, 'repo-b'), branch: 'feat/x', head: 'bbb', isMain: false }
        ])

      const result = await listWorkspaceWorktrees(WORKSPACE, REPOS)

      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('feat/x')
      expect(result[0].isComplete).toBe(true)
      expect(result[0].members).toHaveLength(2)
      expect(result[0].members[0].repoId).toBe('repo-a')
      expect(result[0].members[1].repoId).toBe('repo-b')
    })

    it('returns isComplete: false when only one repo has the branch worktree', async () => {
      const branchPath = path.join(WORKSPACE_ROOT, 'feat/x')
      vi.mocked(git.getWorktrees)
        .mockResolvedValueOnce([
          { path: path.join(branchPath, 'repo-a'), branch: 'feat/x', head: 'aaa', isMain: false }
        ])
        .mockResolvedValueOnce([])

      const result = await listWorkspaceWorktrees(WORKSPACE, REPOS)

      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('feat/x')
      expect(result[0].isComplete).toBe(false)
      expect(result[0].members[0].worktree).not.toBeNull()
      expect(result[0].members[1].worktree).toBeNull()
    })
  })

  describe('addWorkspaceWorktree', () => {
    it('happy path: calls addWorktree per member with correct paths and returns success', async () => {
      vi.mocked(git.addWorktree).mockResolvedValue({ success: true })

      const result = await addWorkspaceWorktree(WORKSPACE, REPOS, 'feat/x', true)

      const branchPath = path.join(WORKSPACE_ROOT, 'feat/x')
      expect(fs.mkdirSync).toHaveBeenCalledWith(branchPath, { recursive: true })
      expect(git.addWorktree).toHaveBeenCalledTimes(2)
      expect(git.addWorktree).toHaveBeenCalledWith(
        REPO_A.path,
        'feat/x',
        path.join(branchPath, 'repo-a'),
        true
      )
      expect(git.addWorktree).toHaveBeenCalledWith(
        REPO_B.path,
        'feat/x',
        path.join(branchPath, 'repo-b'),
        true
      )
      expect(result.success).toBe(true)
      expect(result.workspacePath).toBe(branchPath)
      expect(result.perRepo).toHaveLength(2)
      expect(result.perRepo[0]).toEqual({ repoId: 'repo-a', success: true })
      expect(result.perRepo[1]).toEqual({ repoId: 'repo-b', success: true })
    })

    it('rollback: second member fails, removes first worktree and cleans up branch folder', async () => {
      const branchPath = path.join(WORKSPACE_ROOT, 'feat/x')
      vi.mocked(git.addWorktree)
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'branch already exists' })
      vi.mocked(git.removeWorktree).mockResolvedValue({ success: true })

      const result = await addWorkspaceWorktree(WORKSPACE, REPOS, 'feat/x', true)

      expect(git.removeWorktree).toHaveBeenCalledWith(
        REPO_A.path,
        path.join(branchPath, 'repo-a'),
        true
      )
      expect(fs.rmdirSync).toHaveBeenCalledWith(branchPath)
      expect(result.success).toBe(false)
      expect(result.perRepo[1].success).toBe(false)
      expect(result.perRepo[1].error).toBe('branch already exists')
    })
  })

  describe('removeWorkspaceWorktree', () => {
    it('calls removeWorktree per member and rmdirSync on branch folder', async () => {
      vi.mocked(git.removeWorktree).mockResolvedValue({ success: true })

      const result = await removeWorkspaceWorktree(WORKSPACE, REPOS, 'feat/x', false)

      const branchPath = path.join(WORKSPACE_ROOT, 'feat/x')
      expect(git.removeWorktree).toHaveBeenCalledTimes(2)
      expect(git.removeWorktree).toHaveBeenCalledWith(
        REPO_A.path,
        path.join(branchPath, 'repo-a'),
        false
      )
      expect(git.removeWorktree).toHaveBeenCalledWith(
        REPO_B.path,
        path.join(branchPath, 'repo-b'),
        false
      )
      expect(fs.rmdirSync).toHaveBeenCalledWith(branchPath)
      expect(result.success).toBe(true)
      expect(result.perRepo).toHaveLength(2)
    })
  })

  describe('getWorkspaceWorktreeStatus', () => {
    it('computes correct rollup across repos', async () => {
      vi.mocked(git.getWorktreeStatus)
        .mockResolvedValueOnce({
          hasUncommittedChanges: true,
          linesAdded: 5,
          linesDeleted: 2,
          unpushedCommits: 1,
          unpulledCommits: 0
        })
        .mockResolvedValueOnce({
          hasUncommittedChanges: false,
          linesAdded: 3,
          linesDeleted: 1,
          unpushedCommits: 0,
          unpulledCommits: 2
        })

      const result = await getWorkspaceWorktreeStatus(WORKSPACE, REPOS, 'feat/x')

      expect(result.rollup).toEqual({
        hasUncommittedChanges: true,
        linesAdded: 8,
        linesDeleted: 3,
        unpushedCommits: 1,
        unpulledCommits: 2
      })
      expect(result.dirtyRepoCount).toBe(1)
      expect(result.perRepo).toHaveLength(2)
      expect(result.perRepo[0].repoId).toBe('repo-a')
      expect(result.perRepo[1].repoId).toBe('repo-b')
    })
  })

  describe('getWorkspaceRemoteBranches', () => {
    it('returns sorted set intersection of remote branches across repos', async () => {
      vi.mocked(git.getRemoteBranches)
        .mockResolvedValueOnce(['main', 'feat/x', 'feat/y'])
        .mockResolvedValueOnce(['main', 'feat/x', 'feat/z'])

      const result = await getWorkspaceRemoteBranches(WORKSPACE, REPOS)

      expect(result).toEqual(['feat/x', 'main'])
    })
  })

  describe('repairWorkspaceWorktree', () => {
    it('calls addWorktree only for the member missing the worktree', async () => {
      const branchPath = path.join(WORKSPACE_ROOT, 'feat/x')
      vi.mocked(git.getWorktrees)
        .mockResolvedValueOnce([
          { path: path.join(branchPath, 'repo-a'), branch: 'feat/x', head: 'aaa', isMain: false }
        ])
        .mockResolvedValueOnce([])
      vi.mocked(git.addWorktree).mockResolvedValue({ success: true })

      const result = await repairWorkspaceWorktree(WORKSPACE, REPOS, 'feat/x')

      expect(git.addWorktree).toHaveBeenCalledTimes(1)
      expect(git.addWorktree).toHaveBeenCalledWith(
        REPO_B.path,
        'feat/x',
        path.join(branchPath, 'repo-b'),
        true
      )
      expect(result.success).toBe(true)
      expect(result.perRepo).toHaveLength(2)
      expect(result.perRepo[0]).toEqual({ repoId: 'repo-a', success: true })
      expect(result.perRepo[1]).toEqual({ repoId: 'repo-b', success: true })
    })
  })
})
