import path from 'node:path'
import { getShellEnv } from './shell-env'
import type { Worktree, WorktreeStatus, SetupCommandResult } from '../../shared/types'

const MAIN_BRANCH_NAMES = new Set(['main', 'master', 'develop', 'trunk'])

/** Run a git command and return stdout. */
async function git(args: string[], cwd: string): Promise<string> {
  const env = await getShellEnv()
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', env })
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(stderr.trim() || `git ${args[0]} exited with code ${exitCode}`)
  }
  return stdout
}

/** Silently run a git command, returning stdout or null on failure. */
async function gitSilent(args: string[], cwd: string): Promise<string | null> {
  try {
    return await git(args, cwd)
  } catch {
    return null
  }
}

function parseWorktreeOutput(output: string): Worktree[] {
  const worktrees: Worktree[] = []
  const blocks = output.trim().split('\n\n')

  for (const block of blocks) {
    if (!block.trim()) continue

    const lines = block.trim().split('\n')
    let wtPath = ''
    let head = ''
    let branch = ''
    let isBare = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        wtPath = line.slice('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        branch = line.slice('branch '.length).replace('refs/heads/', '')
      } else if (line === 'bare') {
        isBare = true
      } else if (line === 'detached') {
        branch = '(detached)'
      }
    }

    if (isBare) continue

    worktrees.push({
      path: wtPath,
      branch,
      head,
      isMain: MAIN_BRANCH_NAMES.has(branch)
    })
  }

  return worktrees
}

export async function getWorktrees(repoPath: string): Promise<Worktree[]> {
  const stdout = await git(['worktree', 'list', '--porcelain'], repoPath)
  return parseWorktreeOutput(stdout)
}

/** Get the GitHub remote owner/repo for a git repository. */
export async function getGitHubRepo(repoPath: string): Promise<string | null> {
  const stdout = await gitSilent(['remote', 'get-url', 'origin'], repoPath)
  if (!stdout) return null

  const url = stdout.trim()

  const sshMatch = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  if (sshMatch) return sshMatch[1]

  const httpsMatch = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/)
  if (httpsMatch) return httpsMatch[1]

  return null
}

/** Detect the default branch for a repo (main, master, etc.). */
export async function getDefaultBranch(repoPath: string): Promise<string> {
  const stdout = await gitSilent(
    ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'],
    repoPath
  )
  if (stdout) return stdout.trim().replace(/^origin\//, '')

  for (const name of ['main', 'master']) {
    const result = await gitSilent(['rev-parse', '--verify', name], repoPath)
    if (result) return name
  }
  return 'main'
}

/**
 * List remote branches (fetches first), excluding HEAD pointers.
 * Also excludes branches that already have a local worktree.
 */
export async function getRemoteBranches(repoPath: string): Promise<string[]> {
  await gitSilent(['fetch', '--prune', 'origin'], repoPath)

  const stdout = await git(
    ['branch', '-r', '--format=%(refname:short)'],
    repoPath
  )

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

/** Build the worktree path: ~/Developer/worktrees/<repoName>/<branch> */
export function buildWorktreePath(repoName: string, branch: string): string {
  const homedir = Bun.env.HOME || process.env.HOME || ''
  const slug = repoName.toLowerCase().replace(/\s+/g, '-')
  return path.join(homedir, 'Developer', 'worktrees', slug, branch)
}

/** Check a worktree for uncommitted changes and unpushed/unpulled commits. */
export async function getWorktreeStatus(worktreePath: string): Promise<WorktreeStatus> {
  let hasUncommittedChanges = false
  let unpushedCommits = 0
  let unpulledCommits = 0
  let linesAdded = 0
  let linesDeleted = 0

  const statusOut = await gitSilent(['status', '--porcelain'], worktreePath)
  hasUncommittedChanges = statusOut !== null ? statusOut.trim().length > 0 : true

  const diffOut = await gitSilent(['diff', '--numstat', 'HEAD'], worktreePath)
  if (diffOut) {
    for (const line of diffOut.trim().split('\n').filter(Boolean)) {
      const [added, deleted] = line.split('\t')
      linesAdded += parseInt(added) || 0
      linesDeleted += parseInt(deleted) || 0
    }
  }

  const pushOut = await gitSilent(['log', '@{u}..', '--oneline'], worktreePath)
  if (pushOut) {
    const lines = pushOut.trim().split('\n').filter(Boolean)
    unpushedCommits = lines.length
  }

  const pullOut = await gitSilent(['log', '..@{u}', '--oneline'], worktreePath)
  if (pullOut) {
    const lines = pullOut.trim().split('\n').filter(Boolean)
    unpulledCommits = lines.length
  }

  return { hasUncommittedChanges, unpushedCommits, unpulledCommits, linesAdded, linesDeleted }
}

/** Fetch from origin (with prune) for a repo. */
export async function fetchRepo(repoPath: string): Promise<void> {
  await gitSilent(['fetch', '--prune', 'origin'], repoPath)
}

/** Pull the latest changes from upstream in a worktree. */
export async function pullWorktree(worktreePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    await git(['pull'], worktreePath)
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/** Remove a worktree by its path. */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force = false
): Promise<{ success: boolean; error?: string }> {
  const args = ['worktree', 'remove', worktreePath]
  if (force) args.push('--force')
  try {
    await git(args, repoPath)
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/** Rename a worktree by moving it to a new path within the same parent directory. */
export async function renameWorktree(
  repoPath: string,
  worktreePath: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  const parentDir = path.dirname(worktreePath)
  const newPath = path.join(parentDir, newName)
  try {
    await git(['worktree', 'move', worktreePath, newPath], repoPath)
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/** Add a new worktree. If isNewBranch is true, creates the branch off baseBranch. */
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

    await git(args, repoPath)
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

const SETUP_COMMAND_TIMEOUT_MS = 300_000

/** Run setup commands sequentially in a worktree directory. Stops on first failure. */
export async function runSetupCommands(
  worktreePath: string,
  commands: string[]
): Promise<{ results: SetupCommandResult[]; allSucceeded: boolean }> {
  const shell = Bun.env.SHELL || '/bin/zsh'
  const env = await getShellEnv()
  const results: SetupCommandResult[] = []

  for (const command of commands) {
    try {
      const proc = Bun.spawn([shell, '-ilc', command], {
        cwd: worktreePath,
        stdout: 'pipe',
        stderr: 'pipe',
        env
      })

      const timer = setTimeout(() => proc.kill(), SETUP_COMMAND_TIMEOUT_MS)
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited
      clearTimeout(timer)

      const output = (stdout + stderr).trim()

      if (exitCode !== 0) {
        results.push({ command, success: false, output })
        return { results, allSucceeded: false }
      }

      results.push({ command, success: true, output })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ command, success: false, output: message })
      return { results, allSucceeded: false }
    }
  }

  return { results, allSucceeded: true }
}
