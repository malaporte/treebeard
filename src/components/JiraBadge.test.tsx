import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JiraBadge } from './JiraBadge'
import { renderWithMantine } from '../test/render'

describe('JiraBadge', () => {
  it('renders fallback states', () => {
    const { rerender } = renderWithMantine(<JiraBadge jiraKey={null} issue={null} loading={false} />)
    expect(screen.getByText('No JIRA')).toBeTruthy()

    rerender(<JiraBadge jiraKey={'TB-1'} issue={null} loading={true} />)
    expect(screen.getByText('TB-1')).toBeTruthy()

    rerender(<JiraBadge jiraKey={'TB-1'} issue={null} loading={false} />)
    expect(screen.getByText('TB-1 (not found)')).toBeTruthy()
  })

  it('opens issue url when issue exists', () => {
    renderWithMantine(
      <JiraBadge
        jiraKey={'TB-8'}
        loading={false}
        issue={{
          key: 'TB-8',
          summary: 'Fix shortcut handling',
          status: 'In Progress',
          assignee: 'Sam',
          issueType: 'Task',
          url: 'https://acme.atlassian.net/browse/TB-8'
        }}
      />
    )

    fireEvent.click(screen.getByText('TB-8 · In Progress'))
    expect(window.open).toHaveBeenCalledWith('https://acme.atlassian.net/browse/TB-8', '_blank')
  })
})
