import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LaunchButtons } from './LaunchButtons'
import { renderWithMantine } from '../test/render'

const launchIdeRequest = vi.fn()
const launchGhosttyRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'launch:ide': launchIdeRequest,
      'launch:ghostty': launchGhosttyRequest,
    }
  })
}))

describe('LaunchButtons', () => {
  beforeEach(() => {
    launchIdeRequest.mockReset()
    launchGhosttyRequest.mockReset()
    launchIdeRequest.mockResolvedValue(undefined)
    launchGhosttyRequest.mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
  })

  it('launches configured IDE and Ghostty for the selected worktree', async () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(3)
    })

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])

    expect(launchIdeRequest).toHaveBeenCalledWith({ ideId: 'vscode', worktreePath: '/repo/worktrees/feat' })
    expect(launchGhosttyRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
  })

  it('copies the worktree path to clipboard', async () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(3)
    })

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[2])

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/repo/worktrees/feat')
  })

  it('uses the configured IDE when set to intellij', () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="intellij" />)

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])

    expect(launchIdeRequest).toHaveBeenCalledWith({ ideId: 'intellij', worktreePath: '/repo/worktrees/feat' })
  })
})
