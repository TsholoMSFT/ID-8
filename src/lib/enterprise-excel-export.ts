import writeXlsxFile from 'write-excel-file'
import type { EnterpriseDiscoverySession } from '@/lib/types'
import { calculateTotalCOI } from '@/lib/financial-calculations'

type ExcelCell = {
  value: string | number | boolean | Date | undefined
  type?: StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor | 'Formula'
  fontWeight?: 'bold'
}

function cell(value: string | number | boolean | Date | null | undefined, type?: ExcelCell['type'], extra?: Omit<ExcelCell, 'value' | 'type'>): ExcelCell {
  const v = value ?? undefined
  if (extra) return { value: v, type, ...extra }
  return { value: v, type }
}

function header(value: string): ExcelCell {
  return { value, type: String, fontWeight: 'bold' }
}

export function exportEnterpriseDiscoveryToExcel(session: EnterpriseDiscoverySession): string {
  const summarySheet: ExcelCell[][] = [
    [cell('ID-8 - Microsoft Innovation Hub Enterprise Discovery Report', String, { fontWeight: 'bold' })],
    [cell('', String)],
    [cell('Client Name', String), cell(session.clientName || 'Unnamed', String)],
    [cell('Session Date', String), cell(new Date(session.sessionDate).toLocaleDateString(), String)],
    [cell('Discovery Type', String), cell(session.discoveryType, String)],
    [cell('Completed', String), cell(session.completedAt ? 'Yes' : 'No', String)],
    [cell('Stages Completed', String), cell(`${Object.values(session.stages).filter(s => s.status === 'completed').length} of 9`, String)],
    [cell('', String)],
    [cell('Attendees', String, { fontWeight: 'bold' }), cell('', String)],
    ...session.attendees.map(a => [cell(`  ${a.name}`, String), cell(a.role, String)]),
  ]

  const sheets: string[] = ['Summary']
  const data: ExcelCell[][][] = [summarySheet]
  const columns: Array<Array<{ width?: number }>> = [[{ width: 30 }, { width: 70 }]]

  // ============ STAGE 1: OPPORTUNITY ============
  const stage1Data = session.stages[1].data
  if (stage1Data) {
    const opportunitySheet: ExcelCell[][] = [
      [cell('Stage 1: Opportunity', String, { fontWeight: 'bold' })],
      [cell('', String)],
      [cell('Problem Statement', String), cell(stage1Data.problemStatement || '', String)],
      [cell('Problem Category', String), cell(stage1Data.problemCategory || '', String)],
      [cell('Affected Area', String), cell(stage1Data.affectedArea || '', String)],
      [cell('', String)],
      [cell('Desired Outcome', String), cell(stage1Data.desiredOutcome || '', String)],
      [cell('Timeline Expectation', String), cell(stage1Data.timelineExpectation || '', String)],
      [cell('', String)],
      [cell('Success Metrics', String, { fontWeight: 'bold' })],
      ...((stage1Data.successMetrics || []) as string[]).map((m: string) => [cell(`  ${m}`, String)]),
      [cell('', String)],
      [cell('SCQ Framework', String, { fontWeight: 'bold' })],
      [cell('Situation', String), cell(stage1Data.scq?.situation || '', String)],
      [cell('Complication', String), cell(stage1Data.scq?.complication || '', String)],
      [cell('Question', String), cell(stage1Data.scq?.question || '', String)],
      [cell('', String)],
      [cell('Cost of Inaction', String, { fontWeight: 'bold' })],
      [cell('Direct Costs (One-time)', String), cell(stage1Data.coi?.directCosts?.oneTime || 0, Number)],
      [cell('Direct Costs (Monthly)', String), cell(stage1Data.coi?.directCosts?.recurring || 0, Number)],
      [cell('Opportunity Costs (One-time)', String), cell(stage1Data.coi?.opportunityCosts?.oneTime || 0, Number)],
      [cell('Opportunity Costs (Monthly)', String), cell(stage1Data.coi?.opportunityCosts?.recurring || 0, Number)],
      [cell('Risk Costs (One-time)', String), cell(stage1Data.coi?.riskCosts?.oneTime || 0, Number)],
      [cell('Risk Probability (%)', String), cell(stage1Data.coi?.riskCosts?.oneTimeProbability || 0, Number)],
      [cell('Risk Costs (Monthly)', String), cell(stage1Data.coi?.riskCosts?.recurring || 0, Number)],
      [cell('Total Annual COI', String), cell(stage1Data.coi ? calculateTotalCOI(stage1Data.coi) : 0, Number)],
    ]
    sheets.push('Opportunity')
    data.push(opportunitySheet)
    columns.push([{ width: 30 }, { width: 80 }])
  }

  // ============ STAGE 2: RESOURCES ============
  const stage2Data = session.stages[2].data
  if (stage2Data) {
    const resourcesSheet: ExcelCell[][] = [
      [cell('Stage 2: Resources', String, { fontWeight: 'bold' })],
      [cell('', String)],
      [cell('Financial', String, { fontWeight: 'bold' })],
      [cell('Budget Status', String), cell(stage2Data.budgetStatus || '', String)],
      [cell('Budget Range', String), cell(stage2Data.budgetRange || '', String)],
      [cell('ROI Expectation', String), cell(stage2Data.roiExpectation || '', String)],
      [cell('Budget Owner', String), cell(stage2Data.budgetOwner || '', String)],
      [cell('', String)],
      [cell('Human Resources', String, { fontWeight: 'bold' })],
      [cell('Executive Sponsor', String), cell(stage2Data.executiveSponsor || '', String)],
      [cell('Project Lead', String), cell(stage2Data.projectLead || '', String)],
      [cell('Team Capacity', String), cell(stage2Data.teamCapacity || '', String)],
      [cell('Change Readiness', String), cell(stage2Data.changeReadiness || '', String)],
      [cell('', String)],
      [cell('Technical', String, { fontWeight: 'bold' })],
      [cell('Data Availability', String), cell(stage2Data.dataAvailability || '', String)],
      [cell('Technical Debt Concerns', String), cell(stage2Data.technicalDebtConcerns || '', String)],
      [cell('', String)],
      [cell('Existing Platforms', String, { fontWeight: 'bold' })],
      ...((stage2Data.existingPlatforms || []) as string[]).map((p: string) => [cell(`  ${p}`, String)]),
      [cell('', String)],
      [cell('Integration Requirements', String, { fontWeight: 'bold' })],
      ...((stage2Data.integrationRequirements || []) as string[]).map((r: string) => [cell(`  ${r}`, String)]),
    ]
    sheets.push('Resources')
    data.push(resourcesSheet)
    columns.push([{ width: 30 }, { width: 80 }])
  }

  // ============ STAGE 4: PRIORITISATION ============
  const stage4Data = session.stages[4].data
  if (stage4Data?.opportunities && stage4Data.opportunities.length > 0) {
    const prioSheet: ExcelCell[][] = [
      [cell('Stage 4: Prioritisation (RICE Scoring)', String, { fontWeight: 'bold' })],
      [cell('', String)],
      [header('Title'), header('Reach'), header('Impact'), header('Confidence'), header('Effort'), header('RICE Score'), header('Recommended')],
      ...stage4Data.opportunities.map((opp: any) => [
        cell(opp.title || '', String),
        cell(opp.rice?.reach || 0, Number),
        cell(opp.rice?.impact || 0, Number),
        cell(opp.rice?.confidence || 0, Number),
        cell(opp.rice?.effort || 0, Number),
        cell(opp.rice?.score || 0, Number),
        cell(opp.id === stage4Data.recommendedOpportunityId ? 'Yes' : '', String),
      ])
    ]
    sheets.push('Prioritisation')
    data.push(prioSheet)
    columns.push([{ width: 30 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 12 }])
  }

  // ============ STAGE 5: SOLUTION SCOPE ============
  const stage5Data = session.stages[5].data
  if (stage5Data) {
    // Revenue Impact
    const revenueSheet: ExcelCell[][] = [
      [cell('Stage 5: Solution Scope - Revenue Impact', String, { fontWeight: 'bold' })],
      [cell('', String)],
      [header('Driver Type'), header('Annual Value'), header('Enabled')],
      ...((stage5Data.revenueImpact?.drivers || []) as any[]).map((d: any) => [
        cell(d.type?.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || '', String),
        cell(d.calculatedAnnualValue || 0, Number),
        cell(d.enabled ? 'Yes' : 'No', String),
      ]),
      [cell('', String)],
      [cell('Total Revenue Impact', String), cell(stage5Data.revenueImpact?.totalAnnualRevenue || 0, Number)],
    ]
    sheets.push('Revenue Impact')
    data.push(revenueSheet)
    columns.push([{ width: 34 }, { width: 18 }, { width: 10 }])

    // Cost Impact
    const costSheet: ExcelCell[][] = [
      [cell('Stage 5: Solution Scope - Cost Impact', String, { fontWeight: 'bold' })],
      [cell('', String)],
      [header('Driver Type'), header('Annual Value'), header('FTE Equivalent'), header('P&L Line'), header('Enabled')],
      ...((stage5Data.costImpact?.drivers || []) as any[]).map((d: any) => [
        cell(d.type?.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || '', String),
        cell(d.calculatedAnnualValue || 0, Number),
        cell(d.fteEquivalent || 0, Number),
        cell(d.plLine || '', String),
        cell(d.enabled ? 'Yes' : 'No', String),
      ]),
      [cell('', String)],
      [cell('Total Cost Savings', String), cell(stage5Data.costImpact?.totalAnnualSavings || 0, Number)],
      [cell('Total FTE Equivalent', String), cell(stage5Data.costImpact?.totalFTEEquivalent || 0, Number)],
    ]
    sheets.push('Cost Impact')
    data.push(costSheet)
    columns.push([{ width: 34 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 10 }])

    // Balance Sheet
    const bsSheet: ExcelCell[][] = [
      [cell('Stage 5: Solution Scope - Balance Sheet & Cash Flow', String, { fontWeight: 'bold' })],
      [cell('', String)],
      [header('Driver Type'), header('Value'), header('Cash Flow Impact'), header('Enabled')],
      ...((stage5Data.balanceSheetCashFlow?.drivers || []) as any[]).map((d: any) => [
        cell(d.type?.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || '', String),
        cell(d.calculatedValue || 0, Number),
        cell(d.cashFlowImpact || 0, Number),
        cell(d.enabled ? 'Yes' : 'No', String),
      ]),
      [cell('', String)],
      [cell('Total Working Capital Impact', String), cell(stage5Data.balanceSheetCashFlow?.totalWorkingCapitalImpact || 0, Number)],
      [cell('Total Cash Flow Impact', String), cell(stage5Data.balanceSheetCashFlow?.totalCashFlowImpact || 0, Number)],
    ]
    sheets.push('Balance Sheet')
    data.push(bsSheet)
    columns.push([{ width: 34 }, { width: 16 }, { width: 18 }, { width: 10 }])
  }

  // ============ STAGE 8: FINANCIAL SUMMARY ============
  const stage8Data = session.stages[8].data
  if (stage8Data) {
    const financialSheet: ExcelCell[][] = [
      [cell('Stage 8: Financial Summary', String, { fontWeight: 'bold' })],
      [cell('', String)],
      [cell('Investment Analysis', String, { fontWeight: 'bold' })],
      [cell('Total Investment (Year 1)', String), cell(stage8Data.investmentAnalysis?.totalInvestmentYear1 || 0, Number)],
      [cell('Annual Benefit', String), cell(stage8Data.investmentAnalysis?.totalAnnualBenefit || 0, Number)],
      [cell('Payback Period (Months)', String), cell(stage8Data.investmentAnalysis?.simplePaybackMonths || 0, Number)],
      [cell('3-Year ROI (%)', String), cell(stage8Data.investmentAnalysis?.roi3Year || 0, Number)],
      [cell('NPV (10%)', String), cell(stage8Data.investmentAnalysis?.npv10Percent || 0, Number)],
      [cell('IRR (%)', String), cell(stage8Data.investmentAnalysis?.irr || 0, Number)],
      [cell('', String)],
      [cell('Sensitivity Analysis', String, { fontWeight: 'bold' })],
      [cell('', String), cell('Conservative', String, { fontWeight: 'bold' }), cell('Base', String, { fontWeight: 'bold' }), cell('Optimistic', String, { fontWeight: 'bold' })],
      [
        cell('Annual Benefit', String),
        cell(stage8Data.sensitivityAnalysis?.conservative?.annualBenefit || 0, Number),
        cell(stage8Data.sensitivityAnalysis?.base?.annualBenefit || 0, Number),
        cell(stage8Data.sensitivityAnalysis?.optimistic?.annualBenefit || 0, Number),
      ],
      [
        cell('Payback (Months)', String),
        cell(stage8Data.sensitivityAnalysis?.conservative?.paybackMonths || 0, Number),
        cell(stage8Data.sensitivityAnalysis?.base?.paybackMonths || 0, Number),
        cell(stage8Data.sensitivityAnalysis?.optimistic?.paybackMonths || 0, Number),
      ],
      [
        cell('3-Year ROI (%)', String),
        cell(stage8Data.sensitivityAnalysis?.conservative?.roi3Year || 0, Number),
        cell(stage8Data.sensitivityAnalysis?.base?.roi3Year || 0, Number),
        cell(stage8Data.sensitivityAnalysis?.optimistic?.roi3Year || 0, Number),
      ],
      [
        cell('NPV', String),
        cell(stage8Data.sensitivityAnalysis?.conservative?.npv || 0, Number),
        cell(stage8Data.sensitivityAnalysis?.base?.npv || 0, Number),
        cell(stage8Data.sensitivityAnalysis?.optimistic?.npv || 0, Number),
      ],
      [cell('', String)],
      [cell('P&L Impact - Year 1', String, { fontWeight: 'bold' })],
      [cell('Revenue Impact', String), cell(stage8Data.plImpact?.year1?.revenueImpact || 0, Number)],
      [cell('COGS Impact', String), cell(stage8Data.plImpact?.year1?.cogsImpact || 0, Number)],
      [cell('Gross Margin Impact', String), cell(stage8Data.plImpact?.year1?.grossMarginImpact || 0, Number)],
      [cell('OpEx Impact', String), cell(stage8Data.plImpact?.year1?.opexImpact || 0, Number)],
      [cell('EBIT Impact', String), cell(stage8Data.plImpact?.year1?.ebitImpact || 0, Number)],
    ]
    sheets.push('Financial Summary')
    data.push(financialSheet)
    columns.push([{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }])
  }

  // ============ YELLOW LIGHTS ============
  if (session.allYellowLights && session.allYellowLights.length > 0) {
    const yellowLightsSheet: ExcelCell[][] = [
      [cell('Yellow Lights & Concerns', String, { fontWeight: 'bold' })],
      [cell('', String)],
      [header('Description'), header('Severity'), header('Stage Identified'), header('Resolution Plan'), header('Owner'), header('Resolved')],
      ...session.allYellowLights.map(light => [
        cell(light.description, String),
        cell(light.severity, String),
        cell(light.stageIdentified, Number),
        cell(light.resolutionPlan || '', String),
        cell(light.owner || '', String),
        cell(light.resolved ? 'Yes' : 'No', String),
      ])
    ]
    sheets.push('Yellow Lights')
    data.push(yellowLightsSheet)
    columns.push([{ width: 50 }, { width: 12 }, { width: 14 }, { width: 30 }, { width: 18 }, { width: 10 }])
  }

  // Generate filename and save
  const clientSlug = (session.clientName || 'discovery').toLowerCase().replace(/\s+/g, '-').slice(0, 30)
  const fileName = `ID-8-enterprise-discovery-${clientSlug}-${new Date().toISOString().split('T')[0]}.xlsx`

  void writeXlsxFile(data, {
    fileName,
    sheets,
    columns,
  })

  return fileName
}
