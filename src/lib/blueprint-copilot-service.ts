/**
 * Blueprint Copilot Service
 * ----------------------------------------------------------------------------
 * Orchestrator powering the right-rail "AI assistant" inside the Solution
 * Blueprint workspace. Wraps:
 *   - IQ connector calls (grounded discovery)
 *   - Archetype recommendation (LLM tiebreaker over recommender.ts output)
 *   - Use-case generation from grounded IQ context
 *   - Executive briefing (premium model)
 *
 * Records actual provider token usage for display. Durable server quotas,
 * not this browser ledger, authorize billable work.
 */

import { callAIForTask, type AIUsageMetadata } from './openai-service'
import { ARCHETYPES, type ArchetypeDef, type UseCaseInput, type TechnologyEstate } from './solution-blueprint'
import {
  graphSearch,
  foundryKnowledge,
  fabricWorkspaces,
  workRetrieval,
  type IQHit,
  type IQQueryResponse,
} from './iq-service'

// ── Types ──────────────────────────────────────────────────────────────────
export type BlueprintAIMode = 'off' | 'suggest' | 'autopilot'

export interface CopilotSuggestion {
  id: string
  /** What tab the suggestion belongs to. */
  tab: 'connect-data' | 'use-cases' | 'blueprints' | 'commitments' | 'estate'
  title: string
  detail: string
  /** Approx cents the action will spend if invoked. */
  estCostCents: number
  /** Whether the action is safe to auto-run in autopilot mode. */
  safeToAutorun: boolean
  /** Internal action id the rail uses to dispatch. */
  action:
    | 'pull-iq'
    | 'generate-use-cases'
    | 'recommend-archetype'
    | 'generate-business-case'
    | 'generate-exec-brief'
    | 'open-tab'
}

export interface CopilotState {
  customerId: string | null
  customerName: string | null
  hasEstate: boolean
  iqPulledAt: number | null
  useCaseCount: number
  hasActiveUseCase: boolean
  activeUseCaseHasArchetype: boolean
  hasBlueprint: boolean
}

export interface SpendLedger {
  customerId: string
  callCount: number
  totalTokens: number
  cachedCalls: number
  unknownUsageCalls: number
  byModel: Record<string, { calls: number; tokens: number }>
  events: Array<{ at: number; action: string; model: string; tokens?: number; cached: boolean }>
}

const LEDGER_KEY = 'id8-copilot-token-ledger-v2'

// ── Cost ledger (localStorage) ─────────────────────────────────────────────
function readLedgers(): Record<string, SpendLedger> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(LEDGER_KEY) || '{}')
  } catch {
    return {}
  }
}
function writeLedgers(all: Record<string, SpendLedger>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LEDGER_KEY, JSON.stringify(all))
}

export function getLedger(customerId: string): SpendLedger {
  const all = readLedgers()
  return (
    all[customerId] || { customerId, callCount: 0, totalTokens: 0, cachedCalls: 0, unknownUsageCalls: 0, byModel: {}, events: [] }
  )
}

export function recordSpend(
  customerId: string,
  action: string,
  metadata: AIUsageMetadata,
): SpendLedger {
  const model = metadata.deployment || metadata.model || 'unspecified deployment'
  const tokens = metadata.usage?.total_tokens
  const all = readLedgers()
  const cur = getLedger(customerId)
  cur.callCount += 1
  cur.totalTokens += tokens ?? 0
  cur.cachedCalls += metadata.cached ? 1 : 0
  cur.unknownUsageCalls += tokens === undefined ? 1 : 0
  cur.byModel[model] = cur.byModel[model] || { calls: 0, tokens: 0 }
  cur.byModel[model].calls += 1
  cur.byModel[model].tokens += tokens ?? 0
  cur.events.unshift({ at: Date.now(), action, model, tokens, cached: metadata.cached })
  cur.events = cur.events.slice(0, 50)
  all[customerId] = cur
  writeLedgers(all)
  return cur
}

