/**
 * Engagement data provider — the integration seam.
 * ----------------------------------------------------------------------------
 * Today the only implementation (`localEngagementProvider`) aggregates ID-8's
 * OWN local data (accounts, discovery sessions, use cases, engagements) into a
 * portfolio "Hub Business Audit" rollup, optionally enriched by a CEHub /
 * Dataverse CSV export. A future Dataverse/Graph-backed provider can replace it
 * via `createEngagementProvider()` without changing any callers.
 */
import type { Account, DiscoverySession, UseCase, Engagement } from '@/lib/types'
import { calculateRiskAdjustedFinancial } from '@/lib/scoring'

export interface PortfolioRollupInput {
  accounts?: Account[]
  sessions?: DiscoverySession[]
  useCases?: UseCase[]
  engagements?: Engagement[]
  /** Optional rows imported from a CEHub / Dataverse CSV export. */
  imported?: ImportedEngagementRow[]
}

export interface PortfolioRollup {
  totalEngagements: number
  engagementsByStatus: Record<string, number>
  engagementsByType: Record<string, number>
  accountCount: number
  accountsByHealth: Record<string, number>
  maccTotalUSD: number
  maccRemainingUSD: number
  maccConsumedPct: number
  currentACRMonthlyUSD: number
  sessionCount: number
  useCaseCount: number
  /** Confidence-weighted (risk-adjusted) annual pipeline value across use cases. */
  pipelineAnnualValueUSD: number
  atRiskAccounts: Array<{ name: string; healthRating: string; remainingUSD?: number }>
  importedEngagementCount: number
  generatedAt: number
}

export interface EngagementDataProvider {
  readonly source: 'local' | 'csv-import' | 'dataverse' | 'graph'
  getPortfolioRollup(input: PortfolioRollupInput): Promise<PortfolioRollup>
}

/** Pure aggregation over the supplied ID-8 data (no I/O). Exported for tests. */
export function computePortfolioRollup(input: PortfolioRollupInput): PortfolioRollup {
  const accounts = input.accounts ?? []
  const sessions = input.sessions ?? []
  const useCases = input.useCases ?? []
  const engagements = input.engagements ?? []
  const imported = input.imported ?? []

  const engagementsByStatus: Record<string, number> = {}
  const engagementsByType: Record<string, number> = {}
  for (const e of engagements) {
    engagementsByStatus[e.status] = (engagementsByStatus[e.status] ?? 0) + 1
    engagementsByType[e.type] = (engagementsByType[e.type] ?? 0) + 1
  }

  const accountsByHealth: Record<string, number> = {}
  let maccTotal = 0
  let maccRemaining = 0
  let acr = 0
  const atRiskAccounts: PortfolioRollup['atRiskAccounts'] = []
  for (const a of accounts) {
    accountsByHealth[a.healthRating] = (accountsByHealth[a.healthRating] ?? 0) + 1
    if (a.maccCommitment) {
      maccTotal += a.maccCommitment.totalAmount || 0
      maccRemaining += a.maccCommitment.remainingBalance || 0
      acr += a.maccCommitment.currentACR || 0
    }
    if (a.healthRating === 'at-risk' || a.healthRating === 'critical') {
      atRiskAccounts.push({ name: a.name, healthRating: a.healthRating, remainingUSD: a.maccCommitment?.remainingBalance })
    }
  }

  // Imported ACR adds to the visible monthly consumption signal.
  for (const row of imported) {
    if (typeof row.acrMonthlyUSD === 'number' && !Number.isNaN(row.acrMonthlyUSD)) acr += row.acrMonthlyUSD
  }

  const consumed = maccTotal - maccRemaining
  const pipeline = useCases.reduce((sum, uc) => sum + calculateRiskAdjustedFinancial(uc), 0)

  return {
    totalEngagements: engagements.length,
    engagementsByStatus,
    engagementsByType,
    accountCount: accounts.length,
    accountsByHealth,
    maccTotalUSD: maccTotal,
    maccRemainingUSD: maccRemaining,
    maccConsumedPct: maccTotal > 0 ? Math.round((consumed / maccTotal) * 100) : 0,
    currentACRMonthlyUSD: acr,
    sessionCount: sessions.length,
    useCaseCount: useCases.length,
    pipelineAnnualValueUSD: Math.round(pipeline),
    atRiskAccounts,
    importedEngagementCount: imported.length,
    generatedAt: Date.now(),
  }
}

export const localEngagementProvider: EngagementDataProvider = {
  source: 'local',
  async getPortfolioRollup(input) {
    return computePortfolioRollup(input)
  },
}

/**
 * Seam factory. Returns the local provider today; swap for a Dataverse/Graph
 * provider later (e.g. backed by a `/api/engagement-data` Azure Function)
 * without changing any UI callers.
 */
export function createEngagementProvider(): EngagementDataProvider {
  return localEngagementProvider
}

// ---------------------------------------------------------------------------
// CEHub / Dataverse CSV import (a working bridge with no backend or auth)
// ---------------------------------------------------------------------------

export interface ImportedEngagementRow {
  customerName?: string
  engagementType?: string
  status?: string
  date?: string
  acrMonthlyUSD?: number
  raw: Record<string, string>
}

/** Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const headers = rows[0].map((h) => h.trim())
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim() })
      return obj
    })
}

function pick(row: Record<string, string>, names: string[]): string | undefined {
  const keys = Object.keys(row)
  for (const n of names) {
    const k = keys.find((key) => key.toLowerCase() === n.toLowerCase())
    if (k && row[k]) return row[k]
  }
  return undefined
}

/**
 * Parse a CEHub / Dataverse CSV export into normalized engagement rows.
 * Tolerant of common column-name variants.
 */
export function importCEHubEngagements(csvText: string): ImportedEngagementRow[] {
  return parseCsv(csvText).map((raw) => {
    const acrStr = pick(raw, ['ACR', 'Azure Consumed Revenue', 'Consumption', 'Monthly ACR'])
    const acr = acrStr ? Number(acrStr.replace(/[^0-9.\-]/g, '')) : undefined
    return {
      customerName: pick(raw, ['Account', 'Account Name', 'Customer', 'Customer Name', 'Company']),
      engagementType: pick(raw, ['Engagement Type', 'Type', 'Engagement', 'Activity Type']),
      status: pick(raw, ['Status', 'Stage', 'State']),
      date: pick(raw, ['Date', 'Engagement Date', 'Start Date', 'Created']),
      acrMonthlyUSD: acr !== undefined && !Number.isNaN(acr) ? acr : undefined,
      raw,
    }
  })
}
