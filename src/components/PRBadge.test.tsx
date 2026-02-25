import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PRBadge } from './PRBadge'
import { renderWithMantine } from '../test/render'

describe('PRBadge', () => {
  it('renders loading and empty states', () => {
    const { rerender } = renderWithMantine(<PRBadge pr={null} loading={true} />)
    expect(screen.getByText('PR...')).toBeTruthy()

    rerender(<PRBadge pr={null} loading={false} />)
    expect(screen.getByText('No PR')).toBeTruthy()
  })

  it('renders PR and opens URL on click', () => {
    renderWithMantine(
      <PRBadge
        loading={false}
        pr={{
          number: 42,
          url: 'https://github.com/acme/treebeard/pull/42',
          title: 'Improve CI visibility',
          state: 'OPEN',
          isDraft: false,
          ciStatus: 'FAILURE',
          ciFailed: 1,
          ciTotal: 3
        }}
      />
    )

    const prBadge = screen.getByText('#42 open')
    fireEvent.click(prBadge)

    expect(window.open).toHaveBeenCalledWith('https://github.com/acme/treebeard/pull/42', '_blank')
    expect(screen.getByText('1/3')).toBeTruthy()
  })
})
