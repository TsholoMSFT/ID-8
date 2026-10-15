/**
 * AI Service
 * Provides AI integration via secure Azure Function proxy
 * Supports Azure OpenAI (direct or via proxy) and direct OpenAI API (for local dev)
 * 
 * Features:
 * - Response caching (5-minute TTL)
 * - Task-based model routing for cost optimization
 * - Multi-model support (GPT-4o, GPT-4o-mini, Phi-4-mini-instruct, GPT-5-nano)
 */

import type { EntityType } from './types'
import type {
  AIGovernanceDimension,
  AIGovernanceMaturityLevel,
  GovernanceActionPlan,
  GovernanceRecommendation,
  GovernanceGap,
} from './types'
import { AI_GOVERNANCE_DIMENSION_LABELS, AI_GOVERNANCE_MATURITY_CONFIG } from './types'
import { createFallbackEngagementCloseout, createFallbackFollowupEmail } from './ai-fallbacks'

// API endpoint for the Azure Function proxy (never call AI services directly from the browser)
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '/api'

// All AI calls route through the serverside proxy — no keys in the browser.
// The VITE_AZURE_OPENAI_* / VITE_OPENAI_* env vars have been intentionally removed
// to prevent accidental key exposure in the client bundle.

// ============================================================================
// RESPONSE CACHING
// ============================================================================

interface CacheEntry {
  content: string
  timestamp: number
  model: string
  metadata: AIUsageMetadata
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const responseCache = new Map<string, CacheEntry>()

/**
 * Generate a cache key from prompt and model
 */
function getCacheKey(prompt: string, model: string, expectJson: boolean, systemPrompt: string | undefined, task: AITask): string {
  // Simple hash function for cache key
  const input = `${task}:${model}:${expectJson}:${systemPrompt || ''}:${prompt}`
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return `cache_${hash}`
}

/**
 * Check cache for a response
 */
function getFromCache(key: string): CacheEntry | null {
  const entry = responseCache.get(key)
  if (!entry) return null
  
  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key)
    return null
  }
  
  console.log(`[Cache HIT] Using cached response for ${entry.model}`)
  return entry
}

/**
 * Store response in cache
 */
function setCache(key: string, content: string, model: string, metadata: AIUsageMetadata): void {
  responseCache.set(key, {
    content,
    timestamp: Date.now(),
    model,
    metadata,
  })
  
  // Cleanup old entries if cache is too large (max 100 entries)
  if (responseCache.size > 100) {
    const entries = Array.from(responseCache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    // Remove oldest 20 entries
    entries.slice(0, 20).forEach(([key]) => responseCache.delete(key))
  }
}

/**
 * Clear the entire cache
 */
export function clearAICache(): void {
  responseCache.clear()
  console.log('[Cache] Cleared all cached responses')
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; hits: number; misses: number } {
  return {
    size: responseCache.size,
    hits: cacheHits,
    misses: cacheMisses,
  }
}

let cacheHits = 0
let cacheMisses = 0

// ============================================================================
// MODEL ROUTING
// ============================================================================

export type ModelType = 'gpt-4o' | 'gpt-4o-mini' | 'phi-4-mini-instruct' | 'gpt-5-nano'

export type AITask = 
  | 'extraction'      // Structured extraction → GPT-5-nano
  | 'use-case-generation' // Grounded use-case candidates before scoring
  | 'solution-mapping' // Microsoft solution mapping after ranking
  | 'formatting'      // JSON formatting, simple transforms → GPT-5-nano
  | 'analysis'        // COI estimation, effort estimation → GPT-4o-mini
  | 'architecture'    // Solution architecture → GPT-4o-mini
  | 'journey'         // Customer journey generation → GPT-4o-mini
  | 'governance'      // AI governance recommendations → GPT-4o-mini
  | 'business-case'   // Per-use-case business case markdown → GPT-4o-mini
  | 'cost-optimization' // SKU swap suggestions → GPT-4o-mini
  | 'executive'       // Executive summaries → mini by default
  | 'engagement-agenda'   // Session agenda from transcript → GPT-4o-mini
  | 'engagement-email'    // Follow-up email → Phi-4-mini-instruct
  | 'engagement-timeline' // Engagement task timeline → GPT-4o-mini
  | 'engagement-closeout' // Closeout / debrief summary → GPT-4o-mini
  | 'engagement-diagram'  // Mermaid architecture diagram → GPT-4o-mini
  | 'general'         // Default → Phi-4-mini-instruct

const AI_TASKS = new Set<AITask>([
  'extraction',
  'use-case-generation',
  'solution-mapping',
  'formatting',
  'analysis',
  'architecture',
  'journey',
  'governance',
  'business-case',
  'cost-optimization',
  'executive',
  'engagement-agenda',
  'engagement-email',
  'engagement-timeline',
  'engagement-closeout',
  'engagement-diagram',
  'general',
])

/**
 * Get the optimal model for a given task
 * Nano handles structured extraction/formatting, Phi handles plain text,
 * and mini handles analysis and executive content. Actual deployment usage,
 * not alias-based price guesses, is returned by the server.
 */
export function getModelForTask(task: AITask): ModelType {
  const taskModelMap: Record<AITask, ModelType> = {
    extraction: 'gpt-5-nano',
    'use-case-generation': 'gpt-4o-mini',
    'solution-mapping': 'gpt-4o-mini',
    formatting: 'gpt-5-nano',
    general: 'phi-4-mini-instruct',
    analysis: 'gpt-4o-mini',
    architecture: 'gpt-4o-mini',
    journey: 'gpt-4o-mini',
    governance: 'gpt-4o-mini',
    'business-case': 'gpt-4o-mini',
    'cost-optimization': 'gpt-4o-mini',
    executive: 'gpt-4o-mini',
    'engagement-agenda': 'gpt-4o-mini',
    'engagement-email': 'phi-4-mini-instruct',
    'engagement-timeline': 'gpt-4o-mini',
    'engagement-closeout': 'gpt-4o-mini',
    'engagement-diagram': 'gpt-4o-mini',
  }
  return taskModelMap[task] || 'phi-4-mini-instruct'
}

/**
 * Call AI for a specific task with automatic model selection
 */
export async function callAIForTask(
  task: AITask,
  prompt: string,
  options: { expectJson?: boolean; systemPrompt?: string; onUsage?: (metadata: AIUsageMetadata) => void } = {}
): Promise<string> {
  const model = getModelForTask(task)
  console.log(`[AI] Task: ${task} → Model: ${model}`)
  return callOpenAI(prompt, model, options.expectJson ?? false, options.systemPrompt, task, options.onUsage)
}

export interface AIUsageMetadata {
  model?: string
  deployment?: string
  cached: boolean
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

interface ProxyResponse {
  content?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  error?: string
  code?: AIErrorCode
  retryable?: boolean
  correlationId?: string
  details?: string
  model?: string
  deployment?: string
  cached?: boolean
}

export type AIErrorCode =
  | 'MIGRATION_IN_PROGRESS'
  | 'AUTH_REQUIRED'
  | 'INVALID_REQUEST'
  | 'QUOTA_EXCEEDED'
  | 'COST_CONTROL_UNAVAILABLE'
  | 'REQUEST_IN_PROGRESS'
  | 'BACKEND_UNREACHABLE'
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH_FAILED'
  | 'SUBSCRIPTION_DISABLED'
  | 'DEPLOYMENT_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'INVALID_MODEL_OUTPUT'
  | 'PROVIDER_ERROR'

export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly code: AIErrorCode,
    public readonly retryable: boolean,
    public readonly correlationId?: string,
  ) {
    super(message)
    this.name = 'AIServiceError'
  }
}

