import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanyInsight } from '@/lib/company-research-service'
import { CompanyResearch } from '../CompanyResearch'

const service = vi.hoisted(() => ({
  extractInsightsFromText: vi.fn(), extractTextFromFile: vi.fn(), generateResearchSummary: vi.fn(),
  fetchRSSFromBlobStorage: vi.fn(), searchCompanyNews: vi.fn(), fetchCompanyFilings: vi.fn(),
  fetchCompanyProfile: vi.fn(), fetchPublicSectorSignals: vi.fn(),
  rssItemsToText: vi.fn((items: { title: string }[], limit: number) => items.slice(0, limit).map((item) => item.title).join('\n')),
}))
vi.mock('@/lib/company-research-service', () => ({
  ...service, companyProfileToText: vi.fn(), getCategoryColor: () => '', SUGGESTED_RSS_FEEDS: [],
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const insight: CompanyInsight = {
  id: 'insight-1', category: 'operations', title: 'Improve service turnaround',
  summary: 'Source evidence describes a service opportunity.', relevanceToAI: 'Assist service teams.',
  potentialUseCases: ['Service assistant'], source: 'Regulatory Filings', confidence: 'high', extractedDate: '2026-10-15',
}
const filings = Array.from({ length: 45 }, (_, index) => ({
  title: `Filing ${index + 1}`, link: `https://example.test/filing-${index + 1}`,
  description: 'Public filing content', pubDate: '2026-10-15',
}))
const props = { companyName: 'ABSA', entityType: 'public-company' as const, persistenceKey: 's1', onInsightsChange: vi.fn() }

describe('guided company research', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    service.extractInsightsFromText.mockResolvedValue([insight])
    service.extractTextFromFile.mockResolvedValue('Document evidence')
    service.fetchCompanyFilings.mockResolvedValue({ items: filings, source: 'JSE' })
  })

  it('groups inputs into three entry points and never runs AI on mount', () => {
    render(<CompanyResearch {...props} />)
    const inputTabs = within(screen.getAllByRole('tablist')[0]).getAllByRole('tab')
    expect(inputTabs.map((tab) => tab.textContent)).toEqual(['Online sources', 'Documents', 'Paste text'])
    expect(screen.getByRole('tab', { name: 'Filings' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: 'Public sector' })).not.toBeInTheDocument()
    expect(service.extractInsightsFromText).not.toHaveBeenCalled()
    expect(service.fetchCompanyFilings).not.toHaveBeenCalled()
  })

  it('keeps additional source types accessible without making them the default', async () => {
    const user = userEvent.setup()
    render(<CompanyResearch {...props} />)
    await user.click(screen.getByRole('button', { name: 'More source types' }))
    expect(screen.getByRole('tab', { name: 'Public sector' })).toBeInTheDocument()
    expect(service.extractInsightsFromText).not.toHaveBeenCalled()
  })

  it('shows the exact 12-of-45 filings scope and makes one extraction request', async () => {
    const user = userEvent.setup()
    const save = vi.fn()
    render(<CompanyResearch {...props} onInsightsChange={save} />)
    await user.click(screen.getByRole('button', { name: 'Load filings' }))
    expect(await screen.findByText('The first 12 will be analyzed.')).toBeInTheDocument()
    expect(screen.getByText(/45 filings loaded/)).toBeInTheDocument()
    expect(service.extractInsightsFromText).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Analyze 12 filings' }))
    expect(await screen.findByText(insight.title)).toBeInTheDocument()
    expect(service.rssItemsToText).toHaveBeenCalledWith(filings, 12)
    expect(service.extractInsightsFromText).toHaveBeenCalledOnce()
    expect(service.extractInsightsFromText).toHaveBeenCalledWith(expect.any(String), 'ABSA', 'Regulatory Filings', 'public-company')
    expect(save).toHaveBeenCalledWith([insight], { type: 'append', insights: [insight] })
  })

  it('retains text and loaded feeds after a remount without replaying AI', async () => {
    const user = userEvent.setup()
    const first = render(<CompanyResearch {...props} />)
    await user.click(screen.getByRole('button', { name: 'Load filings' }))
    await screen.findByRole('button', { name: 'Analyze 12 filings' })
    await user.click(screen.getByRole('tab', { name: 'Paste text' }))
    await user.type(screen.getByLabelText('Paste Content'), 'An unfinished customer research draft.')
    first.unmount()
    render(<CompanyResearch {...props} />)
    expect(screen.getByLabelText('Paste Content')).toHaveValue('An unfinished customer research draft.')
    await user.click(screen.getByRole('tab', { name: 'Online sources' }))
    expect(screen.getByRole('button', { name: 'Analyze 12 filings' })).toBeInTheDocument()
    expect(service.fetchCompanyFilings).toHaveBeenCalledOnce()
    expect(service.extractInsightsFromText).not.toHaveBeenCalled()
  })

  it('does not leak a different session draft into another customer workspace', async () => {
    const user = userEvent.setup()
    const first = render(<CompanyResearch {...props} />)
    await user.click(screen.getByRole('tab', { name: 'Paste text' }))
    await user.type(screen.getByLabelText('Paste Content'), 'ABSA-only notes')
    first.unmount()
    render(<CompanyResearch {...props} companyName="Another customer" persistenceKey="s2" />)
    await user.click(screen.getByRole('tab', { name: 'Paste text' }))
    expect(screen.getByLabelText('Paste Content')).toHaveValue('')
  })

  it('requires an explicit analysis action after file selection', async () => {
    const user = userEvent.setup()
    render(<CompanyResearch {...props} />)
    await user.click(screen.getByRole('tab', { name: 'Documents' }))
    const file = new File(['Document evidence'], 'report.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText('Choose a research document'), file)
    expect(service.extractTextFromFile).not.toHaveBeenCalled()
    expect(service.extractInsightsFromText).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Analyze document' }))
    expect(await screen.findByText(insight.title)).toBeInTheDocument()
    expect(service.extractTextFromFile).toHaveBeenCalledWith(file)
    expect(service.extractInsightsFromText).toHaveBeenCalledOnce()
  })

  it('shows a provider error inline, keeps the source text, and never retries automatically', async () => {
    const user = userEvent.setup()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    service.extractInsightsFromText.mockRejectedValue(new Error('Daily AI quota reached'))
    render(<CompanyResearch {...props} />)
    await user.click(screen.getByRole('tab', { name: 'Paste text' }))
    await user.type(screen.getByLabelText('Paste Content'), 'Keep this source text after the error.')
    await user.click(screen.getByRole('button', { name: 'Analyze text' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Daily AI quota reached')
    expect(screen.getByLabelText('Paste Content')).toHaveValue('Keep this source text after the error.')
    expect(service.extractInsightsFromText).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('commits completed insights even if the user navigates away during extraction', async () => {
    const user = userEvent.setup()
    let complete: (items: CompanyInsight[]) => void = () => { throw new Error('Extraction was not started') }
    service.extractInsightsFromText.mockReturnValue(new Promise<CompanyInsight[]>((resolve) => { complete = resolve }))
    const save = vi.fn()
    const view = render(<CompanyResearch {...props} onInsightsChange={save} />)
    await user.click(screen.getByRole('tab', { name: 'Paste text' }))
    await user.type(screen.getByLabelText('Paste Content'), 'Source evidence for the current customer.')
    await user.click(screen.getByRole('button', { name: 'Analyze text' }))
    view.unmount()
    await act(async () => { complete([insight]) })
    expect(save).toHaveBeenCalledWith([insight], { type: 'append', insights: [insight] })
  })

  it('confirms clearing and removes both insights and the summary from the owning session', async () => {
    const user = userEvent.setup()
    const save = vi.fn()
    const summary = vi.fn()
    render(<CompanyResearch {...props} initialInsights={[insight]} initialSummary="Saved research summary" onInsightsChange={save} onSummaryChange={summary} />)
    await user.click(screen.getByRole('button', { name: 'Clear insights' }))
    expect(save).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear insights' }))
    expect(save).toHaveBeenCalledWith([], { type: 'clear' })
    expect(summary).toHaveBeenCalledWith('')
    expect(screen.queryByText('Saved research summary')).not.toBeInTheDocument()
  })

  it('reflects externally completed research without discarding the current text draft', async () => {
    const user = userEvent.setup()
    const view = render(<CompanyResearch {...props} />)
    await user.click(screen.getByRole('tab', { name: 'Paste text' }))
    await user.type(screen.getByLabelText('Paste Content'), 'Keep the current draft')
    view.rerender(<CompanyResearch {...props} initialInsights={[insight]} initialSummary="Completed in another view" />)
    expect(screen.getByText(insight.title)).toBeInTheDocument()
    expect(screen.getByText('Completed in another view')).toBeInTheDocument()
    expect(screen.getByLabelText('Paste Content')).toHaveValue('Keep the current draft')
  })
})
