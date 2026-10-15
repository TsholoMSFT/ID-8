import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { UseCase } from '@/lib/types'
import { UseCaseCard } from '../UseCaseCard'
import { UseCaseDialog } from '../UseCaseDialog'

vi.mock('@/components/KPISelector', () => ({ KPISelector: () => null }))

const useCase: UseCase = {
  id: 'u1', discoverySessionId: 's1', title: 'Service assistant', description: 'A service improvement opportunity.',
  impact: 5, feasibility: 5, rice: { reach: 100, users: 100, period: 'quarter', impact: 1, confidence: 50, effort: 1 },
  kpis: [], createdAt: 1,
}

describe('progressively disclosed use-case tools', () => {
  it('keeps editing and explicit decisions available in the named actions menu', async () => {
    const user = userEvent.setup()
    const edit = vi.fn()
    const update = vi.fn()
    render(<UseCaseCard useCase={useCase} scoringMethod="blended" onUpdate={update} onDelete={vi.fn()} onEdit={edit} />)
    await user.click(screen.getByRole('button', { name: 'Actions for Service assistant' }))
    expect(screen.getByRole('menuitem', { name: 'View business case' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitemradio', { name: 'Defer' }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', disposition: 'defer' }))
    await user.click(screen.getByRole('button', { name: 'Actions for Service assistant' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit use case' }))
    expect(edit).toHaveBeenCalledWith(useCase)
  })

  it('preserves the no-go solution guard in the simplified menu', async () => {
    const user = userEvent.setup()
    const blueprint = vi.fn()
    render(<UseCaseCard useCase={{ ...useCase, disposition: 'no-go', problemConfirmed: true, problemStatement: 'Improve service turnaround' }}
      scoringMethod="blended" onUpdate={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} onGenerateBlueprint={blueprint} />)
    await user.click(screen.getByRole('button', { name: 'Actions for Service assistant' }))
    expect(screen.getByRole('menuitem', { name: 'Draft solution blueprint' })).toHaveAttribute('data-disabled')
    expect(blueprint).not.toHaveBeenCalled()
  })

  it('starts with the essential fields while preserving hidden qualification values on save', async () => {
    const user = userEvent.setup()
    const save = vi.fn()
    render(<UseCaseDialog open onOpenChange={vi.fn()} onSave={save} editingUseCase={{ ...useCase, customerAccountable: 'Customer sponsor' }} />)
    const disclosure = screen.getByText('Owners and qualification (optional)').closest('details')
    expect(disclosure).not.toHaveAttribute('open')
    await user.click(screen.getByRole('button', { name: /Save Changes|Update Use Case/ }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Service assistant', customerAccountable: 'Customer sponsor' }))
  })
})