export interface AIReadiness {
  status: 'configured' | 'ready' | 'unavailable'
  checkedAt: string
  provider: string
  model: string
  deployment?: string
  authMode?: 'entra-id' | 'key'
  correlationId: string
  code?: AIErrorCode
  retryable?: boolean
  message?: string
}

export async function getAIReadiness(refresh = false): Promise<AIReadiness> {
  const query = refresh ? '?refresh=true' : ''
  const response = await fetch(`${API_ENDPOINT}/ai-readiness${query}`)
  if (!response.ok) {
    throw new AIServiceError('AI readiness endpoint is unavailable.', 'BACKEND_UNREACHABLE', true)
  }
  return response.json() as Promise<AIReadiness>
}

/**
 * Call AI via secure Azure Function proxy
 * Supports optional cloudEnvironment for sovereign cloud routing.
 */
async function callViaProxy(
  prompt: string,
  model: ModelType = 'phi-4-mini-instruct',
  expectJson: boolean = false,
  systemPrompt?: string,
  cloudEnvironment?: string,
  task: AITask = 'general'
): Promise<ProxyResponse & { content: string }> {
  const requestBody: Record<string, unknown> = { prompt, model, expectJson, task }
  if (systemPrompt) requestBody.systemPrompt = systemPrompt
  if (cloudEnvironment) requestBody.cloudEnvironment = cloudEnvironment

  // A timed-out inference can still be billable. Never replay it automatically.
  const maxRetries = 0
  // Abort a stalled request so a down/slow backend surfaces an error instead of
  // hanging the UI forever (the Vite dev proxy has no timeout of its own).
  const REQUEST_TIMEOUT_MS = 40_000
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential back-off: 1s, 2s
        await new Promise(resolve => setTimeout(resolve, attempt * 1000))
        console.log(`[AI] Retry ${attempt}/${maxRetries} for ${model}...`)
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(`${API_ENDPOINT}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      const rawText = await response.text()
      let data: ProxyResponse | null = null
      try {
        data = rawText ? (JSON.parse(rawText) as ProxyResponse) : null
      } catch {
        data = null
      }

      if (!response.ok || data?.error) {
        const details = data?.details || (rawText && rawText.length < 500 ? rawText : '')
        const errMsg = data?.error || `API error: ${response.status}${details ? ` (${details})` : ''}`
        const providerError = new AIServiceError(
          errMsg,
          data?.code || (response.status === 401 || response.status === 403 ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR'),
          false,
          data?.correlationId,
        )
        if (providerError.retryable && attempt < maxRetries) {
          lastError = providerError
          continue
        }
        throw providerError
      }

      if (!data?.content) {
        if (attempt < maxRetries) {
          lastError = new Error('Empty response from AI proxy')
          continue
        }
        throw new Error('Empty response from AI proxy')
      }

      return { ...data, content: data.content }
    } catch (error) {
      // Translate low-level fetch failures into actionable messages so the UI can
      // tell the user the backend is unreachable rather than failing mutely.
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new AIServiceError(
          'AI request timed out — the backend may be unavailable.',
          'PROVIDER_TIMEOUT',
          false,
        )
      } else if (error instanceof TypeError) {
        lastError = new AIServiceError(
          'Could not reach the AI backend. Is the Functions host running on :7071?',
          'BACKEND_UNREACHABLE',
          false,
        )
      } else {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
      if (attempt >= maxRetries) throw lastError
    }
  }

  throw lastError || new Error('AI call failed after retries')
}

/**
 * Call AI - routes all requests through the secure Azure Function proxy.
 * Features: Response caching with 5-minute TTL
 * @param prompt - The user prompt
 * @param model - Model to use
 * @param expectJson - Whether to expect JSON response
 * @param systemPrompt - Optional system prompt for prompt caching
 * @returns The completion text
 */
export async function callOpenAI(
  prompt: string,
  model: ModelType = 'phi-4-mini-instruct',
  expectJson: boolean = false,
  systemPrompt?: string,
  task: AITask = 'general',
  onUsage?: (metadata: AIUsageMetadata) => void,
): Promise<string> {
  const normalizedTask = AI_TASKS.has(task) ? task : 'general'
  // Check cache first
  const cacheKey = getCacheKey(prompt, model, expectJson, systemPrompt, normalizedTask)
  const cached = getFromCache(cacheKey)
  if (cached) {
    cacheHits++
    onUsage?.({ ...cached.metadata, cached: true, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } })
    return cached.content
  }
  cacheMisses++

  try {
    console.log(`Using proxy API at ${API_ENDPOINT} (${model})`)
    const result = await callViaProxy(prompt, model, expectJson, systemPrompt, undefined, normalizedTask)

    // Cache the successful response
    const metadata: AIUsageMetadata = { model: result.model, deployment: result.deployment, cached: result.cached ?? false, usage: result.usage }
    setCache(cacheKey, result.content, model, metadata)
    onUsage?.(metadata)
    return result.content
  } catch (error) {
    console.error('AI call failed:', error)
    throw error
  }
}

/**
 * AI Effort Estimation - estimates implementation effort in person-weeks with reasoning
 * @param useCase - The use case to estimate effort for
 * @returns Effort estimate in person-weeks with reasoning
 */
export interface EffortEstimate {
  effortWeeks: number
  reasoning: string
  breakdown?: {
    design: number
    development: number
    testing: number
    deployment: number
  }
}

export async function estimateEffort(
  useCase: { title: string; description: string },
  context?: { industry?: string; complexity?: string; entityType?: EntityType }
): Promise<EffortEstimate> {
  // Entity type adjustments
  const entityContext = context?.entityType === 'government'
    ? '\n\nGOVERNMENT CONTEXT: Factor in procurement cycles, FedRAMP/compliance requirements, and multi-stakeholder approval processes.'
    : context?.entityType === 'non-profit'
    ? '\n\nNON-PROFIT CONTEXT: Consider limited IT resources and budget constraints typical of non-profits.'
    : ''

  const prompt = `You are an expert software development estimator for Microsoft AI and cloud solutions.

USE CASE TO ESTIMATE:
Title: ${useCase.title}
Description: ${useCase.description}
${context?.industry ? `Industry: ${context.industry}` : ''}
${context?.complexity ? `Known Complexity: ${context.complexity}` : ''}${entityContext}

TASK: Estimate the implementation effort in PERSON-WEEKS for this use case.

Consider:
1. Design & Architecture phase
2. Development (backend, frontend, AI/ML components)
3. Testing (unit, integration, UAT)
4. Deployment & Documentation

GUIDELINES:
- Be realistic - consider typical enterprise implementation challenges
- Account for integration complexity with existing systems
- Factor in AI/ML specific requirements (model training, evaluation, monitoring)
- Consider Microsoft-specific technologies (Azure, Power Platform, Microsoft 365)

Return a JSON object:
{
  "effortWeeks": <number between 1 and 52>,
  "reasoning": "<2-3 sentences explaining the estimate>",
  "breakdown": {
    "design": <weeks>,
    "development": <weeks>,
    "testing": <weeks>,
    "deployment": <weeks>
  }
}

Be concise but specific in reasoning.`

  try {
    const result = await callOpenAI(prompt, 'gpt-4o-mini', true)
    const parsed = JSON.parse(result)
    
    return {
      effortWeeks: Math.max(1, Math.min(52, parsed.effortWeeks || 4)),
      reasoning: parsed.reasoning || 'Estimated based on typical implementation patterns.',
      breakdown: parsed.breakdown,
    }
  } catch (error) {
    console.error('Effort estimation failed:', error)
    // Return a reasonable default
    return {
      effortWeeks: 4,
      reasoning: 'Default estimate. AI estimation unavailable - please adjust based on your assessment.',
    }
  }
}

// ============================================================================
// ROI ESTIMATION
// ============================================================================

export interface ROIEstimate {
  implementationCost: number
  expectedAnnualBenefit: number
  roiPercentage: number
  paybackMonths: number
  threeYearValue: number
  /** Conservative / optimistic annual benefit bounds (optional; UI derives a range if absent). */
  low?: number
  high?: number
  /** One concrete thing to verify with the customer to firm up the estimate. */
  verificationStep?: string
  assumptions: string[]
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Estimate ROI for a use case based on COI data and effort estimates
 */
export async function estimateROI(
  useCase: { title: string; description: string },
  context?: {
    industry?: string
    entityType?: EntityType
    companyName?: string
    coiEstimate?: number
    effortWeeks?: number
  }
): Promise<ROIEstimate> {
  // Entity type context
  const entityContext = context?.entityType === 'government'
    ? '\nORGANIZATION TYPE: Government/Public Sector\n- Express benefits in terms of "budget savings," "taxpayer value," and "service efficiency"\n- Focus on cost avoidance and operational efficiency metrics\n- Implementation costs should include FedRAMP/compliance overhead'
    : context?.entityType === 'non-profit'
    ? '\nORGANIZATION TYPE: Non-Profit\n- Express benefits as "mission impact" and "donor efficiency"\n- Focus on program effectiveness and administrative cost reduction\n- Consider grant funding cycles in payback period'
    : context?.entityType === 'private-company'
    ? '\nORGANIZATION TYPE: Private Company\n- Focus on competitive advantage and market positioning\n- No public financials - use industry benchmarks'
    : ''

  const prompt = `You are a financial analyst estimating Return on Investment for technology investments.

USE CASE:
Title: ${useCase.title}
Description: ${useCase.description}
${context?.industry ? `Industry: ${context.industry}` : ''}
${context?.companyName ? `Company: ${context.companyName}` : ''}
${context?.coiEstimate ? `Estimated Annual Cost of Inaction (COI): $${context.coiEstimate.toLocaleString()}` : ''}
${context?.effortWeeks ? `Estimated Implementation Effort: ${context.effortWeeks} person-weeks` : ''}${entityContext}

TASK: Estimate the ROI for implementing this use case.

CALCULATION APPROACH:
1. **Implementation Cost**: Based on effort weeks × $2,500/week blended rate + 30% for infrastructure/licensing
2. **Expected Annual Benefit**: A CONSERVATIVE share of COI captured (20-40% in the first full year, ramping as adoption matures) plus any clearly-attributable new value. Do not assume full capture.
3. **ROI Percentage**: ((Annual Benefit - (Implementation Cost ÷ 3)) / (Implementation Cost ÷ 3)) × 100
4. **Payback Period**: Implementation Cost / Monthly Benefit
5. **3-Year Value**: a RAMPED benefit (~30% year 1, 60% year 2, 90% year 3 of the steady-state annual benefit) minus Implementation Cost — do not assume full benefit from year 1.

Return a JSON object:
{
  "implementationCost": <total USD including labor, infrastructure, licensing>,
  "expectedAnnualBenefit": <annual USD value/savings>,
  "roiPercentage": <percentage, can exceed 100>,
  "paybackMonths": <months to break even>,
  "threeYearValue": <net value over 3 years>,
  "low": <conservative lower-bound annual benefit, USD>,
  "high": <optimistic upper-bound annual benefit, USD>,
  "verificationStep": "<one concrete data point to confirm with the customer to firm up this estimate>",
  "assumptions": ["assumption 1", "assumption 2", "assumption 3"],
  "reasoning": "<2-3 sentences explaining the ROI calculation>",
  "confidence": "high" | "medium" | "low"
}

Be realistic. If COI data is provided, use it as the primary benefit driver.`

  try {
    const result = await callOpenAI(prompt, 'gpt-4o-mini', true)
    const parsed = JSON.parse(result)
    
    return {
      implementationCost: Math.max(0, parsed.implementationCost || 0),
      expectedAnnualBenefit: Math.max(0, parsed.expectedAnnualBenefit || 0),
      roiPercentage: parsed.roiPercentage || 0,
      paybackMonths: Math.max(0, parsed.paybackMonths || 12),
      threeYearValue: parsed.threeYearValue || 0,
      low: typeof parsed.low === 'number' ? Math.max(0, parsed.low) : undefined,
      high: typeof parsed.high === 'number' ? Math.max(0, parsed.high) : undefined,
      verificationStep: typeof parsed.verificationStep === 'string' ? parsed.verificationStep : undefined,
      assumptions: parsed.assumptions || ['Based on industry benchmarks'],
      reasoning: parsed.reasoning || 'Estimated based on typical ROI patterns.',
      confidence: parsed.confidence || 'medium',
    }
  } catch (error) {
    console.error('ROI estimation failed:', error)
    return {
      implementationCost: 0,
      expectedAnnualBenefit: 0,
      roiPercentage: 0,
      paybackMonths: 0,
      threeYearValue: 0,
      assumptions: ['AI estimation unavailable - please calculate manually'],
      reasoning: 'Unable to estimate. Please provide your own assessment.',
      confidence: 'low',
    }
  }
}

// ============================================================================
// CUSTOMER JOURNEY GENERATION
// ============================================================================

export interface GeneratedJourneyMilestone {
  title: string
  description: string
  engagement: 'business-envisioning' | 'solution-envisioning' | 'architecture-design' | 'rapid-prototype'
  duration: string
  deliverables: string[]
  dependencies: string[]
  discoveryContext?: string  // Context from discovery insights
}

export interface GeneratedJourneyNextStep {
  action: string
  owner?: string
  targetDate?: string
}

export interface GeneratedJourney {
  title: string
  journeyNotes: string
  milestones: GeneratedJourneyMilestone[]
  nextSteps: GeneratedJourneyNextStep[]
  totalDuration: string
  reasoning: string
  discoveryInsights?: {
    painPoints?: string[]
    stakeholders?: string[]
    constraints?: string[]
    opportunities?: string[]
  }
}

/**
 * Generate a customer journey / engagement roadmap for a use case
 * Uses Innovation Hub engagement types to create a structured implementation path
 */
export async function generateCustomerJourney(
  useCase: { id: string; title: string; description: string },
  context?: {
    complexity?: 'low' | 'medium' | 'high' | 'very-high'
    industry?: string
    entityType?: EntityType
    existingMicrosoftProducts?: string[]
    customerName?: string
    discoveryNotes?: string
    painPoints?: string[]
    stakeholders?: string[]
    constraints?: string[]
  }
): Promise<GeneratedJourney> {
  const complexityLevel = context?.complexity || 'medium'
  
  // Entity type context for appropriate language
  const entityContext = context?.entityType === 'government'
    ? '\nORGANIZATION TYPE: Government/Public Sector\n- Use procurement-friendly language\n- Reference compliance requirements (FedRAMP, etc.)\n- Include stakeholder review/approval milestones'
    : context?.entityType === 'non-profit'
    ? '\nORGANIZATION TYPE: Non-Profit\n- Consider limited IT resources\n- Reference grant/funding alignment'
    : ''

  const prompt = `You are a Microsoft Innovation Hub expert creating a customer engagement roadmap.

USE CASE:
Title: ${useCase.title}
Description: ${useCase.description}
${context?.industry ? `Industry: ${context.industry}` : ''}
${context?.customerName ? `Customer: ${context.customerName}` : ''}
${context?.existingMicrosoftProducts?.length ? `Existing Microsoft Products: ${context.existingMicrosoftProducts.join(', ')}` : ''}
Complexity Level: ${complexityLevel}${entityContext}
${context?.discoveryNotes ? `\nDISCOVERY NOTES:\n${context.discoveryNotes}` : ''}
${context?.painPoints?.length ? `\nIDENTIFIED PAIN POINTS:\n${context.painPoints.map(p => `- ${p}`).join('\n')}` : ''}
${context?.stakeholders?.length ? `\nKEY STAKEHOLDERS:\n${context.stakeholders.map(s => `- ${s}`).join('\n')}` : ''}
${context?.constraints?.length ? `\nCONSTRAINTS:\n${context.constraints.map(c => `- ${c}`).join('\n')}` : ''}

INNOVATION HUB ENGAGEMENT TYPES (use these exactly):

1. "business-envisioning"
   - Purpose: Discover prioritized use cases through human-centered design thinking
   - Typical duration: 1-2 weeks
   - Outcomes: Use case prioritization, stakeholder alignment, opportunity assessment

2. "solution-envisioning"
   - Purpose: Strategic business and technical discussion to agree on direction
   - Typical duration: 1-2 weeks
   - Outcomes: Technical direction document, solution concept, Microsoft capabilities mapping

3. "architecture-design"
   - Purpose: Synthesize requirements and align to reference architectures
   - Typical duration: 2-3 weeks
   - Outcomes: Reference architecture alignment, scope definition, integration requirements

4. "rapid-prototype"
   - Purpose: Demonstrate key technical capabilities to accelerate decisions
   - Typical duration: 2-4 weeks
   - Outcomes: POC demo, technical validation, go/no-go recommendation

TASK: Create a customer journey with milestones for implementing this use case.

GUIDELINES:
- For LOW complexity: Skip solution-envisioning, go straight from business-envisioning to rapid-prototype
- For MEDIUM complexity: Include all 4 phases with standard durations
- For HIGH/VERY-HIGH complexity: Include all 4 phases with extended durations, more detailed deliverables
- Each milestone should have 3-5 specific deliverables relevant to the use case
- Dependencies should reference previous milestone titles
- Durations should be realistic ranges (e.g., "2-3 weeks")
- Use any discovery insights provided to tailor the journey
- Include 3-5 actionable next steps

Return a JSON object:
{
  "title": "<Descriptive journey title for this use case, e.g., 'AI-Powered Customer Service Transformation Journey'>",
  "journeyNotes": "<2-3 sentences providing overall context, key considerations, and strategic approach based on discovery insights>",
  "milestones": [
    {
      "title": "<specific milestone title for this use case>",
      "description": "<1-2 sentence description specific to the use case>",
      "engagement": "<one of: business-envisioning, solution-envisioning, architecture-design, rapid-prototype>",
      "duration": "<X-Y weeks>",
      "deliverables": ["<specific deliverable 1>", "<specific deliverable 2>", ...],
      "dependencies": ["<title of prerequisite milestone>" or empty array for first],
      "discoveryContext": "<optional: specific insight from discovery that applies to this milestone>"
    }
  ],
  "nextSteps": [
    {
      "action": "<specific action item, e.g., 'Schedule stakeholder alignment meeting'>",
      "owner": "<optional: suggested role, e.g., 'Project Sponsor'>",
      "targetDate": "<optional: relative timing, e.g., 'Within 1 week'>"
    }
  ],
  "discoveryInsights": {
    "painPoints": ["<pain point extracted from discovery>"],
    "stakeholders": ["<key stakeholder role>"],
    "constraints": ["<identified constraint>"],
    "opportunities": ["<identified opportunity>"]
  },
  "totalDuration": "<X-Y weeks total>",
  "reasoning": "<1-2 sentences explaining why this journey structure fits the use case>"
}

Make deliverables specific to the use case, not generic.`

  try {
    const result = await callAIForTask('journey', prompt, { expectJson: true })
    const parsed = JSON.parse(result)
    
    // Validate and normalize the response
    const validEngagements = ['business-envisioning', 'solution-envisioning', 'architecture-design', 'rapid-prototype']
    
    const milestones: GeneratedJourneyMilestone[] = (parsed.milestones || []).map((m: any) => ({
      title: String(m.title || 'Milestone'),
      description: String(m.description || ''),
      engagement: validEngagements.includes(m.engagement) ? m.engagement : 'business-envisioning',
      duration: String(m.duration || '1-2 weeks'),
      deliverables: Array.isArray(m.deliverables) ? m.deliverables.map(String) : [],
      dependencies: Array.isArray(m.dependencies) ? m.dependencies.map(String) : [],
      discoveryContext: m.discoveryContext ? String(m.discoveryContext) : undefined
    }))
    
    // Parse next steps
    const nextSteps: GeneratedJourneyNextStep[] = (parsed.nextSteps || []).map((s: any) => ({
      action: String(s.action || ''),
      owner: s.owner ? String(s.owner) : undefined,
      targetDate: s.targetDate ? String(s.targetDate) : undefined
    })).filter((s: GeneratedJourneyNextStep) => s.action)
    
    // Parse discovery insights
    const discoveryInsights = parsed.discoveryInsights ? {
      painPoints: Array.isArray(parsed.discoveryInsights.painPoints) ? parsed.discoveryInsights.painPoints.map(String) : undefined,
      stakeholders: Array.isArray(parsed.discoveryInsights.stakeholders) ? parsed.discoveryInsights.stakeholders.map(String) : undefined,
      constraints: Array.isArray(parsed.discoveryInsights.constraints) ? parsed.discoveryInsights.constraints.map(String) : undefined,
      opportunities: Array.isArray(parsed.discoveryInsights.opportunities) ? parsed.discoveryInsights.opportunities.map(String) : undefined
    } : undefined
    
    return {
      title: String(parsed.title || `${useCase.title} Implementation Journey`),
      journeyNotes: String(parsed.journeyNotes || ''),
      milestones,
      nextSteps,
      totalDuration: String(parsed.totalDuration || 'TBD'),
      reasoning: String(parsed.reasoning || ''),
      discoveryInsights
    }
  } catch (error) {
    console.error('Customer journey generation failed:', error)
    // Return a default journey based on complexity
    return getDefaultJourney(complexityLevel, useCase.title)
  }
}

/**
 * Get a default journey structure based on complexity
 */
function getDefaultJourney(complexity: 'low' | 'medium' | 'high' | 'very-high', useCaseTitle?: string): GeneratedJourney {
  const milestones: GeneratedJourneyMilestone[] = [
    {
      title: 'Business Discovery Workshop',
      description: 'Explore opportunities and define use case priorities through design thinking.',
      engagement: 'business-envisioning',
      duration: '1-2 weeks',
      deliverables: ['Use case prioritization matrix', 'Stakeholder alignment document', 'Opportunity assessment'],
      dependencies: []
    }
  ]
  
  if (complexity !== 'low') {
    milestones.push({
      title: 'Solution Direction Workshop',
      description: 'Align on technical approach and Microsoft solution capabilities.',
      engagement: 'solution-envisioning',
      duration: '1-2 weeks',
      deliverables: ['Technical direction document', 'Solution concept diagram', 'Microsoft capabilities mapping'],
      dependencies: ['Business Discovery Workshop']
    })
  }
  
  if (complexity === 'high' || complexity === 'very-high') {
    milestones.push({
      title: 'Architecture Design Sprint',
      description: 'Define detailed architecture and integration requirements.',
      engagement: 'architecture-design',
      duration: complexity === 'very-high' ? '3-4 weeks' : '2-3 weeks',
      deliverables: ['Reference architecture alignment', 'Integration specifications', 'Cost estimation', 'Risk assessment'],
      dependencies: ['Solution Direction Workshop']
    })
  }
  
  milestones.push({
    title: 'Rapid Prototype Development',
    description: 'Build and demonstrate key technical capabilities.',
    engagement: 'rapid-prototype',
    duration: complexity === 'very-high' ? '3-6 weeks' : '2-4 weeks',
    deliverables: ['Proof of concept demo', 'Technical validation report', 'Go/No-Go recommendation'],
    dependencies: [milestones[milestones.length - 1].title]
  })
  
  // Calculate total duration
  let minWeeks = 0, maxWeeks = 0
  for (const m of milestones) {
    const match = m.duration.match(/(\d+)(?:\s*-\s*(\d+))?\s*week/i)
    if (match) {
      minWeeks += parseInt(match[1], 10)
      maxWeeks += parseInt(match[2] || match[1], 10)
    }
  }
  
  // Default next steps
  const nextSteps: GeneratedJourneyNextStep[] = [
    { action: 'Schedule kickoff meeting with key stakeholders', owner: 'Project Lead' },
    { action: 'Identify and confirm project sponsor', owner: 'Account Team' },
    { action: 'Gather existing documentation and system access', owner: 'Customer IT' }
  ]
  
  return {
    title: useCaseTitle ? `${useCaseTitle} Implementation Journey` : 'Customer Implementation Journey',
    journeyNotes: 'This journey follows the standard Innovation Hub engagement model. Adjust durations and deliverables based on specific customer context and constraints.',
    milestones,
    nextSteps,
    totalDuration: minWeeks === maxWeeks ? `${minWeeks} weeks` : `${minWeeks}-${maxWeeks} weeks`,
    reasoning: 'Default journey based on use case complexity assessment.'
  }
}

// ============================================================================
// ENGAGEMENT ARTIFACT GENERATORS (HubWorks-inspired)
// Agenda / follow-up email / task timeline / closeout / architecture diagram.
// Each follows the shared AI generator pattern: build prompt -> callAIForTask(expectJson)
// -> JSON.parse -> type-guard -> safe fallback so the UI never crashes.
// ============================================================================

/** Shared context for the engagement generators. */
export interface EngagementGenContext {
  customerName?: string
  industry?: string
  engagementType?: string
  stakeholders?: string[]
  /** Paste-in transcript / planning notes the artifact is built from. */
  transcript?: string
  useCases?: Array<{ title: string; description?: string }>
}

function buildEngagementContextBlock(ctx?: EngagementGenContext): string {
  if (!ctx) return ''
  const lines: string[] = []
  if (ctx.customerName) lines.push(`Customer: ${ctx.customerName}`)
  if (ctx.industry) lines.push(`Industry: ${ctx.industry}`)
  if (ctx.engagementType) lines.push(`Engagement type: ${ctx.engagementType}`)
  if (ctx.stakeholders?.length) lines.push(`Stakeholders: ${ctx.stakeholders.join(', ')}`)
  if (ctx.useCases?.length) {
    lines.push('Use cases in scope:')
    ctx.useCases.slice(0, 12).forEach((u, i) =>
      lines.push(`  ${i + 1}. ${u.title}${u.description ? ` — ${u.description}` : ''}`))
  }
  if (ctx.transcript?.trim()) lines.push(`\nPlanning transcript / notes:\n${ctx.transcript.trim().slice(0, 6000)}`)
  return lines.join('\n')
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []

export interface EngagementAgendaItem {
  time?: string
  topic: string
  owner?: string
  description?: string
}

export interface EngagementAgenda {
  title: string
  durationMinutes: number
  objectives: string[]
  items: EngagementAgendaItem[]
  nextSteps: string[]
  reasoning?: string
}

export async function generateEngagementAgenda(
  ctx: EngagementGenContext & { durationMinutes?: number }
): Promise<EngagementAgenda> {
  const duration = ctx.durationMinutes ?? 90
  const prompt = `You are an experienced Microsoft Innovation Hub session lead. Build a focused, realistic agenda for a customer engagement.

ENGAGEMENT CONTEXT:
${buildEngagementContextBlock(ctx)}
Target duration: ${duration} minutes.

RULES:
- "customer" = the external organization (never "Microsoft").
- Time-box every item; item durations should sum to roughly the target duration.
- Standard opener (intros + objectives) and closer (next steps), plus content blocks grounded in the context.
- Owners are "Microsoft", "Customer", or "Microsoft & Customer".

Return JSON:
{
  "title": "<short agenda title>",
  "durationMinutes": ${duration},
  "objectives": ["..."],
  "items": [{ "time": "9:00–9:15", "topic": "...", "owner": "Microsoft", "description": "..." }],
  "nextSteps": ["..."],
  "reasoning": "<1-2 sentences>"
}`
  try {
    const result = await callAIForTask('engagement-agenda', prompt, { expectJson: true })
    const p = JSON.parse(result)
    const items: EngagementAgendaItem[] = Array.isArray(p.items)
      ? (p.items as unknown[]).map((raw) => {
          const it = (raw ?? {}) as Record<string, unknown>
          return {
            time: typeof it.time === 'string' ? it.time : undefined,
            topic: typeof it.topic === 'string' ? it.topic : 'Discussion',
            owner: typeof it.owner === 'string' ? it.owner : undefined,
            description: typeof it.description === 'string' ? it.description : undefined,
          }
        })
      : []
    return {
      title: typeof p.title === 'string' ? p.title : 'Engagement Agenda',
      durationMinutes: typeof p.durationMinutes === 'number' ? p.durationMinutes : duration,
      objectives: asStringArray(p.objectives),
      items,
      nextSteps: asStringArray(p.nextSteps),
      reasoning: typeof p.reasoning === 'string' ? p.reasoning : undefined,
    }
  } catch (error) {
    console.error('Agenda generation failed:', error)
    return {
      title: 'Engagement Agenda (draft)',
      durationMinutes: duration,
      objectives: ['Confirm objectives with the customer'],
      items: [
        { time: '0:00–0:15', topic: 'Introductions & objectives', owner: 'Microsoft & Customer' },
        { time: '0:15–1:15', topic: 'Discovery & discussion', owner: 'Microsoft & Customer' },
        { time: '1:15–1:30', topic: 'Next steps & close', owner: 'Microsoft' },
      ],
      nextSteps: ['AI generation unavailable — edit this draft manually.'],
    }
  }
}

export interface FollowupEmail {
  subject: string
  bodyHtml: string
  bodyText: string
  bullets: string[]
  callToAction?: string
  usedFallback?: boolean
}

export async function generateFollowupEmail(
  ctx: EngagementGenContext & { audience?: string; senderName?: string; tone?: string; highlights?: string[] }
): Promise<FollowupEmail> {
  const prompt = `You are a Microsoft solution engineer writing a concise, professional follow-up email after a customer engagement.

CONTEXT:
${buildEngagementContextBlock(ctx)}
${ctx.audience ? `Audience: ${ctx.audience}` : ''}
${ctx.highlights?.length ? `Highlights to include: ${ctx.highlights.join('; ')}` : ''}
Tone: ${ctx.tone ?? 'warm, professional, concise'}.
${ctx.senderName ? `Sender: ${ctx.senderName}` : ''}

RULES:
- Calibrate to the audience (executive = outcomes/value; technical = next technical steps).
- Keep it short: one opening paragraph, a few bullets, one clear call to action.
- "customer" = external org (never "Microsoft").

Return JSON:
{
  "subject": "...",
  "bodyHtml": "<p>...</p><ul><li>...</li></ul><p>...</p>",
  "bodyText": "plain-text version with line breaks",
  "bullets": ["..."],
  "callToAction": "..."
}`
  try {
    const result = await callAIForTask('engagement-email', prompt, { expectJson: true })
    const p = JSON.parse(result)
    return {
      subject: typeof p.subject === 'string' ? p.subject : `Follow-up — ${ctx.customerName ?? 'our session'}`,
      bodyHtml: typeof p.bodyHtml === 'string' ? p.bodyHtml : '',
      bodyText: typeof p.bodyText === 'string' ? p.bodyText : '',
      bullets: asStringArray(p.bullets),
      callToAction: typeof p.callToAction === 'string' ? p.callToAction : undefined,
      usedFallback: false,
    }
  } catch (error) {
    console.error('Follow-up email generation failed:', error)
    return { ...createFallbackFollowupEmail(ctx), usedFallback: true }
  }
}

export interface EngagementTimelineItem {
  title: string
  offsetDays: number
  bucket?: string
  owner?: string
  notes?: string
}

export interface EngagementTimeline {
  items: EngagementTimelineItem[]
  reasoning?: string
}

export async function generateEngagementTimeline(
  ctx: EngagementGenContext & { scopeNotes?: string }
): Promise<EngagementTimeline> {
  const prompt = `You are planning the task timeline for a Microsoft customer engagement, expressed as BUSINESS-DAY offsets from the engagement date (day 0). Negative = before, positive = after.

CONTEXT:
${buildEngagementContextBlock(ctx)}
${ctx.scopeNotes ? `Scope notes: ${ctx.scopeNotes}` : ''}

RULES:
- Cover preparation (about T-28 to T-1), delivery day (0), and follow-up (T+1 to T+3).
- Use buckets: "Preparation", "Delivery", "Follow-up".
- Produce ~10-16 concrete, owner-assigned tasks.

Return JSON:
{ "items": [{ "title": "...", "offsetDays": -28, "bucket": "Preparation", "owner": "Microsoft", "notes": "..." }], "reasoning": "..." }`
  try {
    const result = await callAIForTask('engagement-timeline', prompt, { expectJson: true })
    const p = JSON.parse(result)
    const items: EngagementTimelineItem[] = Array.isArray(p.items)
      ? (p.items as unknown[]).map((raw) => {
          const it = (raw ?? {}) as Record<string, unknown>
          return {
            title: typeof it.title === 'string' ? it.title : 'Task',
            offsetDays: typeof it.offsetDays === 'number' ? Math.round(it.offsetDays) : 0,
            bucket: typeof it.bucket === 'string' ? it.bucket : undefined,
            owner: typeof it.owner === 'string' ? it.owner : undefined,
            notes: typeof it.notes === 'string' ? it.notes : undefined,
          }
        })
      : []
    return { items, reasoning: typeof p.reasoning === 'string' ? p.reasoning : undefined }
  } catch (error) {
    console.error('Timeline generation failed:', error)
    return { items: [] }
  }
}

export interface EngagementCloseout {
  summary: string
  decisions: string[]
  actionItems: Array<{ action: string; owner?: string; due?: string }>
  risks: string[]
  nextSteps: string[]
  sentiment?: 'positive' | 'neutral' | 'mixed' | 'negative'
  usedFallback?: boolean
}

export async function generateEngagementCloseout(ctx: EngagementGenContext): Promise<EngagementCloseout> {
  const prompt = `You are writing a concise engagement closeout / debrief from the session notes below.

CONTEXT:
${buildEngagementContextBlock(ctx)}

RULES:
- Be factual and grounded ONLY in the provided context; do not invent commitments or numbers.
- Capture decisions, action items (with owners), risks, and next steps.

Return JSON:
{ "summary": "2-4 sentences", "decisions": ["..."], "actionItems": [{"action":"...","owner":"...","due":"..."}], "risks": ["..."], "nextSteps": ["..."], "sentiment": "positive|neutral|mixed|negative" }`
  try {
    const result = await callAIForTask('engagement-closeout', prompt, { expectJson: true })
    const p = JSON.parse(result)
    const actionItems = Array.isArray(p.actionItems)
      ? (p.actionItems as unknown[]).map((raw) => {
          const it = (raw ?? {}) as Record<string, unknown>
          return {
            action: typeof it.action === 'string' ? it.action : '',
            owner: typeof it.owner === 'string' ? it.owner : undefined,
            due: typeof it.due === 'string' ? it.due : undefined,
          }
        }).filter((a) => a.action)
      : []
    const sentiment = ['positive', 'neutral', 'mixed', 'negative'].includes(p.sentiment) ? p.sentiment : undefined
    return {
      summary: typeof p.summary === 'string' ? p.summary : '',
      decisions: asStringArray(p.decisions),
      actionItems,
      risks: asStringArray(p.risks),
      nextSteps: asStringArray(p.nextSteps),
      sentiment,
      usedFallback: false,
    }
  } catch (error) {
    console.error('Closeout generation failed:', error)
    return { ...createFallbackEngagementCloseout(ctx), usedFallback: true }
  }
}

export interface ArchitectureDiagram {
  title: string
  /** Raw Mermaid source (no code fences). */
  mermaid: string
  explanation?: string
}

export async function generateArchitectureDiagram(
  ctx: EngagementGenContext & { style?: 'flowchart' | 'sequence' | 'c4' }
): Promise<ArchitectureDiagram> {
  const style = ctx.style ?? 'flowchart'
  const header = style === 'sequence' ? 'sequenceDiagram' : style === 'c4' ? 'C4Context' : 'flowchart TD'
  const prompt = `You are a Microsoft cloud solution architect. Produce a ${style} architecture diagram in Mermaid syntax grounded in the context.

CONTEXT:
${buildEngagementContextBlock(ctx)}

RULES:
- Output VALID Mermaid ${header} syntax.
- Prefer Azure / Microsoft services where implied. Keep node labels short.
- Do NOT wrap the mermaid in markdown code fences.

Return JSON:
{ "title": "...", "mermaid": "<raw mermaid source>", "explanation": "1-2 sentences" }`
  try {
    const result = await callAIForTask('engagement-diagram', prompt, { expectJson: true })
    const p = JSON.parse(result)
    let mermaid = typeof p.mermaid === 'string' ? p.mermaid : ''
    mermaid = mermaid.replace(/^```(?:mermaid)?\s*/i, '').replace(/```\s*$/i, '').trim()
    return {
      title: typeof p.title === 'string' ? p.title : 'Architecture Diagram',
      mermaid: mermaid || `${header}\n  A[Customer] --> B[Microsoft Azure]`,
      explanation: typeof p.explanation === 'string' ? p.explanation : undefined,
    }
  } catch (error) {
    console.error('Diagram generation failed:', error)
    return { title: 'Architecture Diagram', mermaid: 'flowchart TD\n  A[Customer] --> B[Microsoft Azure]\n  B --> C[Solution]' }
  }
}

/**
 * Global LLM API - provides window.llm() for AI calls throughout the application
 */
export const llmAPI = {
  llm: callOpenAI,
  callForTask: callAIForTask,
  estimateEffort,
  generateCustomerJourney,
  clearCache: clearAICache,
  getCacheStats,
  getModelForTask,
}

// Make it available on window for global access
declare global {
  interface Window {
    llm: typeof callOpenAI
    llmForTask: typeof callAIForTask
    estimateEffort: typeof estimateEffort
    estimateROI: typeof estimateROI
    generateSuccessMetrics: typeof generateSuccessMetrics
    clearAICache: typeof clearAICache
    getAICacheStats: typeof getCacheStats
  }
}

if (typeof window !== 'undefined') {
  window.llm = callOpenAI
  window.llmForTask = callAIForTask
  window.estimateEffort = estimateEffort
  window.estimateROI = estimateROI
  window.generateSuccessMetrics = generateSuccessMetrics
  window.clearAICache = clearAICache
  window.getAICacheStats = getCacheStats
}

// ============================================================================
// SUCCESS METRICS GENERATOR
// ============================================================================

export interface SuccessMetric {
  name: string
  description: string
  measurementMethod: string
  targetValue: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  category: 'efficiency' | 'quality' | 'financial' | 'satisfaction' | 'adoption'
}

export interface SuccessMetricsResult {
  metrics: SuccessMetric[]
  baselineSuggestions: string[]
  measurementPlan: string
  generatedAt: number
}

/**
 * Generate success metrics (KPIs) for a use case
 */
export async function generateSuccessMetrics(
  useCase: { title: string; description: string; category?: string },
  context?: {
    industry?: string
    coiEstimate?: number
    entityType?: EntityType
  }
): Promise<SuccessMetricsResult> {
  const entityContext = context?.entityType 
    ? context.entityType === 'government' 
      ? 'This is a government agency - focus on citizen outcomes, budget efficiency, and compliance metrics.'
      : context.entityType === 'non-profit'
      ? 'This is a non-profit - focus on mission impact, donor efficiency, and program effectiveness.'
      : ''
    : ''

  const prompt = `Generate success metrics (KPIs) for measuring the success of this AI use case implementation.

USE CASE:
Title: ${useCase.title}
Description: ${useCase.description}
Category: ${useCase.category || 'General'}
${context?.industry ? `Industry: ${context.industry}` : ''}
${context?.coiEstimate ? `Estimated Annual Impact: $${context.coiEstimate.toLocaleString()}` : ''}
${entityContext}

Generate 4-6 specific, measurable KPIs that would demonstrate the success of this initiative.

Return valid JSON matching this structure:
{
  "metrics": [
    {
      "name": "Short metric name (e.g., 'Time to Resolution')",
      "description": "What this metric measures",
      "measurementMethod": "How to measure/collect this data",
      "targetValue": "Specific target (e.g., '50% reduction', '<2 hours', '>90%')",
      "frequency": "daily|weekly|monthly|quarterly",
      "category": "efficiency|quality|financial|satisfaction|adoption"
    }
  ],
  "baselineSuggestions": [
    "Suggestion for measuring current state before implementation"
  ],
  "measurementPlan": "Brief paragraph on how to track these metrics over time"
}

Focus on metrics that are:
1. Specific and measurable
2. Relevant to the use case outcomes
3. Achievable within 6-12 months
4. Tied to business value`

  try {
    const response = await callAIForTask('analysis', prompt, {
      systemPrompt: 'You are a business analyst expert at defining KPIs and success metrics for technology initiatives. Return only valid JSON.',
      expectJson: true,
    })

    const result = JSON.parse(response)
    return {
      metrics: result.metrics || [],
      baselineSuggestions: result.baselineSuggestions || [],
      measurementPlan: result.measurementPlan || '',
      generatedAt: Date.now(),
    }
  } catch (error) {
    console.error('Failed to generate success metrics:', error)
    // Return default metrics based on category
    return {
      metrics: [
        {
          name: 'Time Savings',
          description: 'Reduction in time spent on manual tasks',
          measurementMethod: 'Compare time logs before and after implementation',
          targetValue: '40% reduction',
          frequency: 'monthly',
          category: 'efficiency',
        },
        {
          name: 'User Adoption Rate',
          description: 'Percentage of target users actively using the solution',
          measurementMethod: 'Track unique active users vs. total eligible users',
          targetValue: '>80% adoption within 3 months',
          frequency: 'weekly',
          category: 'adoption',
        },
        {
          name: 'Error Rate Reduction',
          description: 'Decrease in errors or exceptions',
          measurementMethod: 'Compare error logs before and after',
          targetValue: '50% reduction',
          frequency: 'monthly',
          category: 'quality',
        },
        {
          name: 'Cost Savings Realized',
          description: 'Actual cost savings from efficiency gains',
          measurementMethod: 'Track labor hours saved × hourly cost',
          targetValue: `$${((context?.coiEstimate || 100000) * 0.3).toLocaleString()} annually`,
          frequency: 'quarterly',
          category: 'financial',
        },
      ],
      baselineSuggestions: [
        'Measure current process time for key workflows',
        'Document current error rates and exceptions',
        'Survey current user satisfaction levels',
      ],
      measurementPlan: 'Establish baseline metrics 2-4 weeks before go-live. Track weekly during initial rollout, then monthly for ongoing monitoring.',
      generatedAt: Date.now(),
    }
  }
}

// ============================================================================
// AI GOVERNANCE ACTION PLAN GENERATION
// ============================================================================

export interface GovernanceActionPlanInput {
  dimensionScores: Record<AIGovernanceDimension, AIGovernanceMaturityLevel>
  overallMaturity: number
  gaps: GovernanceGap[]
  entityType?: EntityType
  industry?: string
  useCaseTitles?: string[]
}

/**
 * Generate an AI-powered governance action plan from governance assessment data.
 * Falls back to deterministic recommendations if AI is unavailable.
 */
export async function generateGovernanceActionPlan(
  input: GovernanceActionPlanInput
): Promise<GovernanceActionPlan> {
  const dimensionSummary = Object.entries(input.dimensionScores)
    .map(([dim, level]) => `- ${AI_GOVERNANCE_DIMENSION_LABELS[dim as AIGovernanceDimension]}: ${AI_GOVERNANCE_MATURITY_CONFIG[level].label} (${AI_GOVERNANCE_MATURITY_CONFIG[level].numericValue}/5)`)
    .join('\n')

  const gapSummary = input.gaps.length > 0
    ? input.gaps.map(g => `- ${AI_GOVERNANCE_DIMENSION_LABELS[g.dimension]}: ${g.gap} [Impact: ${g.impact}]`).join('\n')
    : 'No critical gaps identified.'

  const useCaseContext = input.useCaseTitles && input.useCaseTitles.length > 0
    ? `\nPLANNED AI USE CASES:\n${input.useCaseTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : ''

  const prompt = `You are a senior AI governance advisor specializing in Microsoft Responsible AI Standard and NIST AI RMF.

ORGANIZATION CONTEXT:
${input.entityType ? `Organization type: ${input.entityType}` : ''}
${input.industry ? `Industry: ${input.industry}` : ''}
Overall AI Governance Maturity: ${input.overallMaturity.toFixed(1)}/5

DIMENSION SCORES:
${dimensionSummary}

IDENTIFIED GAPS:
${gapSummary}
${useCaseContext}

TASK: Create a prioritized AI Governance Action Plan with concrete, actionable recommendations organized by timeframe.

For each recommendation, provide:
- dimension: The governance dimension it addresses (use exact keys: ai-strategy, data-governance, model-lifecycle, ethics-fairness, security-privacy, monitoring-accountability)
- priority: "critical" | "recommended" | "optional"
- action: A clear, specific action (1-2 sentences)
- rationale: Why this matters for the organization
- timeframe: "short-term" | "medium-term" | "long-term"

Also provide an overall readiness statement (2-3 sentences) summarizing the organization's AI governance posture and top priorities.

Return a JSON object:
{
  "shortTerm": [{ "dimension": "...", "priority": "...", "action": "...", "rationale": "...", "timeframe": "short-term" }],
  "mediumTerm": [{ "dimension": "...", "priority": "...", "action": "...", "rationale": "...", "timeframe": "medium-term" }],
  "longTerm": [{ "dimension": "...", "priority": "...", "action": "...", "rationale": "...", "timeframe": "long-term" }],
  "overallReadinessStatement": "..."
}

RULES:
- Include 3-5 short-term actions (0-3 months), 3-4 medium-term (3-12 months), 2-3 long-term (12+ months)
- Prioritize gaps with "high" impact first
- Be specific to the organization type and industry
- Reference Microsoft Responsible AI Standard, NIST AI RMF, ISO 42001, or EU AI Act where relevant
- For each action, use clear imperative language ("Establish...", "Implement...", "Document...")`

  try {
    const raw = await callAIForTask('governance', prompt, { expectJson: true })
    const parsed = JSON.parse(raw)
    let recId = 0
    const mapRec = (r: Record<string, string>): GovernanceRecommendation => {
      recId++
      return {
        id: `gov-ai-${recId}`,
        dimension: (r.dimension || 'ai-strategy') as AIGovernanceDimension,
        priority: (r.priority || 'recommended') as GovernanceRecommendation['priority'],
        action: r.action || '',
        rationale: r.rationale || '',
        timeframe: (r.timeframe || 'medium-term') as GovernanceRecommendation['timeframe'],
      }
    }

    return {
      shortTerm: (parsed.shortTerm || []).map(mapRec),
      mediumTerm: (parsed.mediumTerm || []).map(mapRec),
      longTerm: (parsed.longTerm || []).map(mapRec),
      overallReadinessStatement: parsed.overallReadinessStatement || 'Assessment complete. Review recommendations for next steps.',
      generatedAt: Date.now(),
    }
  } catch (error) {
    console.error('[AI Governance] Action plan generation failed, using fallback:', error)
    return createFallbackActionPlan(input)
  }
}

/** Deterministic fallback when AI is unavailable */
function createFallbackActionPlan(input: GovernanceActionPlanInput): GovernanceActionPlan {
  const { gaps } = input
  let recId = 0
  const highGaps = gaps.filter(g => g.impact === 'high')
  const mediumGaps = gaps.filter(g => g.impact === 'medium')

  const shortTerm: GovernanceRecommendation[] = highGaps.slice(0, 4).map(g => {
    recId++
    return {
      id: `gov-fb-${recId}`,
      dimension: g.dimension,
      priority: 'critical' as const,
      action: `Address critical gap in ${AI_GOVERNANCE_DIMENSION_LABELS[g.dimension]}: ${g.gap}`,
      rationale: `Current level (${AI_GOVERNANCE_MATURITY_CONFIG[g.currentLevel].label}) is significantly below target (${AI_GOVERNANCE_MATURITY_CONFIG[g.targetLevel].label})`,
      timeframe: 'short-term' as const,
    }
  })

  const mediumTerm: GovernanceRecommendation[] = mediumGaps.slice(0, 3).map(g => {
    recId++
    return {
      id: `gov-fb-${recId}`,
      dimension: g.dimension,
      priority: 'recommended' as const,
      action: `Improve ${AI_GOVERNANCE_DIMENSION_LABELS[g.dimension]} from ${AI_GOVERNANCE_MATURITY_CONFIG[g.currentLevel].label} to ${AI_GOVERNANCE_MATURITY_CONFIG[g.targetLevel].label}`,
      rationale: g.gap,
      timeframe: 'medium-term' as const,
    }
  })

  const longTerm: GovernanceRecommendation[] = [{
    id: `gov-fb-${++recId}`,
    dimension: 'ai-strategy' as const,
    priority: 'optional' as const,
    action: 'Establish continuous AI governance maturity improvement process with annual reassessment',
    rationale: 'Ongoing governance maturity enables sustainable AI adoption at scale',
    timeframe: 'long-term' as const,
  }]

  const maturityLabel = input.overallMaturity >= 3.5 ? 'strong'
    : input.overallMaturity >= 2.5 ? 'developing'
    : 'early-stage'

  return {
    shortTerm,
    mediumTerm,
    longTerm,
    overallReadinessStatement: `The organization has a ${maturityLabel} AI governance posture (${input.overallMaturity.toFixed(1)}/5). ${highGaps.length > 0 ? `Priority attention needed in ${highGaps.map(g => AI_GOVERNANCE_DIMENSION_LABELS[g.dimension]).join(', ')}.` : 'No critical gaps identified \u2014 focus on continuous improvement.'}`,
    generatedAt: Date.now(),
  }
}
