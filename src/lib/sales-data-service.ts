/**
 * Sales Data Service (Phase 5 MVP)
 * ----------------------------------------------------------------------------
 * CSV-only ingest of internal sales / account data. Files are parsed in the
 * browser via PapaParse, normalised against a tolerant header map, and stored
 * in localStorage keyed by customerId. No data leaves the browser.
 *
 * Stretch (Phase 5b, not built): /api/sales-data backed by Microsoft Graph +
 * Dynamics 365 OData. The on-disk shape here is forward-compatible.
 */

import Papa from 'papaparse'
import type { InternalSalesRecord } from './types'

const STORAGE_KEY = 'id8-internal-sales-data-v1'

// ── Header tolerance ───────────────────────────────────────────────────────
// Map a wide variety of CSV column headers (case-insensitive, normalised) to
// our canonical InternalSalesRecord fields. Operators rarely export the same
// schema twice — this lets a Sales / CSM dump "just work" most of the time.
const HEADER_ALIASES: Record<keyof InternalSalesRecord | 'ignore', string[]> = {
  customerId: ['customer id', 'customerid', 'account id', 'accountid', 'crm id', 'msx id'],
  customerName: ['customer', 'customer name', 'account', 'account name', 'organisation', 'organization', 'company'],
  accountId: ['account id', 'accountid', 'crm id', 'msx id', 'tpid'],
  arrUSD: ['arr', 'arr usd', 'annual recurring revenue', 'arr (usd)', 'arr_usd', 'revenue', 'annual revenue'],
  expansionPipelineUSD: ['expansion', 'expansion pipeline', 'open opps', 'open pipeline', 'pipeline', 'pipeline usd', 'expansion (usd)'],
  productsOwned: ['products', 'products owned', 'workloads', 'sku', 'skus', 'licenses owned', 'subscribed skus'],
  renewalDate: ['renewal', 'renewal date', 'next renewal', 'expiry', 'expiry date', 'contract end'],
  segment: ['segment', 'customer segment', 'sub-segment'],
  accountTier: ['tier', 'account tier', 'priority'],
  primaryContact: ['primary contact', 'owner', 'account manager', 'csm', 'ae'],
  notes: ['notes', 'comments', 'description'],
  source: ['source'],
  importedAt: ['imported at'],
  rawRow: [],
  ignore: ['__parsed_extra'],
}

function canonicalKeyFor(header: string): keyof InternalSalesRecord | null {
  const h = header.trim().toLowerCase()
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof InternalSalesRecord | 'ignore', string[]][]) {
    if (field === 'ignore' || field === 'rawRow' || field === 'importedAt' || field === 'source') continue
    if (aliases.includes(h)) return field as keyof InternalSalesRecord
  }
  return null
}

function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const s = String(v).replace(/[$,€£R\s]/g, '').replace(/[mMkK]$/i, (m) => (m.toLowerCase() === 'k' ? '000' : '000000'))
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function parseProducts(v: unknown): string[] | undefined {
  if (v === null || v === undefined || v === '') return undefined
  return String(v)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export interface ImportResult {
  records: InternalSalesRecord[]
  skipped: number
  warnings: string[]
}

/**
 * Parse a CSV file into normalised InternalSalesRecord rows. Caller decides
 * whether to persist via saveSalesRecords().
 */
export function parseSalesCsv(file: File, defaultCustomerId?: string): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const warnings: string[] = []
        const records: InternalSalesRecord[] = []
        let skipped = 0
        for (const row of results.data) {
          const rec: InternalSalesRecord = {
            customerId: defaultCustomerId || '',
            source: 'csv-upload',
            importedAt: Date.now(),
            rawRow: row as any,
          }
          for (const [origHeader, value] of Object.entries(row)) {
            const key = canonicalKeyFor(origHeader)
            if (!key) continue
            switch (key) {
              case 'arrUSD':
              case 'expansionPipelineUSD':
                (rec as any)[key] = parseNumber(value)
                break
              case 'productsOwned':
                rec.productsOwned = parseProducts(value)
                break
              default:
                (rec as any)[key] = value ?? undefined
            }
          }
          if (!rec.customerId && !rec.customerName && !rec.accountId) {
            skipped++
            continue
          }
          if (!rec.customerId) {
            rec.customerId = (rec.accountId || rec.customerName || `unknown-${records.length}`).toString().toLowerCase().replace(/\s+/g, '-')
          }
          records.push(rec)
        }
        if (results.errors.length) warnings.push(`${results.errors.length} parse warning(s): ${results.errors[0].message}`)
        resolve({ records, skipped, warnings })
      },
      error: (err) => reject(err),
    })
  })
}

// ── Persistence ────────────────────────────────────────────────────────────
function readAll(): Record<string, InternalSalesRecord> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, InternalSalesRecord>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function saveSalesRecords(records: InternalSalesRecord[]): number {
  const map = readAll()
  for (const r of records) map[r.customerId] = r
  writeAll(map)
  return records.length
}

export function getSalesForCustomer(customerId: string | null | undefined): InternalSalesRecord | null {
  if (!customerId) return null
  return readAll()[customerId] || null
}

export function listAllSalesRecords(): InternalSalesRecord[] {
  return Object.values(readAll())
}

export function removeSalesForCustomer(customerId: string): void {
  const map = readAll()
  delete map[customerId]
  writeAll(map)
}

export function clearAllSalesRecords(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

// ── Lookup helpers used by UI components ──────────────────────────────────

/**
 * Returns the products from `salesRecord.productsOwned` that overlap with
 * the use case's selected Microsoft solutions. Match is loose (substring,
 * case-insensitive) because product naming varies between CRM exports and
 * our microsoft-solutions catalog.
 */
export function findOwnedOverlap(
  record: InternalSalesRecord | null | undefined,
  solutionLabels: string[] | undefined,
): string[] {
  if (!record?.productsOwned?.length || !solutionLabels?.length) return []
  const owned = record.productsOwned.map((p) => p.toLowerCase())
  const overlaps: string[] = []
  for (const sol of solutionLabels) {
    const s = sol.toLowerCase()
    if (owned.some((o) => o.includes(s) || s.includes(o))) overlaps.push(sol)
  }
  return overlaps
}

/**
 * Estimate the implementation discount (USD) when the customer already owns
 * one or more of the use case's required solutions. Heuristic: 15% off the
 * base implementation cost per overlapping product, capped at 60%.
 */
export function estimateImplementationDiscount(
  baseImplementationUSD: number,
  overlapCount: number,
): { discountUSD: number; discountedTotalUSD: number; discountPct: number } {
  const pct = Math.min(0.6, 0.15 * Math.max(0, overlapCount))
  const discountUSD = Math.round(baseImplementationUSD * pct)
  return { discountUSD, discountedTotalUSD: baseImplementationUSD - discountUSD, discountPct: pct }
}
