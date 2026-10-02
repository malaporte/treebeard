import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LaunchButtons } from './LaunchButtons'
import { renderWithMantine } from '../test/render'

const launchIdeRequest = vi.fn()
const launchGhosttyRequest = vi.fn()
const launchClaudeDesktopRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'launch:ide': launchIdeRequest,
      'launch:ghostty': launchGhosttyRequest,
      'launch:claudeDesktop': launchClaudeDesktopRequest,
    }
  })
}))

describe('LaunchButtons', () => {
  beforeEach(() => {
    launchIdeRequest.mockReset()
    launchGhosttyRequest.mockReset()
    launchClaudeDesktopRequest.mockReset()
    launchIdeRequest.mockResolvedValue(undefined)
    launchGhosttyRequest.mockResolvedValue(undefined)
    launchClaudeDesktopRequest.mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
  })

  it('launches configured IDE and Ghostty for the selected worktree', () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])

    expect(launchIdeRequest).toHaveBeenCalledWith({ ideId: 'vscode', worktreePath: '/repo/worktrees/feat' })
    expect(launchGhosttyRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
  })

  it('opens the worktree in Claude Code Desktop', () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[2])

    expect(launchClaudeDesktopRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
  })

  it('copies the worktree path to clipboard', () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[3])

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/repo/worktrees/feat')
  })

  it('uses the configured IDE when set to intellij', () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="intellij" />)

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])

    expect(launchIdeRequest).toHaveBeenCalledWith({ ideId: 'intellij', worktreePath: '/repo/worktrees/feat' })
  })
})
