import path from 'node:path'
import fs from 'node:fs'
import {
  getWorktrees,
  addWorktree,
  removeWorktree,
  getWorktreeStatus,
  fetchRepo,
  pullWorktree,
  getRemoteBranches
} from './git'
import type { Workspace, RepoConfig, WorkspaceWorktree, WorkspaceWorktreeStatus, WorktreeStatus } from '../../shared/types'

/** Returns the workspace worktree root path: ~/Developer/worktrees/<slug>/<branch> */
export function buildWorkspaceWorktreePath(slug: string, branch: string): string {
  const homedir = Bun.env.HOME || process.env.HOME || ''
  return path.join(homedir, 'Developer', 'worktrees', slug, branch)
}

/** List all workspace worktrees by intersecting member repos' worktrees on branch name. */
export async function listWorkspaceWorktrees(
  workspace: Workspace,
  repos: RepoConfig[]
): Promise<WorkspaceWorktree[]> {
  const workspaceRoot = buildWorkspaceWorktreePath(workspace.slug, '')

  const perRepoWorktrees = await Promise.all(
    repos.map(async (repo) => {
      const worktrees = await getWorktrees(repo.path)
      return { repo, worktrees: worktrees.filter((wt) => wt.path.startsWith(workspaceRoot)) }
    })
  )

  // Collect all branch names seen across any member
  const allBranches = new Set<string>()
  for (const { worktrees } of perRepoWorktrees) {
    for (const wt of worktrees) {
      allBranches.add(wt.branch)
    }
  }

  const result: WorkspaceWorktree[] = []

  for (const branch of allBranches) {
    const members = repos.map((repo) => {
      const repoEntry = perRepoWorktrees.find((r) => r.repo.id === repo.id)
      const wt = repoEntry?.worktrees.find((w) => w.branch === branch) ?? null
      return {
        repoId: repo.id,
        repoName: repo.name,
        path: wt?.path ?? null,
        worktree: wt
      }
    })

    const isComplete = members.every((m) => m.worktree !== null)
    const rootPath = buildWorkspaceWorktreePath(workspace.slug, branch)

    result.push({
      workspaceId: workspace.id,
      branch,
      rootPath,
      members,
      isComplete
    })
  }

  return result
}

