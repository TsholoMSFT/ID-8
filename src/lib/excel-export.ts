/**
 * Excel export for the portfolio Pipeline Plan and its supporting artifacts.
 * Produces a multi-sheet workbook (Pipeline Plan, Themes, Use-Case Mapping,
 * Commitments) that mirrors the attachment layout. Sheet builders are pure and
 * unit-tested; only the final writeXlsxFile call touches the browser.
 */
import writeXlsxFile from 'write-excel-file'
import {
  PRESSURE_THEME_CATEGORY_LABELS, AUDIT_THEME_CATEGORY_LABELS,
  SOLUTION_AREA_LABELS, ENTITY_TYPE_LABELS,
} from './types'
import type { AuditTheme, PressureTheme } from './types'
import { PORTFOLIO_SEED, type PortfolioSeedEntity } from './portfolio-seed'
import { getBriefingTrackLabel } from './briefing-tracks'
import {
  mapPressureThemesToUseCases, mapAuditThemesToUseCases, type ThemeUseCaseMapping,
} from './theme-engine'
import { summarisePipelineRow, themesForEntity, type EntityIntel } from './pipeline-plan'

export type IntelMap = Record<string, EntityIntel>

type Cell = { value: string | number | undefined; fontWeight?: 'bold' }
type Sheet = Cell[][]

const bold = (labels: string[]): Cell[] => labels.map((value) => ({ value, fontWeight: 'bold' as const }))
const cell = (v?: string | number | null): Cell => ({ value: v ?? undefined })
const join = (xs: string[]): string => xs.join('; ')

function mappingForEntity(entity: PortfolioSeedEntity, intel?: EntityIntel): ThemeUseCaseMapping[] {
  return entity.entityType === 'government'
    ? mapAuditThemesToUseCases(intel?.auditThemes ?? [])
    : mapPressureThemesToUseCases(intel?.pressureThemes ?? [])
}

// ── Sheet builders (pure) ────────────────────────────────────────────────────

export function pipelinePlanSheet(entities: PortfolioSeedEntity[], intelMap: IntelMap): Sheet {
  const head = bold([
    'Account', 'Entity Type', 'Tier', 'Ticker', 'Audit Framework', 'Risk Signal',
    'Reporting Milestone', 'Primary Themes', 'Recommended Use Cases', 'Lead Solution Area',
    'Briefing Track', 'Commitments', 'Pipeline Cover %', 'Partner', 'Account Exec / ATS',
    'Stakeholder', 'Priority', 'Engagement Date', 'Next Step',
  ])
  const rows = entities.map((e) => {
    const intel = intelMap[e.id]
    const row = summarisePipelineRow(e, intel)
    const mapping = mappingForEntity(e, intel)
    return [
      cell(e.name),
      cell(ENTITY_TYPE_LABELS[e.entityType]),
      cell(row.tier),
      cell(row.ticker),
      cell(e.auditFramework),
      cell(row.riskSignal),
      cell(row.reportingMilestone),
      cell(join(row.topThemes)),
      cell(join(mapping.map((m) => m.customerUseCase))),
      cell(row.leadSolutionArea ? SOLUTION_AREA_LABELS[row.leadSolutionArea] : ''),
      cell(row.primaryTrack ? `${row.primaryTrack} – ${getBriefingTrackLabel(row.primaryTrack, e.entityType)}` : ''),
      cell(join((intel?.commitments ?? []).map((c) => c.statement))),
      cell(intel?.pipelineCoverPct != null ? `${intel.pipelineCoverPct}%` : ''),
      cell(intel?.partner),
      cell(intel?.accountExec),
      cell(intel?.stakeholder),
      cell(intel?.priority),
      cell(intel?.engagementDate),
      cell(row.nextStep),
    ]
  })
  return [head, ...rows]
}

export function themesSheet(entities: PortfolioSeedEntity[], intelMap: IntelMap): Sheet {
  const head = bold([
    'Account', 'Theme', 'Category', 'Severity', 'Evidence', 'Source',
    'Audit Outcome', 'Solution Area', 'Briefing Track',
  ])
  const rows: Cell[][] = []
  for (const e of entities) {
    const intel = intelMap[e.id]
    const themes = themesForEntity(e, intel)
    for (const t of themes) {
      const isAudit = e.entityType === 'government'
      const categoryLabel = isAudit
        ? AUDIT_THEME_CATEGORY_LABELS[(t as AuditTheme).category]
        : PRESSURE_THEME_CATEGORY_LABELS[(t as PressureTheme).category]
      rows.push([
        cell(e.name),
        cell(t.title),
        cell(categoryLabel),
        cell(t.severity ?? ''),
        cell(t.evidence),
        cell(t.source),
        cell(isAudit ? (t as AuditTheme).auditOutcome : ''),
        cell(t.solutionArea ? SOLUTION_AREA_LABELS[t.solutionArea] : ''),
        cell(t.briefingTrack ? `${t.briefingTrack} – ${getBriefingTrackLabel(t.briefingTrack, e.entityType)}` : ''),
      ])
    }
  }
  return [head, ...rows]
}

export function mappingSheet(entities: PortfolioSeedEntity[], intelMap: IntelMap): Sheet {
  const head = bold([
    'Account', 'Theme', 'Customer Use Case', 'Solution Area',
    'Briefing Track', 'Key Azure Services', 'Outcome Improved',
  ])
  const rows: Cell[][] = []
  for (const e of entities) {
    const mapping = mappingForEntity(e, intelMap[e.id])
    for (const m of mapping) {
      rows.push([
        cell(e.name),
        cell(m.themeTitle),
        cell(m.customerUseCase),
        cell(SOLUTION_AREA_LABELS[m.solutionArea]),
        cell(`${m.briefingTrack} – ${getBriefingTrackLabel(m.briefingTrack, e.entityType)}`),
        cell(join(m.azureServices)),
        cell(m.outcome),
      ])
    }
  }
  return [head, ...rows]
}

export function commitmentsSheet(entities: PortfolioSeedEntity[], intelMap: IntelMap): Sheet {
  const head = bold([
    'Account', 'Type', 'Statement', 'Source', 'Timeframe', 'Status', 'How Azure Helps',
  ])
  const rows: Cell[][] = []
  for (const e of entities) {
    for (const c of intelMap[e.id]?.commitments ?? []) {
      rows.push([
        cell(e.name),
        cell(c.kind === 'remedial-directive' ? 'Remedial Directive' : 'Management Commitment'),
        cell(c.statement),
        cell(c.source),
        cell(c.timeframe),
        cell(c.status),
        cell(c.howAzureHelps),
      ])
    }
  }
  return [head, ...rows]
}

/** Write the multi-sheet portfolio workbook (triggers a browser download). */
export async function exportPortfolioWorkbook(
  entities: PortfolioSeedEntity[] = PORTFOLIO_SEED,
  intelMap: IntelMap = {},
  fileName = 'ID-8-pipeline-plan.xlsx',
): Promise<void> {
  const data: Sheet[] = [
    pipelinePlanSheet(entities, intelMap),
    themesSheet(entities, intelMap),
    mappingSheet(entities, intelMap),
    commitmentsSheet(entities, intelMap),
  ]
  await writeXlsxFile(data, {
    sheets: ['Pipeline Plan', 'Themes', 'Use-Case Mapping', 'Commitments'],
    fileName,
  })
}