// ── Suggestion engine (deterministic — no LLM) ─────────────────────────────
export function nextSuggestions(state: CopilotState): CopilotSuggestion[] {
  const out: CopilotSuggestion[] = []
  if (!state.customerId) return out

  if (!state.iqPulledAt) {
    out.push({
      id: 'pull-iq',
      tab: 'connect-data',
      title: 'Pull live signals from Microsoft 365 + Fabric',
      detail: 'Runs Graph, Foundry IQ, Fabric IQ and Work IQ in parallel. Free — uses tenant connectors only.',
      estCostCents: 0,
      safeToAutorun: true,
      action: 'pull-iq',
    })
  }

  if (state.useCaseCount === 0) {
    out.push({
      id: 'generate-use-cases',
      tab: 'use-cases',
      title: 'Generate 3 starter use cases',
      detail: 'Uses estate notes + IQ insights to seed candidate use cases the customer is likely to prioritise.',
      estCostCents: 1,
      safeToAutorun: false,
      action: 'generate-use-cases',
    })
  }

  if (state.hasActiveUseCase && !state.activeUseCaseHasArchetype) {
    out.push({
      id: 'recommend-archetype',
      tab: 'use-cases',
      title: 'Recommend best-fit archetype',
      detail: 'Combines deterministic recommender with an LLM tiebreaker grounded on the estate.',
      estCostCents: 1,
      safeToAutorun: true,
      action: 'recommend-archetype',
    })
  }

  if (state.hasBlueprint) {
    out.push({
      id: 'generate-business-case',
      tab: 'use-cases',
      title: 'Draft business case for the active use case',
      detail: 'One-pager: problem → solution → cost → value. Editable markdown.',
      estCostCents: 2,
      safeToAutorun: false,
      action: 'generate-business-case',
    })
    out.push({
      id: 'generate-exec-brief',
      tab: 'commitments',
      title: 'Generate executive 1-pager (premium)',
      detail: 'Uses GPT-4o for the final stakeholder narrative. ~5–10¢.',
      estCostCents: 8,
      safeToAutorun: false,
      action: 'generate-exec-brief',
    })
  }

  return out.slice(0, 3)
}

// ── IQ discovery (parallel pull) ───────────────────────────────────────────
export interface IQDiscoveryResult {
  graph: IQQueryResponse | null
  foundry: IQQueryResponse | null
  fabric: IQQueryResponse | null
  work: IQQueryResponse | null
  hits: IQHit[]
  /** Compact bullet summary suitable for grounding downstream prompts. */
  groundingNote: string
}

export async function runIQDiscovery(customerName: string): Promise<IQDiscoveryResult> {
  const q = customerName || ''
  const [graph, foundry, fabric, work] = await Promise.allSettled([
    graphSearch(q || '*', { mode: 'search', top: 6 }),
    foundryKnowledge(q, { top: 5 }),
    fabricWorkspaces(),
    workRetrieval(q, { top: 6 }),
  ])
  const safe = (r: PromiseSettledResult<IQQueryResponse>): IQQueryResponse | null =>
    r.status === 'fulfilled' ? r.value : null
  const g = safe(graph), f = safe(foundry), fa = safe(fabric), w = safe(work)
  const hits = [...(g?.results || []), ...(f?.results || []), ...(fa?.results || []), ...(w?.results || [])]
  const groundingNote = buildGroundingNote(g, f, fa, w)
  return { graph: g, foundry: f, fabric: fa, work: w, hits, groundingNote }
}

function buildGroundingNote(
  g: IQQueryResponse | null,
  f: IQQueryResponse | null,
  fa: IQQueryResponse | null,
  w: IQQueryResponse | null,
): string {
  const parts: string[] = []
  const summarise = (label: string, r: IQQueryResponse | null) => {
    if (!r?.configured || !r.results?.length) return
    const top = r.results.slice(0, 3).map((h) => `- ${h.title || h.snippet || h.id}`).join('\n')
    parts.push(`### ${label}\n${top}`)
  }
  summarise('Microsoft Graph (people/files/messages)', g)
  summarise('Foundry IQ (knowledge)', f)
  summarise('Fabric IQ (workspaces)', fa)
  summarise('Work IQ (LOB retrieval)', w)
  return parts.join('\n\n') || '_No grounded signals available — connectors not configured or no results._'
}

// ── LLM-backed actions ─────────────────────────────────────────────────────

export interface GeneratedUseCase {
  name: string
  description: string
  archetypeId?: string
  rationale?: string
}

