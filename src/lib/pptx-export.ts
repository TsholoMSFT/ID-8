/**
 * PPTX export
 * ----------------------------------------------------------------------------
 * Generates a one-deck "executive readout" PowerPoint from a ID-8
 * discovery session: title, exec summary, top 5 use cases, business case,
 * cost/benefit chart, next steps. Uses pptxgenjs (browser-side, no server
 * round-trip).
 *
 * Public surface:
 *   exportSessionToPptx(input): Promise<void>  // triggers browser download
 */

import PptxGenJS from 'pptxgenjs'
import type { AccountCustomerJourney, UseCase } from './types'
import { FRONTIER_PILLARS } from './frontier-ai/catalog'
import { getCustomerSafeJourney } from './frontier-ai/journey-builder'

export interface PptxUseCase {
  title: string
  description?: string
  priority?: number
  riceScore?: number
  annualCoiUSD?: number
  effortPersonWeeks?: number
}

export interface PptxInput {
  customerName: string
  industry?: string
  preparedBy?: string
  preparedFor?: string
  executiveSummary?: string
  useCases?: PptxUseCase[]
  businessCase?: {
    investmentUSD?: number
    threeYearBenefitUSD?: number
    paybackMonths?: number
    npvUSD?: number
    irrPct?: number
  }
  nextSteps?: string[]
  microsoftSolutions?: string[]
}

const COLORS = {
  primary: '0F6CBD', // MS blue
  accent: '2563EB',
  success: '059669',
  danger: 'DC2626',
  text: '1E293B',
  muted: '64748B',
  bg: 'F8FAFC',
}

