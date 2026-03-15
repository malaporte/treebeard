import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SandboxIndicator } from './SandboxIndicator'
import { renderWithMantine } from '../test/render'
import type { SandboxStatus } from '../shared/types'

const STOPPED: SandboxStatus = { state: 'stopped', port: null, controlUiPort: null, error: null }
const RUNNING: SandboxStatus = { state: 'running', port: 9111, controlUiPort: 18080, error: null }
const STARTING: SandboxStatus = { state: 'starting', port: null, controlUiPort: null, error: null }
const STOPPING: SandboxStatus = { state: 'stopping', port: null, controlUiPort: null, error: null }
const ERROR_STATUS: SandboxStatus = { state: 'error', port: null, controlUiPort: null, error: 'leash exited unexpectedly' }

describe('SandboxIndicator', () => {
  it('renders stopped state with off icon', () => {
    renderWithMantine(
      <SandboxIndicator status={STOPPED} loading={false} onStart={vi.fn()} onStop={vi.fn()} />
    )

    const button = screen.getByRole('button')
    expect(button).toBeTruthy()
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('renders running state and is clickable', () => {
    const onStop = vi.fn()
    renderWithMantine(
      <SandboxIndicator status={RUNNING} loading={false} onStart={vi.fn()} onStop={onStop} />
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('calls onStart when stopped and clicked', () => {
    const onStart = vi.fn()
    renderWithMantine(
      <SandboxIndicator status={STOPPED} loading={false} onStart={onStart} onStop={vi.fn()} />
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('calls onStart when in error state and clicked', () => {
    const onStart = vi.fn()
    renderWithMantine(
      <SandboxIndicator status={ERROR_STATUS} loading={false} onStart={onStart} onStop={vi.fn()} />
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('disables button while loading', () => {
    const onStart = vi.fn()
    renderWithMantine(
      <SandboxIndicator status={STOPPED} loading={true} onStart={onStart} onStop={vi.fn()} />
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('disables button while starting', () => {
    const onStart = vi.fn()
    renderWithMantine(
      <SandboxIndicator status={STARTING} loading={false} onStart={onStart} onStop={vi.fn()} />
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('disables button while stopping', () => {
    const onStop = vi.fn()
    renderWithMantine(
      <SandboxIndicator status={STOPPING} loading={false} onStart={vi.fn()} onStop={onStop} />
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onStop).not.toHaveBeenCalled()
  })

  it('renders with null status as stopped', () => {
    const onStart = vi.fn()
    renderWithMantine(
      <SandboxIndicator status={null} loading={false} onStart={onStart} onStop={vi.fn()} />
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onStart).toHaveBeenCalledOnce()
  })
})
