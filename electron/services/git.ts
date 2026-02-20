import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import type { Worktree } from '../types'

const execFileAsync = promisify(execFile)

const MAIN_BRANCH_NAMES = new Set(['main', 'master', 'develop', 'trunk'])

export async function getWorktrees(repoPath: string): Promise<Worktree[]> {
  const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath
  })

  return parseWorktreeOutput(stdout)
}

function parseWorktreeOutput(output: string): Worktree[] {
  const worktrees: Worktree[] = []
  const blocks = output.trim().split('\n\n')

  for (const block of blocks) {
    if (!block.trim()) continue

    const lines = block.trim().split('\n')
    let path = ''
    let head = ''
    let branch = ''
    let isBare = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        // branch refs/heads/feat/PROJ-123-description
        branch = line.slice('branch '.length).replace('refs/heads/', '')
      } else if (line === 'bare') {
        isBare = true
      } else if (line === 'detached') {
        branch = '(detached)'
      }
    }

    if (isBare) continue

    worktrees.push({
      path,
      branch,
      head,
      isMain: MAIN_BRANCH_NAMES.has(branch)
    })
  }

  return worktrees
}

/**
 * Extract a JIRA issue key from a branch name.
 * Case-insensitive to handle branches like emdash/nodec-83-bundle.
 */
export function extractJiraKey(branch: string): string | null {
  const match = branch.match(/([a-zA-Z][a-zA-Z0-9]+-\d+)/i)
  return match ? match[1].toUpperCase() : null
}

/**
 * Get the GitHub remote owner/repo for a git repository.
 */
export async function getGitHubRepo(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoPath
    })

    const url = stdout.trim()

    // SSH: git@github.com:owner/repo.git
    const sshMatch = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
    if (sshMatch) return sshMatch[1]

    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/)
    if (httpsMatch) return httpsMatch[1]

    return null
  } catch {
    return null
  }
}

/**
 * Detect the default branch for a repo (main, master, etc.).
 * Tries symbolic-ref first, then falls back to checking common names.
 */
export async function getDefaultBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'],
      { cwd: repoPath }
    )
    // Returns e.g. "origin/main" — strip the remote prefix
    return stdout.trim().replace(/^origin\//, '')
  } catch {
    // Fallback: check if main or master exists locally
    for (const name of ['main', 'master']) {
      try {
        await execFileAsync('git', ['rev-parse', '--verify', name], { cwd: repoPath })
        return name
      } catch {
        continue
      }
    }
    return 'main'
  }
}

/**
 * List remote branches (fetches first), excluding HEAD pointers.
 * Also excludes branches that already have a local worktree.
 * Returns short names like "feat/foo", "fix/bar".
 */
export async function getRemoteBranches(repoPath: string): Promise<string[]> {
  // Fetch latest from origin (non-fatal if it fails, e.g. offline)
  try {
    await execFileAsync('git', ['fetch', '--prune', 'origin'], { cwd: repoPath })
  } catch {
    // continue with stale data
  }

  const { stdout } = await execFileAsync(
    'git',
    ['branch', '-r', '--format=%(refname:short)'],
    { cwd: repoPath }
  )

  // Get branches already checked out in worktrees so we can exclude them
  const worktrees = await getWorktrees(repoPath)
  const usedBranches = new Set(worktrees.map((wt) => wt.branch))

  return stdout
    .trim()
    .split('\n')
    .filter((line) => line && !line.includes('->'))
    .map((ref) => ref.replace(/^origin\//, ''))
    .filter((branch) => !usedBranches.has(branch))
    .sort()
}

/**
 * Build the worktree path: ~/Developer/worktrees/<repoName>/<branch>
 * Slashes in branch names create nested dirs, which git worktree add handles fine.
 */
export function buildWorktreePath(repoName: string, branch: string): string {
  const slug = repoName.toLowerCase().replace(/\s+/g, '-')
  return path.join(os.homedir(), 'Developer', 'worktrees', slug, branch)
}

/**
 * Check a worktree for uncommitted changes and unpushed/unpulled commits.
 */
export async function getWorktreeStatus(
  worktreePath: string
): Promise<{ hasUncommittedChanges: boolean; unpushedCommits: number; unpulledCommits: number; linesAdded: number; linesDeleted: number }> {
  let hasUncommittedChanges = false
  let unpushedCommits = 0
  let unpulledCommits = 0
  let linesAdded = 0
  let linesDeleted = 0

  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: worktreePath
    })
    hasUncommittedChanges = stdout.trim().length > 0
  } catch {
    // If status fails, assume dirty to be safe
    hasUncommittedChanges = true
  }

  try {
    const { stdout } = await execFileAsync('git', ['diff', '--numstat', 'HEAD'], {
      cwd: worktreePath
    })
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const [added, deleted] = line.split('\t')
      // Binary files show '-' instead of a number
      linesAdded += parseInt(added) || 0
      linesDeleted += parseInt(deleted) || 0
    }
  } catch {
    // No commits yet or other error — leave at zero
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '@{u}..', '--oneline'],
      { cwd: worktreePath }
    )
    const lines = stdout.trim().split('\n').filter(Boolean)
    unpushedCommits = lines.length
  } catch {
    // No upstream configured or other error — treat as zero
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '..@{u}', '--oneline'],
      { cwd: worktreePath }
    )
    const lines = stdout.trim().split('\n').filter(Boolean)
    unpulledCommits = lines.length
  } catch {
    // No upstream configured or other error — treat as zero
  }

  return { hasUncommittedChanges, unpushedCommits, unpulledCommits, linesAdded, linesDeleted }
}

/**
 * Remove a worktree by its path. Must be run from the parent repository.
 * Pass force=true to remove worktrees with uncommitted changes or unpushed commits.
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force = false
): Promise<{ success: boolean; error?: string }> {
  const args = ['worktree', 'remove', worktreePath]
  if (force) args.push('--force')
  try {
    await execFileAsync('git', args, { cwd: repoPath })
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Add a new worktree. If isNewBranch is true, creates the branch off baseBranch.
 */
export async function addWorktree(
  repoPath: string,
  branch: string,
  worktreePath: string,
  isNewBranch: boolean,
  baseBranch?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = ['worktree', 'add']

    if (isNewBranch) {
      args.push('-b', branch, worktreePath, baseBranch || 'main')
    } else {
      args.push(worktreePath, branch)
    }

    await execFileAsync('git', args, { cwd: repoPath })
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
