import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LaunchButtons } from './LaunchButtons'
import { renderWithMantine } from '../test/render'

const launchVSCodeRequest = vi.fn()
const launchGhosttyRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'launch:vscode': launchVSCodeRequest,
      'launch:ghostty': launchGhosttyRequest
    }
  })
}))

describe('LaunchButtons', () => {
  beforeEach(() => {
    launchVSCodeRequest.mockReset()
    launchGhosttyRequest.mockReset()
    launchVSCodeRequest.mockResolvedValue(undefined)
    launchGhosttyRequest.mockResolvedValue(undefined)
  })

  it('launches VS Code and Ghostty for the selected worktree', () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} />)

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])

    expect(launchVSCodeRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
    expect(launchGhosttyRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
  })
})
