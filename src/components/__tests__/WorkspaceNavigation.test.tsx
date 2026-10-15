import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceContinue, WorkspaceNavigation } from '../WorkspaceNavigation'
import type { Customer, DiscoverySession } from '@/lib/types'

const customer: Customer = { id: 'c1', name: 'ABSA', innovationHubSPOC: '', createdAt: 1 }
const session: DiscoverySession = {
  id: 's1', customerId: 'c1', customerName: 'ABSA', name: 'ABSA workspace', responses: [],
  innovationHubLocation: '', solutionEngineer: '', accountTeamRep: '', primaryStakeholder: '', createdAt: 1,
}

describe('workspace step navigation', () => {
  it('shows the customer, accurate progress, and five keyboard-accessible steps', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(<WorkspaceNavigation customers={[customer]} sessions={[session]} customer={customer} session={session}
      step="discover" onStepChange={change} onSelectCustomer={vi.fn()} onSelectSession={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ABSA')
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discover' })).toHaveAttribute('aria-current', 'step')
    screen.getByRole('button', { name: 'Plan' }).focus()
    await user.keyboard('{Enter}')
    expect(change).toHaveBeenCalledWith('plan')
  })

  it('allows skipping optional research and does not invent a stage after Export', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    const { rerender } = render(<WorkspaceContinue step="research" onStepChange={change} />)
    expect(screen.getByText('Research is optional. Continue when you are ready.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to Discover' }))
    expect(change).toHaveBeenCalledWith('discover')
    rerender(<WorkspaceContinue step="export" onStepChange={change} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