/** Create an aligned worktree across all member repos, with rollback on partial failure. */
export async function addWorkspaceWorktree(
  workspace: Workspace,
  repos: RepoConfig[],
  branch: string,
  isNewBranch: boolean
): Promise<{ success: boolean; workspacePath?: string; perRepo: { repoId: string; success: boolean; error?: string }[] }> {
  const branchPath = buildWorkspaceWorktreePath(workspace.slug, branch)

  try {
    fs.mkdirSync(branchPath, { recursive: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, perRepo: [{ repoId: '', success: false, error: message }] }
  }

  const perRepo: { repoId: string; success: boolean; error?: string }[] = []
  const created: { repoId: string; worktreePath: string; repoPath: string }[] = []

  for (const repo of repos) {
    const worktreePath = path.join(branchPath, repo.name)
    const result = await addWorktree(repo.path, branch, worktreePath, isNewBranch)
    perRepo.push({ repoId: repo.id, success: result.success, error: result.error })

    if (result.success) {
      created.push({ repoId: repo.id, worktreePath, repoPath: repo.path })
    } else {
      // Rollback already-created worktrees
      for (const c of created) {
        await removeWorktree(c.repoPath, c.worktreePath, true)
      }
      // Clean up the branch folder
      try {
        fs.rmdirSync(branchPath)
      } catch {
        // leave it if non-empty or fails
      }
      return { success: false, perRepo }
    }
  }

  return { success: true, workspacePath: branchPath, perRepo }
}

/** Remove all member worktrees for a branch and clean up the parent folder. */
export async function removeWorkspaceWorktree(
  workspace: Workspace,
  repos: RepoConfig[],
  branch: string,
  force: boolean
): Promise<{ success: boolean; perRepo: { repoId: string; success: boolean; error?: string }[] }> {
  const branchPath = buildWorkspaceWorktreePath(workspace.slug, branch)

  const perRepo = await Promise.all(
    repos.map(async (repo) => {
      const worktreePath = path.join(branchPath, repo.name)
      const result = await removeWorktree(repo.path, worktreePath, force)
      return { repoId: repo.id, success: result.success, error: result.error }
    })
  )

  // Non-recursive rmdir — leave if not empty or fails
  try {
    fs.rmdirSync(branchPath)
  } catch {
    // intentionally silent
  }

  const success = perRepo.every((r) => r.success)
  return { success, perRepo }
}

/** Fan out getWorktreeStatus in parallel and compute a rolled-up WorkspaceWorktreeStatus. */
export async function getWorkspaceWorktreeStatus(
  workspace: Workspace,
  repos: RepoConfig[],
  branch: string
): Promise<WorkspaceWorktreeStatus> {
  const branchPath = buildWorkspaceWorktreePath(workspace.slug, branch)

  const perRepoStatuses = await Promise.all(
    repos.map(async (repo) => {
      const worktreePath = path.join(branchPath, repo.name)
      try {
        const status = await getWorktreeStatus(worktreePath)
        return { repoId: repo.id, status }
      } catch {
        return { repoId: repo.id, status: null }
      }
    })
  )

  const rollup: WorktreeStatus = {
    hasUncommittedChanges: false,
    unpushedCommits: 0,
    unpulledCommits: 0,
    linesAdded: 0,
    linesDeleted: 0
  }

  let dirtyRepoCount = 0

  for (const { status } of perRepoStatuses) {
    if (!status) continue
    rollup.hasUncommittedChanges = rollup.hasUncommittedChanges || status.hasUncommittedChanges
    rollup.unpushedCommits += status.unpushedCommits
    rollup.unpulledCommits += status.unpulledCommits
    rollup.linesAdded += status.linesAdded
    rollup.linesDeleted += status.linesDeleted
    if (status.hasUncommittedChanges) dirtyRepoCount++
  }

  return { rollup, perRepo: perRepoStatuses, dirtyRepoCount }
}

/** Fan out fetchRepo in parallel across all member repos. */
export async function fetchWorkspace(workspace: Workspace, repos: RepoConfig[]): Promise<void> {
  await Promise.all(repos.map((repo) => fetchRepo(repo.path)))
}

/** Fan out pullWorktree in parallel across all member repos for a given branch. */
export async function pullWorkspaceWorktree(
  workspace: Workspace,
  repos: RepoConfig[],
  branch: string
): Promise<{ perRepo: { repoId: string; success: boolean; error?: string }[] }> {
  const branchPath = buildWorkspaceWorktreePath(workspace.slug, branch)

  const perRepo = await Promise.all(
    repos.map(async (repo) => {
      const worktreePath = path.join(branchPath, repo.name)
      const result = await pullWorktree(worktreePath)
      return { repoId: repo.id, success: result.success, error: result.error }
    })
  )

  return { perRepo }
}

/** Return the set intersection of remote branches across all member repos. */
export async function getWorkspaceRemoteBranches(
  workspace: Workspace,
  repos: RepoConfig[]
): Promise<string[]> {
  if (repos.length === 0) return []

  const perRepoBranches = await Promise.all(
    repos.map((repo) => getRemoteBranches(repo.path))
  )

  // Start with the first repo's branches and intersect with the rest
  let intersection = new Set(perRepoBranches[0])
  for (let i = 1; i < perRepoBranches.length; i++) {
    const repoSet = new Set(perRepoBranches[i])
    intersection = new Set([...intersection].filter((b) => repoSet.has(b)))
  }

  return [...intersection].sort()
}

/** Add missing member worktrees for an incomplete workspace worktree. */
export async function repairWorkspaceWorktree(
  workspace: Workspace,
  repos: RepoConfig[],
  branch: string
): Promise<{ success: boolean; perRepo: { repoId: string; success: boolean; error?: string }[] }> {
  const branchPath = buildWorkspaceWorktreePath(workspace.slug, branch)

  const perRepoWorktrees = await Promise.all(
    repos.map(async (repo) => {
      const worktrees = await getWorktrees(repo.path)
      return { repo, worktrees }
    })
  )

  const perRepo = await Promise.all(
    perRepoWorktrees.map(async ({ repo, worktrees }) => {
      const expectedPath = path.join(branchPath, repo.name)
      const hasBranch = worktrees.some((wt) => wt.path === expectedPath)

      if (hasBranch) {
        return { repoId: repo.id, success: true }
      }

      // Ensure the branch folder exists before adding the worktree
      try {
        fs.mkdirSync(branchPath, { recursive: true })
      } catch {
        // already exists or creation failed — addWorktree will surface the error
      }

      const result = await addWorktree(repo.path, branch, expectedPath, true)
      return { repoId: repo.id, success: result.success, error: result.error }
    })
  )

  const success = perRepo.every((r) => r.success)
  return { success, perRepo }
}
