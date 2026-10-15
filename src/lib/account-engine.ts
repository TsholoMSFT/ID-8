/**
 * Account Engine — manages Account entities and computes aggregated metrics.
 * Uses localStorage for persistence (same pattern as sessions/customers).
 */
import type {
  Account,
  Workload,
  DiscoverySession,
  UseCase,
  ConsumptionEstimate,
  ConsumptionTShirt,
  SolutionArea,
  AccountHealthRating,
} from './types'

const ACCOUNTS_STORAGE_KEY = 'id8-accounts'
const WORKLOADS_STORAGE_KEY = 'id8-workloads'

// ============================================================================
// PERSISTENCE
// ============================================================================

export function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveAccounts(accounts: Account[]): void {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts))
}

export function loadWorkloads(): Workload[] {
  try {
    const raw = localStorage.getItem(WORKLOADS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveWorkloads(workloads: Workload[]): void {
  localStorage.setItem(WORKLOADS_STORAGE_KEY, JSON.stringify(workloads))
}

// ============================================================================
// ACCOUNT CRUD
// ============================================================================

export function createAccount(partial: Partial<Account> & { name: string }): Account {
  const accounts = loadAccounts()
  const account: Account = {
    id: `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: partial.name,
    accountSegment: partial.accountSegment || 'enterprise',
    team: partial.team || [],
    maccCommitment: partial.maccCommitment,
    fiscalYear: partial.fiscalYear,
    fiscalQuarter: partial.fiscalQuarter,
    sessionIds: partial.sessionIds || [],
    workloadIds: partial.workloadIds || [],
    healthRating: partial.healthRating || 'unknown',
    healthNotes: partial.healthNotes,
    technologyPlanSummary: partial.technologyPlanSummary,
    createdAt: Date.now(),
  }
  accounts.push(account)
  saveAccounts(accounts)
  return account
}

export function updateAccount(id: string, updates: Partial<Account>): Account | null {
  const accounts = loadAccounts()
  const idx = accounts.findIndex((a) => a.id === id)
  if (idx === -1) return null
  accounts[idx] = { ...accounts[idx], ...updates, updatedAt: Date.now() }
  saveAccounts(accounts)
  return accounts[idx]
}

export function deleteAccount(id: string): boolean {
  const accounts = loadAccounts()
  const filtered = accounts.filter((a) => a.id !== id)
  if (filtered.length === accounts.length) return false
  saveAccounts(filtered)
  return true
}

export function getAccountById(id: string): Account | null {
  return loadAccounts().find((a) => a.id === id) || null
}

export function linkSessionToAccount(accountId: string, sessionId: string): void {
  const account = getAccountById(accountId)
  if (!account) return
  if (!account.sessionIds.includes(sessionId)) {
    updateAccount(accountId, { sessionIds: [...account.sessionIds, sessionId] })
  }
}

export function linkWorkloadToAccount(accountId: string, workloadId: string): void {
  const account = getAccountById(accountId)
  if (!account) return
  if (!account.workloadIds.includes(workloadId)) {
    updateAccount(accountId, { workloadIds: [...account.workloadIds, workloadId] })
  }
}

// ============================================================================
// WORKLOAD CRUD
// ============================================================================

export function createWorkload(partial: Partial<Workload> & { name: string }): Workload {
  const workloads = loadWorkloads()
  const workload: Workload = {
    id: `wl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: partial.name,
    description: partial.description || '',
    type: partial.type || 'migration',
    solutionArea: partial.solutionArea || 'infrastructure',
    sourceSystem: partial.sourceSystem,
    targetServices: partial.targetServices || [],
    modernizationPath: partial.modernizationPath,
    consumptionEstimate: partial.consumptionEstimate,
    migrationReadiness: partial.migrationReadiness ?? 0,
    blockers: partial.blockers || [],
    competitors: partial.competitors || [],
    partner: partial.partner,
    linkedUseCaseIds: partial.linkedUseCaseIds || [],
    endOfSupportDate: partial.endOfSupportDate,
    priority: partial.priority || 'medium',
    status: partial.status || 'identified',
    notes: partial.notes,
    accountId: partial.accountId,
    createdAt: Date.now(),
  }
  workloads.push(workload)
  saveWorkloads(workloads)
  return workload
}

export function updateWorkload(id: string, updates: Partial<Workload>): Workload | null {
  const workloads = loadWorkloads()
  const idx = workloads.findIndex((w) => w.id === id)
  if (idx === -1) return null
  workloads[idx] = { ...workloads[idx], ...updates, updatedAt: Date.now() }
  saveWorkloads(workloads)
  return workloads[idx]
}

export function deleteWorkload(id: string): boolean {
  const workloads = loadWorkloads()
  const filtered = workloads.filter((w) => w.id !== id)
  if (filtered.length === workloads.length) return false
  saveWorkloads(filtered)
  return true
}

export function getWorkloadById(id: string): Workload | null {
  return loadWorkloads().find((w) => w.id === id) || null
}

export function getWorkloadsForAccount(accountId: string): Workload[] {
  const account = getAccountById(accountId)
  if (!account) return []
  const allWorkloads = loadWorkloads()
  return allWorkloads.filter((w) => account.workloadIds.includes(w.id))
}

// ============================================================================
// AGGREGATION & METRICS
// ============================================================================

export interface AccountMetrics {
  totalSessions: number
  totalUseCases: number
  totalWorkloads: number
  totalEstimatedConsumption: number  // Monthly USD
  maccBurnRate: number               // Months remaining at current ACR
  maccOnTrack: boolean
  workloadsBySolutionArea: Record<SolutionArea, number>
  averageReadinessScore: number
  priorityCriticalCount: number
  healthRating: AccountHealthRating
}

export function computeAccountMetrics(
  account: Account,
  _sessions: DiscoverySession[],
  useCases: UseCase[],
): AccountMetrics {
  const workloads = getWorkloadsForAccount(account.id)
  
  // Consumption from use cases
  const useCaseConsumption = useCases
    .filter((uc) => uc.consumptionEstimate)
    .reduce((sum, uc) => sum + (uc.consumptionEstimate?.estimatedMonthly || 0), 0)
  
  // Consumption from workloads
  const workloadConsumption = workloads
    .filter((w) => w.consumptionEstimate)
    .reduce((sum, w) => sum + (w.consumptionEstimate?.estimatedMonthly || 0), 0)

  const totalConsumption = useCaseConsumption + workloadConsumption

  // MACC burn rate
  const macc = account.maccCommitment
  let maccBurnRate = 0
  let maccOnTrack = true
  if (macc && macc.currentACR > 0) {
    maccBurnRate = macc.remainingBalance / macc.currentACR // months
    const monthsRemaining = (macc.endDate - Date.now()) / (1000 * 60 * 60 * 24 * 30)
    maccOnTrack = maccBurnRate <= monthsRemaining * 1.1 // Within 10% buffer
  }

  // Workloads by solution area
  const bySolutionArea: Record<SolutionArea, number> = {
    'infrastructure': 0,
    'data-ai': 0,
    'digital-app-innovation': 0,
    'modern-work': 0,
    'security': 0,
    'biz-apps': 0,
  }
  for (const w of workloads) {
    bySolutionArea[w.solutionArea] = (bySolutionArea[w.solutionArea] || 0) + 1
  }

  // Average readiness
  const readinessScores = workloads.filter((w) => w.migrationReadiness > 0).map((w) => w.migrationReadiness)
  const avgReadiness = readinessScores.length > 0
    ? Math.round(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length)
    : 0

  const criticalCount = workloads.filter((w) => w.priority === 'critical').length

  return {
    totalSessions: account.sessionIds.length,
    totalUseCases: useCases.length,
    totalWorkloads: workloads.length,
    totalEstimatedConsumption: totalConsumption,
    maccBurnRate,
    maccOnTrack,
    workloadsBySolutionArea: bySolutionArea,
    averageReadinessScore: avgReadiness,
    priorityCriticalCount: criticalCount,
    healthRating: account.healthRating,
  }
}

// ============================================================================
// CONSUMPTION ESTIMATION HELPERS
// ============================================================================

/** Map a T-shirt size to its midpoint monthly value */
export function tShirtToMonthly(size: ConsumptionTShirt): number {
  const ranges: Record<ConsumptionTShirt, { min: number; max: number }> = {
    xs: { min: 0, max: 1000 },
    sm: { min: 1000, max: 5000 },
    md: { min: 5000, max: 25000 },
    lg: { min: 25000, max: 100000 },
    xl: { min: 100000, max: 250000 },
  }
  const r = ranges[size]
  return Math.round((r.min + r.max) / 2)
}

/** Estimate consumption from Azure services list */
export function estimateConsumptionFromServices(services: string[]): ConsumptionEstimate {
  // Simple heuristic — production-grade would use Azure Pricing API
  const highCostServices = ['azure-openai', 'azure-ml', 'azure-databricks', 'azure-synapse', 'azure-cosmos-db', 'azure-aks']
  const mediumCostServices = ['azure-app-service', 'azure-sql', 'azure-data-factory', 'azure-event-hubs', 'azure-iot-hub']
  
  let score = 0
  for (const svc of services) {
    const svcLower = svc.toLowerCase().replace(/\s+/g, '-')
    if (highCostServices.some((h) => svcLower.includes(h))) score += 3
    else if (mediumCostServices.some((m) => svcLower.includes(m))) score += 2
    else score += 1
  }

  let tShirtSize: ConsumptionTShirt = 'xs'
  if (score >= 12) tShirtSize = 'xl'
  else if (score >= 8) tShirtSize = 'lg'
  else if (score >= 5) tShirtSize = 'md'
  else if (score >= 2) tShirtSize = 'sm'

  return {
    tShirtSize,
    estimatedMonthly: tShirtToMonthly(tShirtSize),
    primaryServices: services.slice(0, 5),
    assumptions: 'Auto-estimated from service list. Refine with actual sizing.',
    estimatedAt: Date.now(),
  }
}
