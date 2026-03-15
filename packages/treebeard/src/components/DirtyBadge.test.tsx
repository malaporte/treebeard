import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DirtyBadge } from './DirtyBadge'
import { renderWithMantine } from '../test/render'

describe('DirtyBadge', () => {
  it('renders loading indicator and hides empty state', () => {
    const { container, rerender } = renderWithMantine(<DirtyBadge status={null} loading={true} />)
    expect(container.querySelector('.mantine-Loader-root')).toBeTruthy()

    rerender(
      <DirtyBadge
        loading={false}
        status={{
          hasUncommittedChanges: false,
          linesAdded: 0,
          linesDeleted: 0,
          unpushedCommits: 0,
          unpulledCommits: 0
        }}
      />
    )
    expect(screen.queryByText('+0')).toBeNull()
    expect(screen.queryByText('-0')).toBeNull()
    expect(screen.queryByText('↑0')).toBeNull()
    expect(screen.queryByText('↓0')).toBeNull()
  })

  it('renders all non-zero counters', () => {
    renderWithMantine(
      <DirtyBadge
        loading={false}
        status={{
          hasUncommittedChanges: true,
          linesAdded: 7,
          linesDeleted: 2,
          unpushedCommits: 3,
          unpulledCommits: 1
        }}
      />
    )

    expect(screen.getByText('+7')).toBeTruthy()
    expect(screen.getByText('-2')).toBeTruthy()
    expect(screen.getByText('↑3')).toBeTruthy()
    expect(screen.getByText('↓1')).toBeTruthy()
  })
})
