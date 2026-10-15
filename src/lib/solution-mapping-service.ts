import type {
  AIRegulationsInfo,
  CybersecurityInfo,
  ImplementationComplexityInfo,
  UseCaseAgenticOpportunity,
  UseCaseMicrosoftSolution,
} from './types'
import { AIServiceError, type AIErrorCode } from './openai-service'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '/api'

export interface RankedUseCaseMappingRequest {
  customerName: string
  industry: string
  jurisdiction?: string
  rank: number
  useCase: {
    title: string
    description: string
    businessFunction?: string
    kpis: string[]
    strategicPriority?: string
    processName?: string
    painPoints: string[]
    impact?: number
    feasibility?: number
    riceScore?: number
  }
}

export interface RankedUseCaseMapping {
  microsoftSolutions: UseCaseMicrosoftSolution[]
  referenceArchitecture: string
  solutionPlays: string[]
  agenticOpportunity: Omit<UseCaseAgenticOpportunity, 'id'> | null
  implementationComplexity: ImplementationComplexityInfo
  aiRegulations: Required<Pick<AIRegulationsInfo, 'applicableFrameworks' | 'riskClassification' | 'complianceNotes' | 'jurisdictions'>>
  cybersecurity: Required<Pick<CybersecurityInfo, 'securityRequirements' | 'dataClassification' | 'securityNotes'>>
}

export interface RankedUseCaseMappingResponse {
  mapping: RankedUseCaseMapping
  generation: {
    provider: string
    model: string
    deployment?: string
    correlationId: string
    generatedAt: string
  }
}

interface MappingErrorResponse {
  error?: string
  code?: AIErrorCode | 'INVALID_REQUEST'
  retryable?: boolean
  correlationId?: string
}

export async function mapRankedUseCase(
  input: RankedUseCaseMappingRequest,
): Promise<RankedUseCaseMappingResponse> {
  const response = await fetch(`${API_ENDPOINT}/solution-mapping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => ({})) as RankedUseCaseMappingResponse & MappingErrorResponse
  if (!response.ok || data.error) {
    throw new AIServiceError(
      data.error || `Solution mapping failed with HTTP ${response.status}.`,
      data.code === 'INVALID_REQUEST' ? 'INVALID_MODEL_OUTPUT' : data.code || 'PROVIDER_ERROR',
      data.retryable ?? response.status >= 500,
      data.correlationId,
    )
  }
  return data
}