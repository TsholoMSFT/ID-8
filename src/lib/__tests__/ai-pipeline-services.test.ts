import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAIReadiness: vi.fn(),
}))

vi.mock('../openai-service', () => ({
  AIServiceError: class AIServiceError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly retryable: boolean,
      public readonly correlationId?: string,
    ) {
      super(message)
      this.name = 'AIServiceError'
    }
  },
  getAIReadiness: mocks.getAIReadiness,
}))

import { generateUseCaseCandidates } from '../use-case-generation-service'
import { mapRankedUseCase } from '../solution-mapping-service'

const ready = {
  status: 'ready' as const,
  checkedAt: '2026-07-21T00:00:00.000Z',
  provider: 'azure-openai',
  model: 'gpt-4o-mini',
  correlationId: 'ready-1',
}

const candidateRequest = {
  customerName: 'ABSA',
  industry: 'Financial Services & Banking',
  jurisdiction: 'South Africa',
  businessFunctions: ['Fraud & Financial Crime (AML)'],
  targetKpis: ['Time to Resolution'],
  responses: [{ question: 'What is the main challenge?', answer: 'Manual fraud investigation.' }],
  evidence: [],
}

const mappingRequest = {
  customerName: 'ABSA',
  industry: 'Financial Services & Banking',
  jurisdiction: 'South Africa',
  rank: 1,
  useCase: {
    title: 'Intelligent Fraud Investigation',
    description: 'Prioritize suspicious activity and assemble explainable evidence for review.',
    kpis: ['Time to Resolution'],
    painPoints: ['Manual evidence gathering'],
    impact: 9,
    feasibility: 7,
    riceScore: 200,
  },
}

describe('staged AI pipeline clients', () => {
  beforeEach(() => {
    mocks.getAIReadiness.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports the real generation failure without a billable readiness preflight', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'Subscription is disabled.',
      code: 'SUBSCRIPTION_DISABLED',
      retryable: false,
      correlationId: 'candidate-disabled',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateUseCaseCandidates(candidateRequest)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_DISABLED',
      retryable: false,
      correlationId: 'candidate-disabled',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/use-case-candidates')
    expect(mocks.getAIReadiness).not.toHaveBeenCalled()
  })

  it('returns candidate provider provenance from the typed endpoint', async () => {
    mocks.getAIReadiness.mockResolvedValue(ready)
    const responsePayload = {
      useCases: Array.from({ length: 5 }, (_, index) => ({
        title: `Candidate ${index + 1}`,
        description: 'A sufficiently detailed use-case candidate description.',
        rationale: 'Grounded in the discovery response.',
        businessFunction: 'Fraud & Financial Crime (AML)',
        expectedOutcomes: ['Reduce investigation time'],
        kpis: ['Time to Resolution'],
        strategicAlignment: { primaryPriority: 'Risk reduction', alignmentScore: 8, rationale: 'Directly supports risk reduction.' },
        processContext: { processName: 'Fraud investigation', painPoints: ['Manual work'], proposedImprovement: 'Automate evidence assembly.' },
        preliminaryRisk: { level: 'high', notes: 'Requires human review.' },
        complexity: { level: 'high', rationale: 'Core-system integration.' },
      })),
      generation: {
        mode: 'ai',
        provider: 'azure-openai',
        model: 'gpt-4o-mini',
        deployment: 'mini',
        correlationId: 'candidate-1',
        generatedAt: '2026-07-21T00:00:00.000Z',
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    const result = await generateUseCaseCandidates(candidateRequest)
    expect(result.useCases).toHaveLength(5)
    expect(result.generation).toMatchObject({
      mode: 'ai',
      provider: 'azure-openai',
      correlationId: 'candidate-1',
    })
  })

  it('returns ranked solution mapping fields and provider provenance', async () => {
    mocks.getAIReadiness.mockResolvedValue(ready)
    const responsePayload = {
      mapping: {
        microsoftSolutions: [{
          productFamily: 'azure-ai',
          services: ['azure-ai-foundry', 'azure-openai'],
          role: 'primary',
          justification: 'Provides governed AI-assisted investigation.',
        }],
        referenceArchitecture: 'agentic-ai',
        solutionPlays: ['AI-assisted fraud investigation'],
        agenticOpportunity: null,
        implementationComplexity: {
          level: 'high',
          factors: ['Core-system integration'],
          estimatedDuration: '4-6 months',
          estimatedTeamSize: '6-8 people',
          keyRisks: ['False-positive bias'],
        },
        aiRegulations: {
          applicableFrameworks: ['popia', 'ms-responsible-ai'],
          riskClassification: 'high',
          complianceNotes: 'Keep human approval and audit trails.',
          jurisdictions: ['South Africa'],
        },
        cybersecurity: {
          securityRequirements: ['encryption-at-rest', 'access-control', 'audit-logging'],
          dataClassification: 'financial',
          securityNotes: 'Use least privilege for transaction evidence.',
        },
      },
      generation: {
        provider: 'azure-openai',
        model: 'gpt-4o-mini',
        deployment: 'mini',
        correlationId: 'mapping-1',
        generatedAt: '2026-07-21T00:00:00.000Z',
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await mapRankedUseCase(mappingRequest)
    expect(result.mapping.referenceArchitecture).toBe('agentic-ai')
    expect(result.mapping.microsoftSolutions[0].services).toContain('azure-ai-foundry')
    expect(result.generation.correlationId).toBe('mapping-1')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ rank: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.getAIReadiness).not.toHaveBeenCalled()
  })
})
