import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PRStackDetails } from './PRStackDetails'
import { renderWithMantine } from '../test/render'

describe('PRStackDetails', () => {
  it('renders ordered stack layers with fallback PR state and enriched statuses', () => {
    renderWithMantine(
      <PRStackDetails
        opened
        loading={false}
        summary={{
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
              needsRebase: false,
              pr: { number: 11, url: 'https://github.com/acme/treebeard/pull/11', state: 'OPEN' }
            },
            {
              branch: 'feat/cleanup',
              isCurrent: false,
              isMerged: false,
              needsRebase: true,
              pr: null
            }
          ]
        }}
        details={{
          trunk: 'main',
          layers: [
            {
              branch: 'feat/foundation',
              isCurrent: false,
              isMerged: true,
              needsRebase: false,
              pr: { number: 10, url: 'https://github.com/acme/treebeard/pull/10', state: 'MERGED' },
              prInfo: null
            },
            {
              branch: 'feat/ui',
              isCurrent: true,
              isMerged: false,
              needsRebase: false,
              pr: { number: 11, url: 'https://github.com/acme/treebeard/pull/11', state: 'OPEN' },
              prInfo: {
                number: 11,
                url: 'https://github.com/acme/treebeard/pull/11',
                title: 'Add UI',
                state: 'OPEN',
                isDraft: true,
                ciStatus: 'FAILURE',
                ciFailed: 1,
                ciTotal: 2
              }
            },
            {
              branch: 'feat/cleanup',
              isCurrent: false,
              isMerged: false,
              needsRebase: true,
              pr: null,
              prInfo: null
            }
          ]
        }}
      />
    )

    expect(screen.getByText('Stack from main')).toBeTruthy()
    expect(screen.getByText('1/3')).toBeTruthy()
    expect(screen.getByText('feat/foundation')).toBeTruthy()
    expect(screen.getByText('feat/ui')).toBeTruthy()
    expect(screen.getByText('current')).toBeTruthy()
    expect(screen.getByText('1/2')).toBeTruthy()
    expect(screen.getByText('Rebase')).toBeTruthy()
    expect(screen.getByText('No PR')).toBeTruthy()

    fireEvent.click(screen.getByText('#10 merged'))
    expect(window.open).toHaveBeenCalledWith('https://github.com/acme/treebeard/pull/10', '_blank')
  })

  it('does not render a one-layer stack', () => {
    renderWithMantine(
      <PRStackDetails
        opened
        loading={false}
        details={null}
        summary={{
          trunk: 'main',
          layers: [{ branch: 'feat/one', isCurrent: true, isMerged: false, needsRebase: false, pr: null }]
        }}
      />
    )

    expect(screen.queryByText('Stack from main')).toBeNull()
  })
})
