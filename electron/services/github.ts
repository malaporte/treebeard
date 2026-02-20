import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PRInfo } from '../types'

const execFileAsync = promisify(execFile)

export async function getPRForBranch(
  repoPath: string,
  branch: string,
  ghRepo: string
): Promise<PRInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'pr',
        'view',
        branch,
        '--json',
        'number,url,title,state,isDraft,statusCheckRollup',
        '-R',
        ghRepo
      ],
      { cwd: repoPath, timeout: 15000 }
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
  } catch {
    return null
  }
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