export async function generateStarterUseCases(opts: {
  customerId: string
  customerName: string
  estate: TechnologyEstate
  groundingNote: string
}): Promise<GeneratedUseCase[]> {
  const archetypeCatalog = ARCHETYPES.map((a) => `- ${a.id}: ${a.name} — ${a.description}`).join('\n')
  const prompt = `You are a Microsoft Cloud Solution Architect helping shape a Build engagement for "${opts.customerName}".

## Estate notes
${opts.estate.notes || '(none)'}
Primary cloud: ${opts.estate.primaryCloud}; Identity: ${opts.estate.identityProvider}; Sovereign: ${opts.estate.sovereigntyRequired}

## Grounded signals
${opts.groundingNote}

## Available archetypes
${archetypeCatalog}

Return STRICT JSON array of EXACTLY 3 starter use cases the customer is most likely to prioritise based on the estate + signals above. Each item: { "name": string (max 60 chars), "description": string (1–2 sentences, plain English), "archetypeId": one of the ids above, "rationale": string (max 120 chars) }. No prose outside the JSON.`
  const sysPrompt = 'You output strict JSON. Never wrap in markdown fences.'
  const out = await callAIForTask('analysis', prompt, { expectJson: true, systemPrompt: sysPrompt,
    onUsage: (metadata) => recordSpend(opts.customerId, 'generate-use-cases', metadata) })
  try {
    const parsed = JSON.parse(out)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 3).map((p: any) => ({
      name: String(p.name || 'Untitled use case').slice(0, 80),
      description: String(p.description || ''),
      archetypeId: ARCHETYPES.find((a) => a.id === p.archetypeId)?.id,
      rationale: p.rationale ? String(p.rationale) : undefined,
    }))
  } catch {
    return []
  }
}

export interface ArchetypeRecommendation {
  archetypeId: string
  archetype: ArchetypeDef
  rationale: string
  alternatives: { id: string; reason: string }[]
}

export async function recommendArchetype(opts: {
  customerId: string
  useCase: UseCaseInput
  estate: TechnologyEstate
  groundingNote: string
}): Promise<ArchetypeRecommendation | null> {
  const catalog = ARCHETYPES.map((a) => `- ${a.id}: ${a.name} — ${a.description} (KPIs: ${(a.typicalKpis || []).join(', ') || 'n/a'})`).join('\n')
  const prompt = `Pick the best archetype for this use case.

Use case: "${opts.useCase.name}"
Description: ${opts.useCase.description || '(none)'}
Estate primary cloud: ${opts.estate.primaryCloud}; Sovereign required: ${opts.estate.sovereigntyRequired}
${opts.estate.notes ? `Estate notes:\n${opts.estate.notes}\n` : ''}
${opts.groundingNote ? `Grounded signals:\n${opts.groundingNote}\n` : ''}

Candidates:
${catalog}

Return STRICT JSON: { "archetypeId": "<id>", "rationale": "<≤200 chars why this fits>", "alternatives": [ {"id":"<id>","reason":"<≤120 chars>"} (up to 2) ] }`
  const out = await callAIForTask('analysis', prompt, { expectJson: true, systemPrompt: 'Strict JSON only, no fences.',
    onUsage: (metadata) => recordSpend(opts.customerId, 'recommend-archetype', metadata) })
  try {
    const parsed = JSON.parse(out)
    const archetype = ARCHETYPES.find((a) => a.id === parsed.archetypeId)
    if (!archetype) return null
    return {
      archetypeId: archetype.id,
      archetype,
      rationale: String(parsed.rationale || ''),
      alternatives: Array.isArray(parsed.alternatives)
        ? parsed.alternatives
            .filter((a: any) => ARCHETYPES.find((x) => x.id === a?.id))
            .slice(0, 2)
            .map((a: any) => ({ id: a.id, reason: String(a.reason || '') }))
        : [],
    }
  } catch {
    return null
  }
}

export async function generateExecBrief(opts: {
  customerId: string
  customerName: string
  estate: TechnologyEstate
  useCases: Array<{ name: string; description?: string; archetypeName?: string }>
  groundingNote: string
}): Promise<string> {
  const ucList = opts.useCases.map((u, i) => `${i + 1}. ${u.name}${u.archetypeName ? ` (${u.archetypeName})` : ''} — ${u.description || ''}`).join('\n')
  const prompt = `Write a crisp, board-ready 1-page executive brief for "${opts.customerName}".

Estate snapshot
- Primary cloud: ${opts.estate.primaryCloud}
- Identity provider: ${opts.estate.identityProvider}
- Sovereignty required: ${opts.estate.sovereigntyRequired ? 'yes' : 'no'}
${opts.estate.notes ? `- Notes: ${opts.estate.notes.slice(0, 600)}` : ''}

Selected use cases
${ucList || '(none yet)'}

Grounded signals
${opts.groundingNote}

Sections (in order, markdown):
1. **Strategic context** (3 sentences)
2. **What we will build** (one-line per use case + the headline business outcome)
3. **Why now** (2–3 bullets, evidence-led)
4. **Microsoft commitments** (3 bullets)
5. **Customer commitments** (3 bullets)
6. **Decision asked** (1 sentence)

Tone: confident, plain English, no fluff. ≤ 350 words.`
  const out = await callAIForTask('executive', prompt, { systemPrompt: 'You are a Microsoft enterprise narrative writer.',
    onUsage: (metadata) => recordSpend(opts.customerId, 'generate-exec-brief', metadata) })
  return out
}
