import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LaunchButtons } from './LaunchButtons'
import { renderWithMantine } from '../test/render'

const launchVSCodeRequest = vi.fn()
const launchGhosttyRequest = vi.fn()
const launchCodexDesktopRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'launch:vscode': launchVSCodeRequest,
      'launch:ghostty': launchGhosttyRequest,
      'launch:codexDesktop': launchCodexDesktopRequest
    }
  })
}))

describe('LaunchButtons', () => {
  beforeEach(() => {
    launchVSCodeRequest.mockReset()
    launchGhosttyRequest.mockReset()
    launchCodexDesktopRequest.mockReset()
    launchVSCodeRequest.mockResolvedValue(undefined)
    launchGhosttyRequest.mockResolvedValue(undefined)
    launchCodexDesktopRequest.mockResolvedValue({ success: true })
  })

  it('launches VS Code, Ghostty, and Codex desktop for the selected worktree', () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} />)

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    fireEvent.click(buttons[2])

    expect(launchVSCodeRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
    expect(launchGhosttyRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
    expect(launchCodexDesktopRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
  })

  it('shows loading state while codex desktop launch is in flight', async () => {
    const deferred: { resolve: ((value: { success: boolean }) => void) | null } = { resolve: null }
    launchCodexDesktopRequest.mockReturnValue(new Promise((resolve) => {
      deferred.resolve = resolve
    }))

    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} />)

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[2])

    expect((buttons[2] as HTMLButtonElement).disabled).toBe(true)

    if (deferred.resolve) {
      deferred.resolve({ success: true })
    }
    await vi.waitFor(() => {
      expect((buttons[2] as HTMLButtonElement).disabled).toBe(false)
    })
  })
})
