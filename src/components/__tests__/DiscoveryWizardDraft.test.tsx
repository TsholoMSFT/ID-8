import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscoveryWizard } from '../DiscoveryWizard'

const questions = vi.hoisted(() => [{ id: 'q1', question: 'What outcome matters?', category: 'business', placeholder: 'Describe the outcome' }])
vi.mock('@/components/NavigationHeader', () => ({ NavigationHeader: () => null }))
vi.mock('@/components/CompanyResearch', () => ({ CompanyResearch: () => null }))
vi.mock('@/hooks/use-discovery-settings', () => ({ useDiscoverySettings: () => ({ isAIFeatureEnabled: () => false }) }))
vi.mock('@/lib/discovery-questions', () => ({
  discoveryQuestions: questions,
  getQuestionsForIndustry: () => questions,
  industryLabels: { general: 'General' },
}))

const props = {
  sessionMetadata: { customerName: 'ABSA', innovationHubSPOC: '', primaryStakeholder: '', accountTeamRep: '', innovationHubLocation: '', solutionEngineer: '' },
  onComplete: vi.fn(), onCancel: vi.fn(), researchPersistenceKey: 's1',
}

describe('discovery continuity', () => {
  beforeEach(() => { localStorage.clear() })

  it('keeps an unanswered question draft and the exact wizard step across refresh', async () => {
    const user = userEvent.setup()
    localStorage.setItem('discovery-wizard-draft:s1', JSON.stringify({
      wizardStep: 'questions', sessionName: 'ABSA discovery', selectedIndustry: 'general',
      currentStep: 0, currentQuestionId: 'q1', currentAnswer: 'Unfinished answer',
    }))
    const first = render(<DiscoveryWizard {...props} />)
    expect(screen.getByPlaceholderText('Describe the outcome')).toHaveValue('Unfinished answer')
    await user.type(screen.getByPlaceholderText('Describe the outcome'), ' kept after refresh')
    first.unmount()
    render(<DiscoveryWizard {...props} />)
    expect(screen.getByPlaceholderText('Describe the outcome')).toHaveValue('Unfinished answer kept after refresh')
  })

  it('skips duplicate naming and carries workspace research into the draft', () => {
    render(<DiscoveryWizard {...props} skipNaming initialSessionName="ABSA workspace" initialIndustry="general" initialCompanyResearchSummary="Evidence gathered in Research" />)
    expect(screen.getByText('Target Business Function')).toBeInTheDocument()
    const draft = JSON.parse(localStorage.getItem('discovery-wizard-draft:s1') || '{}')
    expect(draft.sessionName).toBe('ABSA workspace')
    expect(draft.companyResearchSummary).toBe('Evidence gathered in Research')
  })
})
