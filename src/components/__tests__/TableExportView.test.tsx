import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TableExportView } from '../TableExportView'

describe('guided report preview', () => {
  it('has an accessible title, close action, and the selected ranking method', () => {
    render(<TableExportView open onOpenChange={vi.fn()} useCases={[]} topUseCases={[]} scoringMethod="blended" />)
    expect(screen.getByRole('dialog', { name: 'Export Assessment Report' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close report preview' })).toBeInTheDocument()
    expect(screen.getByText('Balanced ranking explanation')).toBeInTheDocument()
    expect(screen.queryByText('Impact/Feasibility Matrix explanation')).not.toBeInTheDocument()
  })
})
