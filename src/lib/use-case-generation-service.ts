import { AIServiceError, type AIErrorCode } from './openai-service'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '/api'

export type CandidateEvidenceSource =
  | 'discovery'
  | 'company-research'
  | 'earnings'
  | 'financials'
  | 'news'
  | 'industry-research'

export interface UseCaseCandidateRequest {
  customerName: string
  industry: string
  jurisdiction?: string
  businessFunctions: string[]
  targetKpis: string[]
  desiredOutcomes?: string
  responses: Array<{ question: string; answer: string }>
  evidence: Array<{ source: CandidateEvidenceSource; title?: string; content: string }>
}

export interface GeneratedUseCaseCandidate {
  title: string
  description: string
  rationale: string
  businessFunction: string
  expectedOutcomes: string[]
  kpis: string[]
  strategicAlignment: {
    primaryPriority: string
    alignmentScore: number
    rationale: string
  }
  processContext: {
    processName: string
    painPoints: string[]
    proposedImprovement: string
  }
  preliminaryRisk: { level: 'low' | 'medium' | 'high'; notes: string }
  complexity: { level: 'low' | 'medium' | 'high' | 'very-high'; rationale: string }
}

export interface UseCaseCandidateResponse {
  useCases: GeneratedUseCaseCandidate[]
  generation: {
    mode: 'ai'
    provider: string
    model: string
    deployment?: string
    correlationId: string
    generatedAt: string
  }
}

interface CandidateErrorResponse {
  error?: string
  code?: AIErrorCode | 'INVALID_REQUEST'
  retryable?: boolean
  correlationId?: string
}

export async function generateUseCaseCandidates(
  input: UseCaseCandidateRequest,
): Promise<UseCaseCandidateResponse> {
  const response = await fetch(`${API_ENDPOINT}/use-case-candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => ({})) as UseCaseCandidateResponse & CandidateErrorResponse
  if (!response.ok || data.error) {
    throw new AIServiceError(
      data.error || `Use-case generation failed with HTTP ${response.status}.`,
      data.code === 'INVALID_REQUEST' ? 'INVALID_MODEL_OUTPUT' : data.code || 'PROVIDER_ERROR',
      data.retryable ?? response.status >= 500,
      data.correlationId,
    )
  }
  return data
}