function fmtUSD(n?: number) {
  if (n == null || isNaN(n)) return '—'
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export async function exportSessionToPptx(input: PptxInput): Promise<void> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13.33 × 7.5 in
  pptx.title = `${input.customerName} — Discovery Readout`
  pptx.company = 'Microsoft'
  pptx.author = input.preparedBy || 'ID-8'

  // ── Slide 1: Title ────────────────────────────────────────────────────
  const s1 = pptx.addSlide()
  s1.background = { color: COLORS.primary }
  s1.addText('DISCOVERY EXECUTIVE READOUT', {
    x: 0.6, y: 0.6, w: 12, h: 0.4, fontSize: 12, color: 'FFFFFF', bold: true, charSpacing: 4,
  })
  s1.addText(input.customerName, {
    x: 0.6, y: 1.6, w: 12, h: 1.4, fontSize: 44, color: 'FFFFFF', bold: true,
  })
  if (input.industry) {
    s1.addText(input.industry, {
      x: 0.6, y: 3.0, w: 12, h: 0.5, fontSize: 18, color: 'E0E7FF',
    })
  }
  s1.addText(
    [
      input.preparedFor ? `Prepared for: ${input.preparedFor}` : '',
      input.preparedBy ? `Prepared by: ${input.preparedBy}` : '',
      `Date: ${new Date().toLocaleDateString()}`,
    ].filter(Boolean).join('\n'),
    { x: 0.6, y: 5.8, w: 8, h: 1.2, fontSize: 12, color: 'E0E7FF' },
  )
  s1.addText('Microsoft', {
    x: 11.2, y: 6.5, w: 1.6, h: 0.5, fontSize: 14, color: 'FFFFFF', bold: true, align: 'right',
  })

  // ── Slide 2: Executive Summary ────────────────────────────────────────
  if (input.executiveSummary) {
    const s = pptx.addSlide()
    s.background = { color: COLORS.bg }
    s.addText('Executive Summary', { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, color: COLORS.primary, bold: true })
    s.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.05, w: 12.3, h: 0, line: { color: COLORS.accent, width: 2 } })
    // Truncate to keep slide readable
    const summary = input.executiveSummary.length > 1400
      ? input.executiveSummary.slice(0, 1380) + '…'
      : input.executiveSummary
    s.addText(summary, {
      x: 0.5, y: 1.3, w: 12.3, h: 5.6, fontSize: 14, color: COLORS.text, valign: 'top', paraSpaceAfter: 8,
    })
  }

  // ── Slide 3: Top use cases table ──────────────────────────────────────
  const top = (input.useCases || []).slice(0, 8)
  if (top.length) {
    const s = pptx.addSlide()
    s.background = { color: COLORS.bg }
    s.addText('Prioritised Use Cases', { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, color: COLORS.primary, bold: true })
    s.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.05, w: 12.3, h: 0, line: { color: COLORS.accent, width: 2 } })

    const headerStyle = { bold: true, color: 'FFFFFF', fill: { color: COLORS.primary }, align: 'left' as const, valign: 'middle' as const, fontSize: 11 }
    const rowStyle = { color: COLORS.text, valign: 'middle' as const, fontSize: 10 }

    const rows: any[][] = [[
      { text: '#', options: headerStyle },
      { text: 'Use case', options: headerStyle },
      { text: 'RICE', options: { ...headerStyle, align: 'right' as const } },
      { text: 'Annual COI', options: { ...headerStyle, align: 'right' as const } },
      { text: 'Effort', options: { ...headerStyle, align: 'right' as const } },
    ]]
    top.forEach((uc, i) => {
      rows.push([
        { text: String(i + 1), options: rowStyle },
        { text: uc.title, options: { ...rowStyle, bold: true } },
        { text: uc.riceScore != null ? uc.riceScore.toFixed(1) : '—', options: { ...rowStyle, align: 'right' as const } },
        { text: fmtUSD(uc.annualCoiUSD), options: { ...rowStyle, align: 'right' as const, color: COLORS.danger } },
        { text: uc.effortPersonWeeks != null ? `${uc.effortPersonWeeks} wks` : '—', options: { ...rowStyle, align: 'right' as const } },
      ])
    })

    s.addTable(rows, {
      x: 0.5, y: 1.3, w: 12.3, colW: [0.6, 6.7, 1.4, 2.0, 1.6],
      border: { type: 'solid', color: 'E2E8F0', pt: 0.5 },
      rowH: 0.45,
    })
  }

  // ── Slide 4: Business case ────────────────────────────────────────────
  const bc = input.businessCase
  if (bc && (bc.investmentUSD || bc.threeYearBenefitUSD || bc.paybackMonths || bc.npvUSD)) {
    const s = pptx.addSlide()
    s.background = { color: COLORS.bg }
    s.addText('Business Case', { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, color: COLORS.primary, bold: true })
    s.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.05, w: 12.3, h: 0, line: { color: COLORS.accent, width: 2 } })

    const stat = (x: number, label: string, value: string, color: string) => {
      s.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: 2.9, h: 1.8, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0', width: 1 }, rectRadius: 0.1 })
      s.addText(label, { x: x + 0.1, y: 1.65, w: 2.7, h: 0.4, fontSize: 11, color: COLORS.muted, bold: true })
      s.addText(value, { x: x + 0.1, y: 2.1, w: 2.7, h: 1.0, fontSize: 28, color, bold: true, valign: 'middle' })
    }
    stat(0.5, '3-yr investment', fmtUSD(bc.investmentUSD), COLORS.text)
    stat(3.6, '3-yr benefit', fmtUSD(bc.threeYearBenefitUSD), COLORS.success)
    stat(6.7, 'Payback', bc.paybackMonths != null ? `${bc.paybackMonths.toFixed(1)} mo` : '—', COLORS.primary)
    stat(9.8, 'NPV', fmtUSD(bc.npvUSD), COLORS.success)

    if (bc.investmentUSD && bc.threeYearBenefitUSD) {
      s.addChart(pptx.ChartType.bar, [
        { name: 'Investment', labels: ['Investment'], values: [bc.investmentUSD] },
        { name: '3-yr benefit', labels: ['3-yr benefit'], values: [bc.threeYearBenefitUSD] },
      ], {
        x: 0.5, y: 3.6, w: 12.3, h: 3.4,
        chartColors: [COLORS.danger, COLORS.success],
        showLegend: true, legendPos: 'b',
        showTitle: true, title: 'Investment vs. 3-Year Benefit', titleFontSize: 14,
        catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
      })
    }
  }

  // ── Slide 5: Microsoft solutions ──────────────────────────────────────
  if (input.microsoftSolutions?.length) {
    const s = pptx.addSlide()
    s.background = { color: COLORS.bg }
    s.addText('Recommended Microsoft Stack', { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, color: COLORS.primary, bold: true })
    s.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.05, w: 12.3, h: 0, line: { color: COLORS.accent, width: 2 } })

    const items = input.microsoftSolutions.slice(0, 16)
    const cols = 4
    const rows = Math.ceil(items.length / cols)
    const cellW = 12.3 / cols
    const cellH = Math.min(1.0, 5.5 / rows)
    items.forEach((sol, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      s.addShape(pptx.ShapeType.roundRect, {
        x: 0.5 + c * cellW, y: 1.4 + r * (cellH + 0.15), w: cellW - 0.2, h: cellH,
        fill: { color: 'FFFFFF' }, line: { color: COLORS.accent, width: 1 }, rectRadius: 0.05,
      })
      s.addText(sol, {
        x: 0.5 + c * cellW, y: 1.4 + r * (cellH + 0.15), w: cellW - 0.2, h: cellH,
        fontSize: 12, color: COLORS.text, bold: true, align: 'center', valign: 'middle',
      })
    })
  }

  // ── Slide 6: Next steps ───────────────────────────────────────────────
  if (input.nextSteps?.length) {
    const s = pptx.addSlide()
    s.background = { color: COLORS.bg }
    s.addText('Recommended Next Steps', { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, color: COLORS.primary, bold: true })
    s.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.05, w: 12.3, h: 0, line: { color: COLORS.accent, width: 2 } })
    const lines = input.nextSteps.slice(0, 10).map((n, i) => ({
      text: `${i + 1}. ${n}`,
      options: { fontSize: 16, color: COLORS.text, paraSpaceAfter: 12 },
    }))
    s.addText(lines, { x: 0.5, y: 1.3, w: 12.3, h: 5.5, valign: 'top' })
  }

  // ── Slide N: Closing ──────────────────────────────────────────────────
  const sN = pptx.addSlide()
  sN.background = { color: COLORS.primary }
  sN.addText('Thank you', { x: 0.5, y: 2.5, w: 12.3, h: 1.2, fontSize: 60, color: 'FFFFFF', bold: true, align: 'center' })
  sN.addText('Generated by ID-8 · Microsoft Innovation Hub', {
    x: 0.5, y: 4.0, w: 12.3, h: 0.6, fontSize: 16, color: 'E0E7FF', align: 'center',
  })

  const safeName = input.customerName.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'discovery'
  await pptx.writeFile({ fileName: `ID-8-${safeName}-${new Date().toISOString().slice(0, 10)}.pptx` })
}

