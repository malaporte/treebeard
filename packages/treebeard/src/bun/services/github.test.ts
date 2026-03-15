import { describe, expect, it, vi } from 'vitest'
import { getPRForBranch } from './github'
import { setBunSpawnQueue } from '../../test/bun'

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
})
