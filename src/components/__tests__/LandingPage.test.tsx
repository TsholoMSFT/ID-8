import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from '../LandingPage'
import type { Customer, DiscoverySession } from '@/lib/types'

vi.mock('@/components/AboutSection', () => ({ AboutSection: () => null }))
vi.mock('@/components/TemplateSelector', () => ({ TemplateSelector: () => null }))

const customer: Customer = { id: 'c1', name: 'ABSA', innovationHubSPOC: 'Existing contact', createdAt: 1 }
const session: DiscoverySession = {
  id: 's1', customerId: 'c1', customerName: 'ABSA', name: 'ABSA workspace', responses: [],
  innovationHubLocation: '', solutionEngineer: '', accountTeamRep: '', primaryStakeholder: '', createdAt: 1,
}
const props = {
  onStartNew: vi.fn(), onStartEnterpriseDiscovery: vi.fn(), onViewExisting: vi.fn(),
  onStartWorkspace: vi.fn(), onOpenWorkspace: vi.fn(),
}

describe('guided workspace home', () => {
  it('offers one clear starting action without requiring AI or an existing customer', async () => {
    const user = userEvent.setup()
    const start = vi.fn()
    render(<LandingPage {...props} customers={[]} onStartWorkspace={start} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('From customer insight to a clear plan.')
    expect(screen.queryByRole('button', { name: /Start Guided Discovery/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start a customer workspace' }))
    expect(start).toHaveBeenCalledOnce()
  })

  it('resumes the saved customer and session and shows their actual last step', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(<LandingPage {...props} customers={[customer]} sessions={[session]} onOpenWorkspace={open} workspaceSteps={{ s1: 'plan' }} lastWorkspaceSessionId="s1" />)
    expect(screen.getByText(/Continue with/)).toHaveTextContent('Continue with Plan')
    await user.click(screen.getByRole('button', { name: 'Continue recent work' }))
    expect(open).toHaveBeenCalledWith(customer, session)
  })

  it('searches customers without changing or deleting saved records', async () => {
    const user = userEvent.setup()
    render(<LandingPage {...props} customers={[customer]} sessions={[session]} />)
    await user.type(screen.getByRole('textbox', { name: 'Find a customer' }), 'not here')
    expect(screen.getByRole('status')).toHaveTextContent('No customers match')
    expect(screen.queryByRole('button', { name: 'Open workspace for ABSA' })).not.toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: 'Find a customer' }))
    expect(screen.getByRole('button', { name: 'Open workspace for ABSA' })).toBeInTheDocument()
  })

  it('keeps the existing tool library accessible but out of the default journey', async () => {
    const user = userEvent.setup()
    render(<LandingPage {...props} customers={[]} />)
    await user.click(screen.getByRole('button', { name: 'Advanced tools' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Advanced tools' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Guided Discovery' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to Home' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('From customer insight to a clear plan.')
  })

  it('can open the tool library directly from workspace navigation and return to Home', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    const { rerender } = render(<LandingPage {...props} customers={[]} toolLibraryOpen onToolLibraryOpenChange={change} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Advanced tools' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to Home' }))
    expect(change).toHaveBeenCalledWith(false)
    rerender(<LandingPage {...props} customers={[]} toolLibraryOpen={false} onToolLibraryOpenChange={change} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('From customer insight to a clear plan.')
  })
})