export interface AccountJourneyPptxInput {
  journey: AccountCustomerJourney
  useCases: UseCase[]
  preparedBy?: string
}

const JOURNEY_STATUS_LABELS = {
  'start-now': 'START NOW',
  next: 'NEXT',
  later: 'LATER',
  'assumed-in-place': 'ASSUMED IN PLACE',
  'revisit-gap': 'REVISIT GAP',
} as const

const JOURNEY_STATUS_COLORS = {
  'start-now': '047857',
  next: 'B45309',
  later: '64748B',
  'assumed-in-place': '64748B',
  'revisit-gap': 'B91C1C',
} as const

const WORKSTREAM_COLORS = {
  shared: '475569',
  trusted: '0369A1',
  agentify: '047857',
} as const

function addJourneySlideTitle(slide: PptxGenJS.Slide, pptx: PptxGenJS, title: string, color = COLORS.primary): void {
  slide.background = { color: COLORS.bg }
  slide.addText(title, { x: 0.5, y: 0.35, w: 12.2, h: 0.55, fontSize: 26, color, bold: true })
  slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.0, w: 12.3, h: 0, line: { color, width: 2 } })
}

export async function exportAccountJourneyToPptx({
  journey,
  useCases,
  preparedBy,
}: AccountJourneyPptxInput): Promise<void> {
  const safeJourney = getCustomerSafeJourney(journey)
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = safeJourney.title
  pptx.company = 'Microsoft'
  pptx.author = preparedBy || 'ID-8'
  pptx.subject = 'Frontier AI Account Journey'

  const useCaseNames = new Map(useCases.map((useCase) => [useCase.id, useCase.title]))

  const cover = pptx.addSlide()
  cover.background = { color: COLORS.primary }
  cover.addText('FRONTIER AI ACCOUNT JOURNEY', {
    x: 0.65, y: 0.65, w: 12, h: 0.35, fontSize: 12, color: 'FFFFFF', bold: true, charSpacing: 3,
  })
  cover.addText(safeJourney.customerName, {
    x: 0.65, y: 1.55, w: 12, h: 1.1, fontSize: 42, color: 'FFFFFF', bold: true,
  })
  cover.addText(safeJourney.ambition, {
    x: 0.65, y: 2.8, w: 10.8, h: 1.4, fontSize: 18, color: 'E0E7FF', breakLine: false, valign: 'top',
  })
  cover.addText(`Current maturity: ${safeJourney.maturity.stage}`, {
    x: 0.65, y: 5.4, w: 5.5, h: 0.5, fontSize: 16, color: 'FFFFFF', bold: true,
  })
  cover.addText(`Prepared ${new Date().toLocaleDateString()}`, {
    x: 0.65, y: 6.2, w: 5.5, h: 0.4, fontSize: 11, color: 'E0E7FF',
  })
  cover.addText('Microsoft Innovation Hub', {
    x: 9.4, y: 6.2, w: 3.25, h: 0.4, fontSize: 12, color: 'FFFFFF', bold: true, align: 'right',
  })

  const readiness = pptx.addSlide()
  addJourneySlideTitle(readiness, pptx, 'AI Readiness Snapshot')
  readiness.addText(safeJourney.maturity.stage, {
    x: 0.55, y: 1.25, w: 4.0, h: 0.65, fontSize: 30, color: COLORS.primary, bold: true,
  })
  readiness.addText(safeJourney.maturity.description, {
    x: 0.55, y: 1.95, w: 12.0, h: 0.65, fontSize: 13, color: COLORS.muted,
  })
  FRONTIER_PILLARS.forEach((pillar, index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    const x = 0.55 + column * 4.2
    const y = 2.85 + row * 1.2
    const rating = safeJourney.readiness.ratings[pillar.id]
    readiness.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 3.9, h: 0.9,
      fill: { color: rating >= 3 ? 'ECFDF5' : 'FFFFFF' },
      line: { color: rating >= 3 ? '10B981' : 'CBD5E1', width: 1 },
      rectRadius: 0.04,
    })
    readiness.addText(pillar.name, { x: x + 0.15, y: y + 0.12, w: 2.65, h: 0.28, fontSize: 11, color: COLORS.text, bold: true })
    readiness.addText(`${rating} / 4`, { x: x + 2.95, y: y + 0.12, w: 0.7, h: 0.28, fontSize: 11, color: rating >= 3 ? COLORS.success : COLORS.muted, bold: true, align: 'right' })
    const evidence = safeJourney.readiness.evidence[pillar.id] || pillar.description
    readiness.addText(evidence.length > 100 ? `${evidence.slice(0, 97)}...` : evidence, {
      x: x + 0.15, y: y + 0.43, w: 3.55, h: 0.34, fontSize: 8.5, color: COLORS.muted,
    })
  })

  const overview = pptx.addSlide()
  addJourneySlideTitle(overview, pptx, 'Journey at a Glance')
  safeJourney.workstreams.forEach((workstream, column) => {
    const x = 0.5 + column * 4.25
    const color = WORKSTREAM_COLORS[workstream.id]
    overview.addShape(pptx.ShapeType.rect, { x, y: 1.25, w: 4.0, h: 0.55, fill: { color }, line: { color } })
    overview.addText(workstream.label, { x: x + 0.15, y: 1.35, w: 3.7, h: 0.3, fontSize: 14, color: 'FFFFFF', bold: true })
    workstream.steps.forEach((step, index) => {
      const y = 2.0 + index * 0.75
      const statusColor = JOURNEY_STATUS_COLORS[step.recommendationStatus]
      overview.addShape(pptx.ShapeType.roundRect, {
        x, y, w: 4.0, h: 0.6,
        fill: { color: 'FFFFFF' }, line: { color: statusColor, width: 1 }, rectRadius: 0.03,
      })
      overview.addText(`${index + 1}. ${step.title}`, {
        x: x + 0.12, y: y + 0.08, w: 2.8, h: 0.38, fontSize: 9.5, color: COLORS.text, bold: true, fit: 'shrink',
      })
      overview.addText(JOURNEY_STATUS_LABELS[step.recommendationStatus], {
        x: x + 2.95, y: y + 0.1, w: 0.92, h: 0.28, fontSize: 7.5, color: statusColor, bold: true, align: 'right', fit: 'shrink',
      })
    })
  })

  for (const workstream of safeJourney.workstreams) {
    for (let offset = 0; offset < workstream.steps.length; offset += 2) {
      const slide = pptx.addSlide()
      const color = WORKSTREAM_COLORS[workstream.id]
      addJourneySlideTitle(slide, pptx, workstream.label, color)
      const pageSteps = workstream.steps.slice(offset, offset + 2)
      pageSteps.forEach((step, index) => {
        const y = 1.25 + index * 3.0
        const statusColor = JOURNEY_STATUS_COLORS[step.recommendationStatus]
        slide.addText(step.title, { x: 0.6, y, w: 8.8, h: 0.42, fontSize: 17, color, bold: true, fit: 'shrink' })
        slide.addText(`${JOURNEY_STATUS_LABELS[step.recommendationStatus]}  |  ${step.deliveryStage}  |  ${step.duration}`, {
          x: 9.35, y: y + 0.02, w: 3.25, h: 0.3, fontSize: 8.5, color: statusColor, bold: true, align: 'right', fit: 'shrink',
        })
        slide.addText('CUSTOMER VALUE', { x: 0.6, y: y + 0.55, w: 2.0, h: 0.25, fontSize: 8, color: COLORS.success, bold: true })
        slide.addText(step.customerValue, { x: 0.6, y: y + 0.8, w: 5.9, h: 0.7, fontSize: 10.5, color: COLORS.text, valign: 'top', fit: 'shrink' })
        slide.addText('APPLIED CONTEXT', { x: 6.75, y: y + 0.55, w: 2.0, h: 0.25, fontSize: 8, color: COLORS.primary, bold: true })
        slide.addText(step.customerContext, { x: 6.75, y: y + 0.8, w: 5.85, h: 0.7, fontSize: 10.5, color: COLORS.text, valign: 'top', fit: 'shrink' })
        const linked = step.linkedUseCaseIds.map((id) => useCaseNames.get(id)).filter(Boolean).join(', ')
        slide.addText(`Why now: ${step.whyNow}`, { x: 0.6, y: y + 1.58, w: 12.0, h: 0.55, fontSize: 9.5, color: COLORS.muted, italic: true, fit: 'shrink' })
        const commitments = step.customerCommitments.slice(0, 2).map((item) => `• ${item}`).join('\n') || '• Confirm participants and commitments'
        const outcomes = step.outcomes.slice(0, 2).map((item) => `• ${item}`).join('\n') || '• Confirm intended outcomes'
        slide.addText(`Customer commitments\n${commitments}`, { x: 0.6, y: y + 2.12, w: 5.8, h: 0.62, fontSize: 8.5, color: COLORS.text, bold: false, fit: 'shrink' })
        slide.addText(`Outcomes\n${outcomes}${linked ? `\nUse cases: ${linked}` : ''}`, { x: 6.75, y: y + 2.12, w: 5.85, h: 0.62, fontSize: 8.5, color: COLORS.text, fit: 'shrink' })
        if (index === 0 && pageSteps.length > 1) {
          slide.addShape(pptx.ShapeType.line, { x: 0.6, y: y + 2.88, w: 12.0, h: 0, line: { color: 'CBD5E1', width: 1 } })
        }
      })
    }
  }

  if (safeJourney.nextSteps.length > 0 || safeJourney.warnings.length > 0) {
    const nextSteps = pptx.addSlide()
    addJourneySlideTitle(nextSteps, pptx, 'Mutual Commitments and Next Steps')
    const actionLines = safeJourney.nextSteps.slice(0, 8).map((step, index) => ({
      text: `${index + 1}. ${step.action}${step.owner ? ` - ${step.owner}` : ''}`,
      options: { fontSize: 15, color: COLORS.text, paraSpaceAfterPt: 12 },
    }))
    nextSteps.addText(actionLines, { x: 0.65, y: 1.4, w: 7.5, h: 5.2, valign: 'top' })
    if (safeJourney.warnings.length > 0) {
      nextSteps.addShape(pptx.ShapeType.roundRect, { x: 8.55, y: 1.4, w: 4.0, h: 2.3, fill: { color: 'FFFBEB' }, line: { color: 'F59E0B', width: 1 }, rectRadius: 0.04 })
      nextSteps.addText('DEPENDENCIES TO RESOLVE', { x: 8.8, y: 1.65, w: 3.5, h: 0.3, fontSize: 10, color: '92400E', bold: true })
      nextSteps.addText(safeJourney.warnings.map((warning) => `• ${warning.message}`).join('\n'), { x: 8.8, y: 2.05, w: 3.5, h: 1.35, fontSize: 10, color: COLORS.text, valign: 'top', fit: 'shrink' })
    }
  }

  const safeName = safeJourney.customerName.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'customer'
  await pptx.writeFile({ fileName: `ID-8-${safeName}-frontier-ai-journey-${new Date().toISOString().slice(0, 10)}.pptx` })
}
