import { jsPDF } from 'jspdf'
import type { EnterpriseDiscoverySession } from '@/lib/types'
import { calculateTotalCOI } from '@/lib/financial-calculations'
import { REFERENCE_ARCHITECTURES } from '@/lib/microsoft-solutions'

const INNOVATION_HUB_BLUE = [0, 120, 212] as const // #0078D4

const formatGBP = (value: number) => `£${Math.round(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

interface ExportEnterpriseDiscoveryOptions {
  includeFinancials?: boolean
  includeYellowLights?: boolean
}

export async function exportEnterpriseDiscoveryToPDF(
  session: EnterpriseDiscoverySession,
  options: ExportEnterpriseDiscoveryOptions = {}
) {
  const { includeFinancials = true, includeYellowLights = true } = options
  
  const doc = new jsPDF()
  doc.setProperties({ creator: 'ID-8', title: 'ID-8 Enterprise Discovery' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  let y = margin

  const addPageIfNeeded = (requiredSpace: number) => {
    if (y + requiredSpace > pageHeight - margin) {
      doc.addPage()
      y = margin
      return true
    }
    return false
  }

  const drawSectionHeader = (title: string) => {
    addPageIfNeeded(20)
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...INNOVATION_HUB_BLUE)
    doc.text(title, margin, y)
    y += 10
    doc.setTextColor(0, 0, 0)
  }

  const drawField = (label: string, value: string | number | undefined) => {
    if (!value) return
    addPageIfNeeded(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(`${label}:`, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    const text = String(value)
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2 - 50)
    doc.text(lines, margin + 50, y)
    y += lines.length * 5 + 3
  }

  const drawBullets = (items: string[]) => {
    items.filter(Boolean).forEach((item) => {
      addPageIfNeeded(8)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(40, 40, 40)

      doc.text('•', margin, y)
      const lines = doc.splitTextToSize(item, pageWidth - margin * 2 - 8)
      doc.text(lines, margin + 5, y)
      y += Math.max(6, lines.length * 4.5) + 1
    })
  }

  // ============ COVER PAGE ============
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...INNOVATION_HUB_BLUE)
  doc.text('Microsoft Innovation Hub', pageWidth / 2, 50, { align: 'center' })
  
  doc.setFontSize(22)
  doc.setTextColor(50, 50, 50)
  doc.text('Enterprise Discovery Report', pageWidth / 2, 65, { align: 'center' })
  
  // Client name
  doc.setFontSize(18)
  doc.setTextColor(...INNOVATION_HUB_BLUE)
  doc.text(session.clientName || 'Unnamed Client', pageWidth / 2, 90, { align: 'center' })
  
  // Session date
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(100, 100, 100)
  const sessionDate = new Date(session.sessionDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  doc.text(sessionDate, pageWidth / 2, 105, { align: 'center' })

  // Progress indicator
  const completedStages = Object.values(session.stages).filter(s => s.status === 'completed').length
  doc.setFontSize(10)
  doc.text(`Completed: ${completedStages} of 9 stages`, pageWidth / 2, 120, { align: 'center' })
  
  // Discovery type
  doc.setFontSize(11)
  doc.setTextColor(60, 60, 60)
  const discoveryTypeLabel = session.discoveryType === 'new-opportunity' 
    ? 'New Opportunity Discovery'
    : session.discoveryType === 'renewal'
    ? 'Renewal Discovery'
    : 'Expansion Discovery'
  doc.text(`Type: ${discoveryTypeLabel}`, pageWidth / 2, 135, { align: 'center' })

  // Attendees
  if (session.attendees && session.attendees.length > 0) {
    y = 155
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...INNOVATION_HUB_BLUE)
    doc.text('Attendees', pageWidth / 2, y, { align: 'center' })
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)
    session.attendees.forEach(att => {
      doc.text(`${att.name} - ${att.role}`, pageWidth / 2, y, { align: 'center' })
      y += 5
    })
  }

  // Generated timestamp
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(
    `Generated on ${new Date().toLocaleString('en-GB')}`,
    pageWidth / 2,
    pageHeight - 20,
    { align: 'center' }
  )

  // ============ EXECUTIVE SUMMARY ============
  doc.addPage()
  y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...INNOVATION_HUB_BLUE)
  doc.text('Executive Summary', margin, y)
  y += 15

  // Stage 1 Data - Opportunity
  const stage1Data = session.stages[1].data
  if (stage1Data) {
    // SCQ
    if (stage1Data.scq) {
      drawSectionHeader('Situation-Complication-Question')
      
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Situation:', margin, y)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const sitLines = doc.splitTextToSize(stage1Data.scq.situation || '', pageWidth - margin * 2)
      doc.text(sitLines, margin, y)
      y += sitLines.length * 4 + 6

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Complication:', margin, y)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const compLines = doc.splitTextToSize(stage1Data.scq.complication || '', pageWidth - margin * 2)
      doc.text(compLines, margin, y)
      y += compLines.length * 4 + 6

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Strategic Question:', margin, y)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const qLines = doc.splitTextToSize(stage1Data.scq.question || '', pageWidth - margin * 2)
      doc.text(qLines, margin, y)
      y += qLines.length * 4 + 10
    }

    // Problem Statement
    if (stage1Data.problemStatement) {
      drawSectionHeader('Problem Statement')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      const problemLines = doc.splitTextToSize(stage1Data.problemStatement, pageWidth - margin * 2)
      doc.text(problemLines, margin, y)
      y += problemLines.length * 5 + 8
    }

    // Desired Outcome
    if (stage1Data.desiredOutcome) {
      drawSectionHeader('Desired Outcome')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      const outcomeLines = doc.splitTextToSize(stage1Data.desiredOutcome, pageWidth - margin * 2)
      doc.text(outcomeLines, margin, y)
      y += outcomeLines.length * 5 + 8
    }

    // Cost of Inaction
    if (stage1Data.coi && includeFinancials) {
      drawSectionHeader('Cost of Inaction')
      
      const totalCOI = calculateTotalCOI(stage1Data.coi)
      
      // Total COI box
      doc.setFillColor(240, 248, 255)
      doc.roundedRect(margin, y, pageWidth - margin * 2, 25, 3, 3, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...INNOVATION_HUB_BLUE)
      doc.text('Annual Cost of Inaction', margin + 10, y + 10)
      doc.setFontSize(16)
      doc.text(`£${totalCOI.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, margin + 10, y + 20)
      y += 35
      doc.setTextColor(0, 0, 0)

      // Breakdown
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const coi = stage1Data.coi
      doc.text(`Direct Costs: £${((coi.directCosts.oneTime || 0) + (coi.directCosts.recurring || 0) * 12).toLocaleString()} /year`, margin, y)
      y += 5
      doc.text(`Opportunity Costs: £${((coi.opportunityCosts.oneTime || 0) + (coi.opportunityCosts.recurring || 0) * 12).toLocaleString()} /year`, margin, y)
      y += 5
      const riskAnnual = (coi.riskCosts.oneTime || 0) * (coi.riskCosts.oneTimeProbability || 0) / 100
        + (coi.riskCosts.recurring || 0) * (coi.riskCosts.recurringProbability || 0) / 100 * 12
      doc.text(`Risk-Adjusted Costs: £${riskAnnual.toLocaleString(undefined, { maximumFractionDigits: 0 })} /year`, margin, y)
      y += 10
    }

    // Success Metrics
    if (stage1Data.successMetrics && stage1Data.successMetrics.length > 0) {
      drawSectionHeader('Success Metrics')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      stage1Data.successMetrics.forEach((metric, i) => {
        if (metric.trim()) {
          addPageIfNeeded(6)
          doc.text(`${i + 1}. ${metric}`, margin, y)
          y += 6
        }
      })
      y += 5
    }
  }

  // ============ STAGE 2: RESOURCES ============
  const stage2Data = session.stages[2].data
  if (stage2Data) {
    addPageIfNeeded(60)
    drawSectionHeader('Resources & Budget')
    
    if (stage2Data.budgetRange) {
      drawField('Budget Range', stage2Data.budgetRange)
    }
    if (stage2Data.executiveSponsor) {
      drawField('Executive Sponsor', stage2Data.executiveSponsor)
    }
    if (stage2Data.projectLead) {
      drawField('Project Lead', stage2Data.projectLead)
    }
    if (stage2Data.budgetOwner) {
      drawField('Budget Owner', stage2Data.budgetOwner)
    }
    if (stage2Data.technicalDebtConcerns) {
      drawField('Technical Concerns', stage2Data.technicalDebtConcerns)
    }
    y += 5
  }

  // ============ STAGE 3: DECISION PROCESS ============
  const stage3Data = session.stages[3].data
  if (stage3Data) {
    addPageIfNeeded(70)
    drawSectionHeader('Decision Process')

    if (stage3Data.stakeholders && stage3Data.stakeholders.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text('Stakeholders', margin, y)
      y += 7

      drawBullets(stage3Data.stakeholders.slice(0, 12).map(s => `${s.name} (${s.role}) — ${s.type}, disposition: ${s.disposition}, access: ${s.accessLevel}. Concern: ${s.keyConcern}`))
      y += 4
    }

    if (stage3Data.formalCriteria && stage3Data.formalCriteria.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text('Evaluation Criteria', margin, y)
      y += 7

      drawBullets(stage3Data.formalCriteria.slice(0, 10).map(c => c.weighting != null ? `${c.criterion} (weight ${c.weighting})` : c.criterion))
      if (stage3Data.informalCriteria && stage3Data.informalCriteria.length > 0) {
        drawBullets(stage3Data.informalCriteria.slice(0, 8).map(c => `Informal: ${c}`))
      }
      y += 4
    }

    drawField('Competition', stage3Data.competition)
    drawField('Competitive Position', stage3Data.competitivePosition)
    drawField('Decision Style', stage3Data.decisionStyle)
    drawField('Procurement Involvement', stage3Data.procurementInvolvement == null ? undefined : (stage3Data.procurementInvolvement ? 'Yes' : 'No'))
    drawField('Decision Timeline', stage3Data.decisionTimeline ? new Date(stage3Data.decisionTimeline).toLocaleDateString('en-GB') : undefined)

    if (stage3Data.approvalStages && stage3Data.approvalStages.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text('Approval Stages', margin, y)
      y += 7

      drawBullets(stage3Data.approvalStages.slice(0, 10).map(s => {
        const dt = s.expectedDate ? new Date(s.expectedDate).toLocaleDateString('en-GB') : 'TBD'
        return `${s.stage}: ${s.approver} (target ${dt})`
      }))
      y += 4
    }
  }

  // ============ STAGE 4: PRIORITISATION ============
  const stage4Data = session.stages[4].data
  if (stage4Data) {
    addPageIfNeeded(60)
    drawSectionHeader('Prioritisation (RICE)')

    if (stage4Data.recommendedOpportunityId) {
      const rec = stage4Data.opportunities?.find(o => o.id === stage4Data.recommendedOpportunityId)
      if (rec) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        doc.text('Recommended Opportunity', margin, y)
        y += 7
        drawBullets([`${rec.title} — RICE ${rec.rice.score.toFixed(1)} (R ${rec.rice.reach}, I ${rec.rice.impact}, C ${rec.rice.confidence}%, E ${rec.rice.effort})`])
        y += 4
      }
    }

    if (stage4Data.opportunities && stage4Data.opportunities.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text('Top opportunities', margin, y)
      y += 7
      const ranked = [...stage4Data.opportunities].sort((a, b) => (b.rice.score || 0) - (a.rice.score || 0)).slice(0, 8)
      drawBullets(ranked.map(o => `${o.title} — RICE ${o.rice.score.toFixed(1)}`))
      y += 4
    }
  }

  // ============ STAGE 5: SOLUTION SCOPE ============
  const stage5Data = session.stages[5].data
  if (stage5Data && includeFinancials) {
    doc.addPage()
    y = margin

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...INNOVATION_HUB_BLUE)
    doc.text('Financial Impact Analysis', margin, y)
    y += 15

    // Revenue Impact
    if (stage5Data.revenueImpact && stage5Data.revenueImpact.drivers && stage5Data.revenueImpact.drivers.length > 0) {
      drawSectionHeader('Revenue Impact')
      
      let totalRevenue = 0
      stage5Data.revenueImpact.drivers.forEach(driver => {
        if (driver.enabled && driver.calculatedAnnualValue) {
          totalRevenue += driver.calculatedAnnualValue
          addPageIfNeeded(8)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)
          const driverLabel = driver.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          doc.text(`• ${driverLabel}: £${driver.calculatedAnnualValue.toLocaleString()} /year`, margin, y)
          y += 6
        }
      })
      
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`Total Revenue Impact: £${totalRevenue.toLocaleString()} /year`, margin, y)
      y += 10
    }

    // Cost Impact
    if (stage5Data.costImpact && stage5Data.costImpact.drivers && stage5Data.costImpact.drivers.length > 0) {
      drawSectionHeader('Cost Reduction')
      
      let totalCost = 0
      let totalFTE = 0
      stage5Data.costImpact.drivers.forEach(driver => {
        if (driver.enabled && driver.calculatedAnnualValue) {
          totalCost += driver.calculatedAnnualValue
          totalFTE += driver.fteEquivalent || 0
          addPageIfNeeded(8)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)
          const driverLabel = driver.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          doc.text(`• ${driverLabel}: £${driver.calculatedAnnualValue.toLocaleString()} /year (${(driver.fteEquivalent || 0).toFixed(1)} FTE)`, margin, y)
          y += 6
        }
      })
      
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`Total Cost Savings: £${totalCost.toLocaleString()} /year (${totalFTE.toFixed(1)} FTE equivalent)`, margin, y)
      y += 10
    }

    // Balance Sheet / Cash Flow
    if (stage5Data.balanceSheetCashFlow && stage5Data.balanceSheetCashFlow.drivers && stage5Data.balanceSheetCashFlow.drivers.length > 0) {
      drawSectionHeader('Working Capital & Cash Flow')
      
      let totalCashFlow = 0
      stage5Data.balanceSheetCashFlow.drivers.forEach(driver => {
        if (driver.enabled && driver.calculatedValue) {
          totalCashFlow += driver.calculatedValue
          addPageIfNeeded(8)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)
          const driverLabel = driver.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          doc.text(`• ${driverLabel}: £${driver.calculatedValue.toLocaleString()}`, margin, y)
          y += 6
        }
      })
      
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`Total Cash Flow Benefit: £${totalCashFlow.toLocaleString()}`, margin, y)
      y += 10
    }

    // Combined Summary Box
    addPageIfNeeded(40)
    y += 5
    doc.setFillColor(240, 248, 255)
    doc.roundedRect(margin, y, pageWidth - margin * 2, 35, 3, 3, 'F')
    
    const revenueTotal = stage5Data.revenueImpact?.drivers?.reduce((sum, d) => sum + (d.enabled ? d.calculatedAnnualValue || 0 : 0), 0) || 0
    const costTotal = stage5Data.costImpact?.drivers?.reduce((sum, d) => sum + (d.enabled ? d.calculatedAnnualValue || 0 : 0), 0) || 0
    const cashFlowTotal = stage5Data.balanceSheetCashFlow?.drivers?.reduce((sum, d) => sum + (d.enabled ? d.calculatedValue || 0 : 0), 0) || 0
    const grandTotal = revenueTotal + costTotal + cashFlowTotal

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...INNOVATION_HUB_BLUE)
    doc.text('Total Annual Business Impact', margin + 10, y + 12)
    doc.setFontSize(20)
    doc.text(`£${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, margin + 10, y + 28)
    
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(`Revenue: £${revenueTotal.toLocaleString()} | Cost Savings: £${costTotal.toLocaleString()} | Cash Flow: £${cashFlowTotal.toLocaleString()}`, pageWidth - margin - 10, y + 20, { align: 'right' })
    
    y += 45
    doc.setTextColor(0, 0, 0)
  }

  // ============ STAGE 6: VALIDATION & ASSUMPTIONS ============
  const stage6Data = session.stages[6].data
  if (stage6Data) {
    addPageIfNeeded(70)
    drawSectionHeader('Validation & Assumptions')

    if (stage6Data.assumptions && stage6Data.assumptions.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text('Key assumptions (with validation plan)', margin, y)
      y += 7
      drawBullets(stage6Data.assumptions.slice(0, 10).map(a => `${a.assumption} — basis: ${a.basis} (confidence: ${a.confidence}). Validate: ${a.validationPlan}`))
      y += 4
    }

    drawField('Value location', stage6Data.valueLocation)
    drawField('Value validator', stage6Data.valueValidator)
    drawField('Review frequency', stage6Data.reviewFrequency)
    y += 4
  }

  // ============ STAGE 7: COMMIT ============
  const stage7Data = session.stages[7].data
  if (stage7Data) {
    addPageIfNeeded(70)
    drawSectionHeader('Commit Decision')

    drawField('Decision', stage7Data.decision)

    const trust = stage7Data.trustIndicators
    const engage = stage7Data.engagementIndicators
    const fit = stage7Data.fitIndicators
    drawBullets([
      `Trust: numbers shared (${trust.sharingRealNumbers}), concerns shared (${trust.sharingRealConcerns}), confidence we can deliver (${trust.believeWeCanDeliver}).`,
      `Engagement: access to decision makers (${engage.accessToDecisionMakers}), responsiveness (${engage.responsiveness}), client investing resources (${engage.clientInvestingResources}).`,
      `Fit: strategic fit (${fit.strategicFit}), can deliver (${fit.canDeliver}), commercial viability (${fit.commercialViability}).`,
    ])
    y += 4
  }

  // ============ STAGE 8: COMMUNICATE (ROI / INVESTMENT ANALYSIS) ============
  const stage8Data = session.stages[8].data
  if (stage8Data && includeFinancials) {
    addPageIfNeeded(90)
    drawSectionHeader('Investment Analysis (Stage 8)')

    const ia = stage8Data.investmentAnalysis
    if (ia) {
      // Summary box
      addPageIfNeeded(35)
      doc.setFillColor(240, 248, 255)
      doc.roundedRect(margin, y, pageWidth - margin * 2, 32, 3, 3, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...INNOVATION_HUB_BLUE)
      doc.text('ROI Summary', margin + 10, y + 10)

      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text(`Investment (Y1): ${formatGBP(ia.totalInvestmentYear1)}`, margin + 10, y + 18)
      doc.text(`Annual benefit: ${formatGBP(ia.totalAnnualBenefit)}`, margin + 10, y + 24)
      doc.text(`Payback: ${ia.simplePaybackMonths.toFixed(0)} months`, pageWidth - margin - 10, y + 18, { align: 'right' })
      doc.text(`3Y ROI: ${ia.roi3Year.toFixed(0)}%`, pageWidth - margin - 10, y + 24, { align: 'right' })
      y += 40
      doc.setTextColor(0, 0, 0)

      drawField('NPV @ 10%', formatGBP(ia.npv10Percent))
      drawField('IRR', `${ia.irr.toFixed(1)}%`)
      y += 4
    }

    const sa = stage8Data.sensitivityAnalysis
    if (sa) {
      addPageIfNeeded(60)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text('Sensitivity analysis', margin, y)
      y += 7
      drawBullets([
        `Conservative: benefit ${formatGBP(sa.conservative.annualBenefit)}, payback ${sa.conservative.paybackMonths.toFixed(0)}mo, ROI ${sa.conservative.roi3Year.toFixed(0)}%, NPV ${formatGBP(sa.conservative.npv)}.`,
        `Base: benefit ${formatGBP(sa.base.annualBenefit)}, payback ${sa.base.paybackMonths.toFixed(0)}mo, ROI ${sa.base.roi3Year.toFixed(0)}%, NPV ${formatGBP(sa.base.npv)}.`,
        `Optimistic: benefit ${formatGBP(sa.optimistic.annualBenefit)}, payback ${sa.optimistic.paybackMonths.toFixed(0)}mo, ROI ${sa.optimistic.roi3Year.toFixed(0)}%, NPV ${formatGBP(sa.optimistic.npv)}.`,
      ])
      y += 4
    }

    const pl = stage8Data.plImpact
    if (pl) {
      addPageIfNeeded(40)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text('P&L impact (3-year total)', margin, y)
      y += 7
      drawBullets([
        `Revenue impact: ${formatGBP(pl.total.revenueImpact)}`,
        `OPEX impact: ${formatGBP(pl.total.opexImpact)}`,
        `EBIT impact: ${formatGBP(pl.total.ebitImpact)}`,
      ])
      y += 4
    }
  }

  // ============ SOLUTION ARCHITECTURE (Text Summary) ============
  if (stage5Data) {
    const mappings = (stage5Data as unknown as { solutionArchitecture?: { useCaseMappings?: Array<{
      useCaseId?: string
      referenceArchitecture?: string
      microsoftSolutions?: unknown[]
    }> } })?.solutionArchitecture?.useCaseMappings

    const mapped = (mappings ?? []).filter(m => m.referenceArchitecture)
    if (mapped.length > 0) {
      addPageIfNeeded(40)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(...INNOVATION_HUB_BLUE)
      doc.text('Solution Architecture Summary', margin, y)
      y += 10

      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.text('For detailed architecture diagrams, see Threadlight.', margin, y)
      y += 8

      for (const mapping of mapped) {
        const arch = REFERENCE_ARCHITECTURES[mapping.referenceArchitecture as keyof typeof REFERENCE_ARCHITECTURES]
        if (!arch) continue

        addPageIfNeeded(14)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(0, 0, 0)
        doc.text(`• ${arch.label}`, margin, y)
        y += 5

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(60, 60, 60)
        const descLines = doc.splitTextToSize(arch.description, pageWidth - margin * 2 - 10)
        doc.text(descLines, margin + 5, y)
        y += descLines.length * 4 + 4
      }
    }
  }

  // ============ YELLOW LIGHTS ============
  if (includeYellowLights && session.allYellowLights && session.allYellowLights.length > 0) {
    addPageIfNeeded(60)
    drawSectionHeader('Yellow Lights & Concerns')
    
    const unresolvedLights = session.allYellowLights.filter(l => !l.resolved)
    const resolvedLights = session.allYellowLights.filter(l => l.resolved)

    if (unresolvedLights.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(180, 130, 0)
      doc.text(`Unresolved (${unresolvedLights.length})`, margin, y)
      y += 8
      
      unresolvedLights.forEach(light => {
        addPageIfNeeded(15)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)
        
        const severityBadge = light.severity === 'deal-breaker' ? '🔴' : light.severity === 'serious' ? '🟠' : '🟡'
        const lines = doc.splitTextToSize(`${severityBadge} ${light.description}`, pageWidth - margin * 2 - 10)
        doc.text(lines, margin + 5, y)
        y += lines.length * 4 + 4
      })
      y += 5
    }

    if (resolvedLights.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(0, 150, 0)
      doc.text(`Resolved (${resolvedLights.length})`, margin, y)
      y += 8
      
      resolvedLights.forEach(light => {
        addPageIfNeeded(10)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        const lines = doc.splitTextToSize(`✓ ${light.description}`, pageWidth - margin * 2 - 10)
        doc.text(lines, margin + 5, y)
        y += lines.length * 4 + 3
      })
    }
  }

  // ============ FOOTER ON EACH PAGE ============
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    )
    doc.text(
      'Microsoft Innovation Hub - Enterprise Discovery',
      margin,
      pageHeight - 10
    )
  }

  // Save
  const clientSlug = (session.clientName || 'discovery').toLowerCase().replace(/\s+/g, '-').slice(0, 30)
  const fileName = `ID-8-enterprise-discovery-${clientSlug}-${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)

  return fileName
}
