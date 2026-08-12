import { describe, expect, it, vi } from 'vitest'
import { getPRForBranch, getPRStackDetails, getPRStackSummary } from './github'
import { setBunSpawnQueue, setBunSpawnResolver } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

describe('github service', () => {
  it('returns mapped PR and failing CI details', async () => {
    setBunSpawnQueue([
      {
        stdout: JSON.stringify({
          number: 12,
          url: 'https://github.com/acme/treebeard/pull/12',
          title: 'Improve tests',
          state: 'OPEN',
          isDraft: false,
          statusCheckRollup: [
            { status: 'COMPLETED', conclusion: 'SUCCESS', state: 'SUCCESS' },
            { status: 'COMPLETED', conclusion: 'FAILURE', state: 'FAILURE' }
          ]
        })
      }
    ])

    const pr = await getPRForBranch('/repo', 'feat/tests', 'acme/treebeard')
    expect(pr).toEqual({
      number: 12,
      url: 'https://github.com/acme/treebeard/pull/12',
      title: 'Improve tests',
      state: 'OPEN',
      isDraft: false,
      ciStatus: 'FAILURE',
      ciFailed: 1,
      ciTotal: 2
    })
  })

  it('maps completed checks to success and in-flight checks to pending', async () => {
    setBunSpawnQueue([
      {
        stdout: JSON.stringify({
          number: 2,
          url: 'https://github.com/acme/treebeard/pull/2',
          title: 'Done',
          state: 'OPEN',
          isDraft: false,
          statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS', state: 'SUCCESS' }]
        })
      }
    ])
    await expect(getPRForBranch('/repo', 'feat/success', 'acme/treebeard')).resolves.toMatchObject({
      ciStatus: 'SUCCESS',
      ciFailed: 0,
      ciTotal: 1
    })

    setBunSpawnQueue([
      {
        stdout: JSON.stringify({
          number: 3,
          url: 'https://github.com/acme/treebeard/pull/3',
          title: 'Running',
          state: 'OPEN',
          isDraft: true,
          statusCheckRollup: [{ status: 'IN_PROGRESS', conclusion: '', state: 'PENDING' }]
        })
      }
    ])
    await expect(getPRForBranch('/repo', 'feat/pending', 'acme/treebeard')).resolves.toMatchObject({
      ciStatus: 'PENDING',
      ciFailed: 0,
      ciTotal: 1,
      isDraft: true
    })
  })

  it('returns null when gh invocation fails', async () => {
    setBunSpawnQueue([{ stderr: 'not authenticated', exitCode: 1 }])
    await expect(getPRForBranch('/repo', 'feat/a', 'acme/treebeard')).resolves.toBeNull()
  })

  it('returns stack layers in bottom-to-top order from the checked-out worktree', async () => {
    const spawn = setBunSpawnQueue([
      {
        stdout: JSON.stringify({
          trunk: 'main',
          branches: [
            {
              name: 'feat/foundation',
              isCurrent: false,
              isMerged: true,
              needsRebase: false,
              pr: { number: 10, url: 'https://github.com/acme/treebeard/pull/10', state: 'MERGED' }
            },
            {
              name: 'feat/ui',
              isCurrent: true,
              isMerged: false,
              needsRebase: true,
              pr: { number: 11, url: 'https://github.com/acme/treebeard/pull/11', state: 'OPEN' }
            }
          ]
        })
      }
    ])

    await expect(getPRStackSummary('/repo/worktrees/ui')).resolves.toEqual({
      trunk: 'main',
      layers: [
        {
          branch: 'feat/foundation',
          isCurrent: false,
          isMerged: true,
          needsRebase: false,
          pr: { number: 10, url: 'https://github.com/acme/treebeard/pull/10', state: 'MERGED' }
        },
        {
          branch: 'feat/ui',
          isCurrent: true,
          isMerged: false,
          needsRebase: true,
          pr: { number: 11, url: 'https://github.com/acme/treebeard/pull/11', state: 'OPEN' }
        }
      ]
    })

    expect(spawn).toHaveBeenCalledWith(
      ['gh', 'stack', 'view', '--json'],
      expect.objectContaining({ cwd: '/repo/worktrees/ui' })
    )
  })

  it('returns null when the current worktree is not in a stack', async () => {
    setBunSpawnQueue([{ stderr: 'not part of a stack', exitCode: 2 }])
    await expect(getPRStackSummary('/repo/worktrees/feature')).resolves.toBeNull()
  })

  it('enriches each stack PR while retaining layers whose detail lookup fails', async () => {
    setBunSpawnResolver((command) => {
      if (command[1] === 'stack') {
        return {
          stdout: JSON.stringify({
            trunk: 'main',
            branches: [
              {
                name: 'feat/api',
                isCurrent: false,
                isMerged: false,
                needsRebase: false,
                pr: { number: 12, url: 'https://github.com/acme/treebeard/pull/12', state: 'OPEN' }
              },
              {
                name: 'feat/ui',
                isCurrent: true,
                isMerged: false,
                needsRebase: false,
                pr: { number: 13, url: 'https://github.com/acme/treebeard/pull/13', state: 'OPEN' }
              }
            ]
          })
        }
      }

      if (command[3] === '12') {
        return {
          stdout: JSON.stringify({
            number: 12,
            url: 'https://github.com/acme/treebeard/pull/12',
            title: 'Add API',
            state: 'OPEN',
            isDraft: false,
            statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS', state: 'SUCCESS' }]
          })
        }
      }

      return { stderr: 'PR unavailable', exitCode: 1 }
    })

    const stack = await getPRStackDetails('/repo/worktrees/ui', 'acme/treebeard')
    expect(stack?.layers).toHaveLength(2)
    expect(stack?.layers[0].prInfo).toMatchObject({ number: 12, ciStatus: 'SUCCESS' })
    expect(stack?.layers[1]).toMatchObject({
      branch: 'feat/ui',
      pr: { number: 13, url: 'https://github.com/acme/treebeard/pull/13', state: 'OPEN' },
      prInfo: null
    })
  })
})
