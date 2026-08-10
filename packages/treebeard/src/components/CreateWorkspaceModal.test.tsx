import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateWorkspaceModal } from './CreateWorkspaceModal'
import { renderWithMantine } from '../test/render'

const createWorkspaceRequest = vi.fn()

vi.mock('../rpc', () => ({
  rpc: () => ({
    request: { 'workspace:create': createWorkspaceRequest }
  })
}))

describe('CreateWorkspaceModal', () => {
  beforeEach(() => {
    createWorkspaceRequest.mockReset()
  })

  it('creates an empty workspace using the fixed workspace root', async () => {
    createWorkspaceRequest.mockResolvedValue({
      success: true,
      workspace: {
        id: 'workspace-1',
        name: 'Authentication Refresh',
        path: '/Users/test/Developer/workspaces/authentication-refresh',
        members: []
      }
    })
    const onCreated = vi.fn()
    const onClose = vi.fn()

    renderWithMantine(<CreateWorkspaceModal opened={true} onClose={onClose} onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Authentication Refresh' } })
    expect(screen.getByText(/~\/Developer\/workspaces\/authentication-refresh/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(createWorkspaceRequest).toHaveBeenCalledWith({ name: 'Authentication Refresh' })
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'workspace-1' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
