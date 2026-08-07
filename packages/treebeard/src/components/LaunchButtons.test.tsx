import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LaunchButtons } from './LaunchButtons'
import { renderWithMantine } from '../test/render'

const launchIdeRequest = vi.fn()
const launchGhosttyRequest = vi.fn()
const launchKiroCrewRequest = vi.fn()
const kiroCrewAvailableRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: {
      'launch:ide': launchIdeRequest,
      'launch:ghostty': launchGhosttyRequest,
      'launch:kiroCrew': launchKiroCrewRequest,
      'system:kiroCrewAvailable': kiroCrewAvailableRequest,
    }
  })
}))

describe('LaunchButtons', () => {
  beforeEach(() => {
    launchIdeRequest.mockReset()
    launchGhosttyRequest.mockReset()
    launchKiroCrewRequest.mockReset()
    kiroCrewAvailableRequest.mockReset()
    launchIdeRequest.mockResolvedValue(undefined)
    launchGhosttyRequest.mockResolvedValue(undefined)
    launchKiroCrewRequest.mockResolvedValue({ success: true })
    kiroCrewAvailableRequest.mockResolvedValue(true)
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
  })

  it('launches configured IDE, Ghostty, and Kiro Crew for the selected worktree', async () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(4)
    })

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    fireEvent.click(buttons[2])

    expect(launchIdeRequest).toHaveBeenCalledWith({ ideId: 'vscode', worktreePath: '/repo/worktrees/feat' })
    expect(launchGhosttyRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
    expect(launchKiroCrewRequest).toHaveBeenCalledWith({ worktreePath: '/repo/worktrees/feat' })
  })

  it('copies the worktree path to clipboard', async () => {
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(4)
    })

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

  it('shows Kiro Crew failures', async () => {
    launchKiroCrewRequest.mockResolvedValue({ success: false, error: 'Kiro Crew is unavailable.' })
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(4)
    })
    fireEvent.click(screen.getAllByRole('button')[2])

    expect(await screen.findByText('Kiro Crew is unavailable.')).toBeTruthy()
  })

  it('hides Kiro Crew when its CLI or desktop app is unavailable', async () => {
    kiroCrewAvailableRequest.mockResolvedValue(false)
    renderWithMantine(<LaunchButtons worktreePath={'/repo/worktrees/feat'} defaultIde="vscode" />)

    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(3)
    })
  })
})
