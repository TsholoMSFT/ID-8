/**
 * Persistence hooks for the FY27 alignment cockpit.
 *
 * Each hook wraps `useLocalStorage` (same pattern as `use-opportunities.ts`) and
 * exposes small, typed CRUD + domain helpers on top of the pure engines.
 */
import { useLocalStorage } from './use-local-storage'
import type {
  Blocker,
  BlockerStatus,
  SecureAIAssessment,
  StakeholderRelationship,
  Interaction,
  BuyerPersona,
  TransformationRoadmap,
  ConsumptionDataPoint,
} from '@/lib/fy27-types'
import { DEFAULT_BUYER_PERSONAS } from '@/lib/fy27-types'
import { resolveBlocker } from '@/lib/blocker-engine'

// ── Blockers ─────────────────────────────────────────────────────────────

export function useBlockers() {
  const [blockers, setBlockers] = useLocalStorage<Blocker[]>('id8-blockers', [])
  const list = blockers || []

  const upsert = (b: Blocker) =>
    setBlockers((cur) => {
      const arr = cur || []
      const idx = arr.findIndex((x) => x.id === b.id)
      if (idx === -1) return [...arr, b]
      const next = arr.slice()
      next[idx] = b
      return next
    })

  const remove = (id: string) => setBlockers((cur) => (cur || []).filter((x) => x.id !== id))
  const getById = (id: string) => list.find((x) => x.id === id)
  const forAccount = (accountId: string) => list.filter((x) => x.accountId === accountId)

  const setStatus = (id: string, status: BlockerStatus, resolutionNotes?: string) => {
    const b = getById(id)
    if (!b) return
    if (status === 'resolved') upsert(resolveBlocker(b, resolutionNotes))
    else upsert({ ...b, status, updatedAt: Date.now() })
  }

  return { blockers: list, upsert, remove, getById, forAccount, setStatus }
}

// ── Secure AI Assessments ──────────────────────────────────────────────────

export function useSecureAIAssessments() {
  const [assessments, setAssessments] = useLocalStorage<SecureAIAssessment[]>(
    'id8-secure-ai-assessments',
    [],
  )
  const list = assessments || []

  const upsert = (a: SecureAIAssessment) =>
    setAssessments((cur) => {
      const arr = cur || []
      const idx = arr.findIndex((x) => x.id === a.id)
      if (idx === -1) return [...arr, a]
      const next = arr.slice()
      next[idx] = a
      return next
    })

  const remove = (id: string) => setAssessments((cur) => (cur || []).filter((x) => x.id !== id))
  const forAccount = (accountId: string) => list.filter((x) => x.accountId === accountId)

  /** The active assessment for an account (highest version). */
  const current = (accountId?: string): SecureAIAssessment | undefined => {
    const scoped = accountId ? forAccount(accountId) : list
    return scoped
      .filter((x) => x.status === 'active')
      .sort((a, b) => b.version - a.version)[0]
  }

  /**
   * Save a (possibly refreshed) assessment, superseding any prior active
   * assessment for the same account.
   */
  const save = (a: SecureAIAssessment) =>
    setAssessments((cur) => {
      const arr = (cur || []).map((x) =>
        x.accountId && x.accountId === a.accountId && x.status === 'active' && x.id !== a.id
          ? { ...x, status: 'superseded' as const }
          : x,
      )
      const idx = arr.findIndex((x) => x.id === a.id)
      if (idx === -1) return [...arr, a]
      const next = arr.slice()
      next[idx] = a
      return next
    })

  return { assessments: list, upsert, remove, forAccount, current, save }
}

// ── Relationships + interactions + personas ─────────────────────────────────

export function useRelationships() {
  const [relationships, setRelationships] = useLocalStorage<StakeholderRelationship[]>(
    'id8-relationships',
    [],
  )
  const [interactions, setInteractions] = useLocalStorage<Interaction[]>('id8-interactions', [])
  const [personas, setPersonas] = useLocalStorage<BuyerPersona[]>(
    'id8-buyer-personas',
    DEFAULT_BUYER_PERSONAS,
  )

  const relList = relationships || []
  const intxList = interactions || []
  const personaList = personas && personas.length ? personas : DEFAULT_BUYER_PERSONAS

  const upsertRelationship = (r: StakeholderRelationship) =>
    setRelationships((cur) => {
      const arr = cur || []
      const idx = arr.findIndex((x) => x.id === r.id)
      if (idx === -1) return [...arr, r]
      const next = arr.slice()
      next[idx] = r
      return next
    })

  const removeRelationship = (id: string) =>
    setRelationships((cur) => (cur || []).filter((x) => x.id !== id))

  const addInteraction = (i: Interaction) => setInteractions((cur) => [...(cur || []), i])
  const removeInteraction = (id: string) =>
    setInteractions((cur) => (cur || []).filter((x) => x.id !== id))

  return {
    relationships: relList,
    interactions: intxList,
    personas: personaList,
    upsertRelationship,
    removeRelationship,
    addInteraction,
    removeInteraction,
    setPersonas,
  }
}

// ── Roadmaps ────────────────────────────────────────────────────────────

export function useRoadmaps() {
  const [roadmaps, setRoadmaps] = useLocalStorage<TransformationRoadmap[]>('id8-roadmaps', [])
  const list = roadmaps || []

  const upsert = (r: TransformationRoadmap) =>
    setRoadmaps((cur) => {
      const arr = cur || []
      const idx = arr.findIndex((x) => x.id === r.id)
      if (idx === -1) return [...arr, r]
      const next = arr.slice()
      next[idx] = r
      return next
    })

  const remove = (id: string) => setRoadmaps((cur) => (cur || []).filter((x) => x.id !== id))
  const forAccount = (accountId: string) => list.filter((x) => x.accountId === accountId)

  return { roadmaps: list, upsert, remove, forAccount }
}

// ── Consumption ACR history (raw inputs; plans are derived) ─────────────────

export function useConsumptionHistory() {
  const [historyByAccount, setHistoryByAccount] = useLocalStorage<Record<string, ConsumptionDataPoint[]>>(
    'id8-consumption-history',
    {},
  )
  const map = historyByAccount || {}

  const getHistory = (accountId: string): ConsumptionDataPoint[] => map[accountId] || []
  const setHistory = (accountId: string, points: ConsumptionDataPoint[]) =>
    setHistoryByAccount((cur) => ({ ...(cur || {}), [accountId]: points }))

  return { historyByAccount: map, getHistory, setHistory }
}
