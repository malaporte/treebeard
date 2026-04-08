import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LaunchButtons } from './LaunchButtons'
import { renderWithMantine } from '../test/render'

const launchIdeRequest = vi.fn()
const launchGhosttyRequest = vi.fn()
const launchPippinShellRequest = vi.fn()
const systemPippinPathRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'launch:ide': launchIdeRequest,
      'launch:ghostty': launchGhosttyRequest,
      'launch:pippinShell': launchPippinShellRequest,
      'system:pippinPath': systemPippinPathRequest
    }
  })
}))

describe('LaunchButtons', () => {
  beforeEach(() => {
    launchIdeRequest.mockReset()
    launchGhosttyRequest.mockReset()
    launchPippinShellRequest.mockReset()
    systemPippinPathRequest.mockReset()
    launchIdeRequest.mockResolvedValue(undefined)
    launchGhosttyRequest.mockResolvedValue(undefined)
    launchPippinShellRequest.mockResolvedValue(undefined)
    systemPippinPathRequest.mockResolvedValue('/opt/homebrew/bin/pippin')
  })

  it('launches configured IDE, Ghostty, and Pippin shell for the selected worktree', async () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(3)
    })

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    fireEvent.click(buttons[2])

    expect(launchIdeRequest).toHaveBeenCalledWith({ ideId: 'vscode', worktreePath: '/repo/worktrees/feat' })
    expect(launchGhosttyRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
    expect(launchPippinShellRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
  })

  it('hides the Pippin shell button when pippin is unavailable', async () => {
    systemPippinPathRequest.mockResolvedValue(null)

    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(2)
    })
  })

  it('uses the configured IDE when set to intellij', () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="intellij" />)

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])

    expect(launchIdeRequest).toHaveBeenCalledWith({ ideId: 'intellij', worktreePath: '/repo/worktrees/feat' })
  })
})
