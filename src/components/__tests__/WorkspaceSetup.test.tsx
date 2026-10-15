import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSetup } from '../WorkspaceSetup'

vi.mock('@/components/NavigationHeader', () => ({ NavigationHeader: () => null }))

describe('customer workspace setup', () => {
  beforeEach(() => { localStorage.clear() })

  it('requires a customer name and creates a workspace with no AI call', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    render(<WorkspaceSetup customers={[]} onCreate={create} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Create workspace' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a customer name')
    expect(create).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: 'Customer name' }), '  ABSA  ')
    await user.click(screen.getByRole('button', { name: 'Create workspace' }))
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith({ customerName: 'ABSA', industry: 'general', entityType: 'public-company' })
  })

  it('preserves an unfinished setup across an unmount and refresh', async () => {
    const user = userEvent.setup()
    const first = render(<WorkspaceSetup customers={[]} onCreate={vi.fn()} onCancel={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Customer name' }), 'Customer draft')
    first.unmount()
    render(<WorkspaceSetup customers={[]} onCreate={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Customer name' })).toHaveValue('Customer draft')
  })

  it('offers to open an existing customer instead of silently duplicating them', async () => {
    const user = userEvent.setup()
    render(<WorkspaceSetup customers={[{ id: 'c1', name: 'ABSA', innovationHubSPOC: 'Existing contact', createdAt: 1 }]} onCreate={vi.fn()} onCancel={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Customer name' }), 'absa')
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Organization type' })).not.toBeInTheDocument()
  })
})
