import { getShellEnv } from './shell-env'
import type { PRInfo, PRStackDetails, PRStackSummary, StackPR } from '../../shared/types'

const PR_JSON_FIELDS = 'number,url,title,state,isDraft,statusCheckRollup'

/** Run the gh CLI and return stdout. */
async function gh(args: string[], cwd: string, timeout = 15000): Promise<string> {
  const env = await getShellEnv()
  const proc = Bun.spawn(['gh', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', env })

  const timer = setTimeout(() => proc.kill(), timeout)
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  clearTimeout(timer)

  if (exitCode !== 0) {
    throw new Error(`gh exited with code ${exitCode}`)
  }
  return stdout
}

export async function getPRForBranch(
  repoPath: string,
  branch: string,
  ghRepo: string
): Promise<PRInfo | null> {
  try {
    return await getPR(repoPath, branch, ghRepo)
  } catch {
    return null
  }
}

/** Get stacked PR membership for the branch checked out in a worktree. */
export async function getPRStackSummary(worktreePath: string): Promise<PRStackSummary | null> {
  try {
    const stdout = await gh(['stack', 'view', '--json'], worktreePath)
    return parseStackSummary(JSON.parse(stdout))
  } catch {
    return null
  }
}

/** Get stacked PR membership enriched with GitHub PR and CI details. */
export async function getPRStackDetails(worktreePath: string, ghRepo: string): Promise<PRStackDetails | null> {
  const summary = await getPRStackSummary(worktreePath)
  if (!summary) return null

  const layers = await Promise.all(summary.layers.map(async (layer) => ({
    ...layer,
    prInfo: layer.pr ? await getPRForBranch(worktreePath, String(layer.pr.number), ghRepo) : null
  })))

  return { trunk: summary.trunk, layers }
}

async function getPR(repoPath: string, target: string, ghRepo: string): Promise<PRInfo> {
  const stdout = await gh(
    ['pr', 'view', target, '--json', PR_JSON_FIELDS, '-R', ghRepo],
    repoPath
  )

  const data = JSON.parse(stdout)
  const ci = mapCIStatus(data.statusCheckRollup)
  return {
    number: data.number,
    url: data.url,
    title: data.title,
    state: data.state as PRInfo['state'],
    isDraft: data.isDraft ?? false,
    ...ci
  }
}

function parseStackSummary(data: unknown): PRStackSummary | null {
  if (!isRecord(data) || typeof data.trunk !== 'string' || !Array.isArray(data.branches)) return null

  const layers: PRStackSummary['layers'] = []
  for (const branch of data.branches) {
    if (!isRecord(branch) || typeof branch.name !== 'string') return null

    layers.push({
      branch: branch.name,
      isCurrent: branch.isCurrent === true,
      isMerged: branch.isMerged === true,
      needsRebase: branch.needsRebase === true,
      pr: parseStackPR(branch.pr)
    })
  }

  return { trunk: data.trunk, layers }
}

function parseStackPR(value: unknown): StackPR | null {
  if (!isRecord(value) || typeof value.number !== 'number' || typeof value.url !== 'string') return null
  if (value.state !== 'OPEN' && value.state !== 'CLOSED' && value.state !== 'MERGED') return null

  return { number: value.number, url: value.url, state: value.state }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

interface CIResult {
  ciStatus: PRInfo['ciStatus']
  ciFailed: number
  ciTotal: number
}

function mapCIStatus(
  checks: Array<{ status: string; conclusion: string; state: string }> | null | undefined
): CIResult {
  if (!checks || checks.length === 0) return { ciStatus: null, ciFailed: 0, ciTotal: 0 }

  const total = checks.length
  const failed = checks.filter(
    (c) => c.conclusion === 'FAILURE' || c.conclusion === 'ERROR' || c.state === 'FAILURE'
  ).length

  if (failed > 0) return { ciStatus: 'FAILURE', ciFailed: failed, ciTotal: total }

  const allDone = checks.every(
    (c) => c.status === 'COMPLETED' || c.state === 'SUCCESS' || c.state === 'NEUTRAL'
  )
  if (allDone) return { ciStatus: 'SUCCESS', ciFailed: 0, ciTotal: total }

  return { ciStatus: 'PENDING', ciFailed: 0, ciTotal: total }
}
