import { jsPDF } from 'jspdf'
import { UseCase, ScoringMethod, CustomerMetadata, SuggestedUseCaseData, AI_GOVERNANCE_DIMENSION_LABELS, AI_GOVERNANCE_MATURITY_CONFIG } from './types'
import type { AIGovernanceAssessment } from './types'
import { calculateBlendedScore, calculateRICEScore, calculateRiskAdjustedFinancial, getQuadrant } from './scoring'
import { getKPIById } from './kpis'
import { DISCLAIMERS, getPolicyById } from './ai-policies'
import { REFERENCE_ARCHITECTURES } from './microsoft-solutions'

export interface ExportOptions {
  effortUnit: 'person-weeks' | 'fte' | 'man-hours'
  customerMetadata?: CustomerMetadata
  suggestedUseCases?: SuggestedUseCaseData[]
  includeDisclaimers?: boolean
  includeCOI?: boolean
  includeExpectedValue?: boolean
  includeDataSources?: boolean
  includeCustomerJourney?: boolean
  includeGovernance?: boolean
  governanceAssessment?: AIGovernanceAssessment
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

function getDataSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    'earnings': 'Earnings Calls',
    'financials': 'Financial Statements',
    'news': 'News & Market',
    'industry-research': 'Industry Research',
    'discovery': 'Discovery Session'
  }
  return labels[source] || source
}

export function convertEffort(personWeeks: number, unit: 'person-weeks' | 'fte' | 'man-hours'): number {
  switch (unit) {
    case 'person-weeks':
      return personWeeks
    case 'fte':
      return personWeeks / 52
    case 'man-hours':
      return personWeeks * 40
  }
}

export function getEffortUnitLabel(unit: 'person-weeks' | 'fte' | 'man-hours'): string {
  switch (unit) {
    case 'person-weeks':
      return 'Person-Weeks'
    case 'fte':
      return 'FTE (Years)'
    case 'man-hours':
      return 'Man-Hours'
  }
}

export async function exportToPDF(
  useCases: UseCase[],
  topUseCases: UseCase[],
  scoringMethod: ScoringMethod,
  options: ExportOptions
) {
  const doc = new jsPDF()
  doc.setProperties({ creator: 'ID-8', title: 'ID-8 Discovery Assessment' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  let y = margin

  const drawBullets = (items: string[], x: number, maxWidth: number) => {
    items.filter(Boolean).forEach((item) => {
      addPageIfNeeded(6)
      doc.text('•', x, y)
      const lines = doc.splitTextToSize(item, maxWidth - 6)
      doc.text(lines, x + 4, y)
      y += Math.max(5, lines.length * 4.5)
    })
  }

  const drawMiniSection = (title: string) => {
    addPageIfNeeded(10)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(90, 90, 120)
    doc.text(title, margin + 5, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(70, 70, 70)
  }

  const addPageIfNeeded = (requiredSpace: number) => {
    if (y + requiredSpace > pageHeight - margin) {
      doc.addPage()
      y = margin
      return true
    }
    return false
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(80, 50, 180)
  doc.text('Microsoft Innovation Hub', pageWidth / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(18)
  doc.setTextColor(50, 50, 50)
  doc.text('Use Case Assessment', pageWidth / 2, y, { align: 'center' })
  y += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, pageWidth / 2, y, { align: 'center' })
  y += 4
  doc.text(
    `Scoring Method: ${scoringMethod === 'rice' ? 'RICE' : scoringMethod === 'blended' ? 'Balanced' : scoringMethod === 'financial-impact' ? 'Financial Impact' : 'Impact vs. Feasibility'}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  )
  y += 12

  if (options.customerMetadata) {
    const meta = options.customerMetadata
    const hasAnyMetadata = meta.customerName || meta.primaryStakeholder || meta.accountTeamRep || 
                          meta.innovationHubLocation || meta.solutionEngineer

    if (hasAnyMetadata) {
      addPageIfNeeded(60)
      doc.setDrawColor(200, 200, 200)
      doc.line(margin, y, pageWidth - margin, y)
      y += 8

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(60, 60, 60)
      doc.text('Customer Information', margin, y)
      y += 8

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)

      const fields = [
        { label: 'Customer Name', value: meta.customerName },
        { label: 'Primary Stakeholder', value: meta.primaryStakeholder },
        { label: 'Account Team Rep', value: meta.accountTeamRep },
        { label: 'Innovation Hub Location', value: meta.innovationHubLocation },
        { label: 'Solution Engineer', value: meta.solutionEngineer },
      ]

      fields.forEach(field => {
        if (field.value) {
          addPageIfNeeded(8)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.setTextColor(100, 100, 100)
          doc.text(`${field.label}:`, margin, y)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(0, 0, 0)
          doc.text(field.value, margin + 50, y)
          y += 6
        }
      })

      y += 6
    }

    if (meta.executiveSummary) {
      addPageIfNeeded(40)
      doc.setDrawColor(200, 200, 200)
      doc.line(margin, y, pageWidth - margin, y)
      y += 8

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(60, 60, 60)
      doc.text('Executive Summary', margin, y)
      y += 8

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(40, 40, 40)
      const summaryLines = doc.splitTextToSize(meta.executiveSummary, pageWidth - 2 * margin)
      summaryLines.forEach((line: string) => {
        addPageIfNeeded(6)
        doc.text(line, margin, y)
        y += 5
      })
      y += 8
    }
  }

  // ============ FINANCIAL IMPACT SUMMARY ============
  const useCasesWithCOI = useCases.filter(uc => uc.costOfInaction?.totalAnnualCOI)
  const useCasesWithEV = useCases.filter(uc => uc.expectedValue?.totalAnnualValue)
  const totalCOI = useCasesWithCOI.reduce((sum, uc) => sum + (uc.costOfInaction?.totalAnnualCOI || 0), 0)
  const totalEV = useCasesWithEV.reduce((sum, uc) => sum + (uc.expectedValue?.totalAnnualValue || 0), 0)
  const totalImplementationCost = useCasesWithEV.reduce((sum, uc) => sum + (uc.expectedValue?.implementationCost || 0), 0)

  if ((options.includeCOI !== false || options.includeExpectedValue !== false) && (totalCOI > 0 || totalEV > 0)) {
    addPageIfNeeded(80)
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(60, 60, 60)
    doc.text('Financial Impact Summary', margin, y)
    y += 10

    // COI Summary Box
    if (options.includeCOI !== false && totalCOI > 0) {
      doc.setFillColor(255, 240, 240)
      doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 25, 2, 2, 'F')
      doc.setDrawColor(200, 100, 100)
      doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 25, 2, 2, 'S')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(180, 60, 60)
      doc.text('Total Cost of Inaction', margin + 5, y + 4)
      
      doc.setFontSize(16)
      doc.text(`${formatCurrency(totalCOI)}/year`, pageWidth - margin - 5, y + 4, { align: 'right' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(120, 60, 60)
      doc.text(`Based on ${useCasesWithCOI.length} use cases with quantified cost of inaction`, margin + 5, y + 14)
      
      // Breakdown
      const totalDirect = useCasesWithCOI.reduce((sum, uc) => sum + (uc.costOfInaction?.directCosts || 0), 0)
      const totalOpportunity = useCasesWithCOI.reduce((sum, uc) => sum + (uc.costOfInaction?.opportunityCosts || 0), 0)
      const totalRisk = useCasesWithCOI.reduce((sum, uc) => sum + (uc.costOfInaction?.riskCosts || 0), 0)
      doc.text(`Direct: ${formatCurrency(totalDirect)} | Opportunity: ${formatCurrency(totalOpportunity)} | Risk: ${formatCurrency(totalRisk)}`, pageWidth - margin - 5, y + 14, { align: 'right' })
      
      y += 32
    }

    // Expected Value Summary Box
    if (options.includeExpectedValue !== false && totalEV > 0) {
      doc.setFillColor(240, 255, 240)
      doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 30, 2, 2, 'F')
      doc.setDrawColor(100, 180, 100)
      doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 30, 2, 2, 'S')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(60, 140, 60)
      doc.text('Total Expected Value', margin + 5, y + 4)
      
      doc.setFontSize(16)
      doc.text(`${formatCurrency(totalEV)}/year`, pageWidth - margin - 5, y + 4, { align: 'right' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(60, 100, 60)
      doc.text(`Based on ${useCasesWithEV.length} use cases with quantified expected value`, margin + 5, y + 14)

      if (totalImplementationCost > 0) {
        const paybackMonths = (totalImplementationCost / totalEV) * 12
        const threeYearROI = ((totalEV * 3 - totalImplementationCost) / totalImplementationCost) * 100
        doc.text(`Implementation: ${formatCurrency(totalImplementationCost)} | Payback: ${paybackMonths.toFixed(0)} months | 3-Year ROI: ${threeYearROI.toFixed(0)}%`, pageWidth - margin - 5, y + 14, { align: 'right' })
      }

      // Breakdown
      const totalRevenue = useCasesWithEV.reduce((sum, uc) => sum + (uc.expectedValue?.revenueImpact || 0), 0)
      const totalSavings = useCasesWithEV.reduce((sum, uc) => sum + (uc.expectedValue?.costSavings || 0), 0)
      doc.text(`Revenue Impact: ${formatCurrency(totalRevenue)} | Cost Savings: ${formatCurrency(totalSavings)}`, margin + 5, y + 20)
      
      y += 38
    }

    y += 4
  }

  if (scoringMethod === 'rice') {
    addPageIfNeeded(80)
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(80, 50, 180)
    doc.text('RICE Scoring Methodology', margin, y)
    y += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    const riceIntro = 'RICE helps you prioritize initiatives using four key factors. Higher scores indicate better opportunities:'
    doc.text(riceIntro, margin, y, { maxWidth: pageWidth - 2 * margin })
    y += 12

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(80, 50, 180)
    doc.text('RICE Score = (Reach × Impact × Confidence) ÷ Effort', margin, y)
    y += 12

    const components = [
      {
        name: 'Reach (Users/Period)',
        description: 'How many unique users will benefit from this use case within a specific time period? This is calculated as Number of Users ÷ Time Period.',
        example: 'Example: If 1,000 users benefit per quarter, enter 1000 users and "quarter" as the period.'
      },
      {
        name: 'Impact Multiplier',
        description: 'How significantly will this affect each user\'s experience or outcomes? Use the scale: 3x = Massive (game-changing), 2x = High (significant improvement), 1x = Medium (noticeable benefit), 0.5x = Low (minor improvement), 0.25x = Minimal (small tweak).',
        example: 'Example: 2x for a high-impact feature'
      },
      {
        name: 'Confidence (%)',
        description: 'How certain are you about your Reach, Impact, and Effort estimates? Lower confidence reduces the final score.',
        example: 'Example: 100% = completely confident, 80% = pretty sure, 50% = rough guess'
      },
      {
        name: 'Effort (Person-Weeks)',
        description: `Total development time required to design, build, test, and deploy this solution. Sum the time across all team members who will work on implementation. This measures the cost to implement the new solution, not the time spent on the current process.`,
        example: 'Example: If 2 developers work for 3 weeks each, and 1 designer works for 1 week = 7 person-weeks total'
      }
    ]

    components.forEach((component) => {
      addPageIfNeeded(30)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(60, 60, 60)
      doc.text(`• ${component.name}`, margin, y)
      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(70, 70, 70)
      const lines = doc.splitTextToSize(component.description, pageWidth - 2 * margin - 5)
      lines.forEach((line: string) => {
        addPageIfNeeded(5)
        doc.text(line, margin + 5, y)
        y += 4
      })
      y += 2

      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.text(component.example, margin + 5, y)
      doc.setTextColor(0, 0, 0)
      y += 8
    })

    y += 5
  } else if (scoringMethod === 'impact-feasibility') {
    addPageIfNeeded(70)
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(80, 50, 180)
    doc.text('Impact vs. Feasibility Scoring', margin, y)
    y += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    const ifIntro = 'Impact/Feasibility scoring helps you prioritize initiatives by plotting them on a 2x2 matrix. Use cases fall into four quadrants:'
    doc.text(ifIntro, margin, y, { maxWidth: pageWidth - 2 * margin })
    y += 12

    const quadrants = [
      {
        name: 'Quick Wins (High Impact, High Feasibility)',
        description: 'Prioritize these first - they deliver significant value and are relatively easy to implement.'
      },
      {
        name: 'Strategic Bets (High Impact, Low Feasibility)',
        description: 'High-value initiatives that require significant investment. Plan carefully and allocate sufficient resources.'
      },
      {
        name: 'Fill-ins (Low Impact, High Feasibility)',
        description: 'Easy to implement but lower value. Good for filling time between major projects.'
      },
      {
        name: 'Time Sinks (Low Impact, Low Feasibility)',
        description: 'Avoid or deprioritize - these require significant effort for minimal return.'
      }
    ]

    quadrants.forEach((quadrant) => {
      addPageIfNeeded(18)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(60, 60, 60)
      doc.text(`• ${quadrant.name}`, margin, y)
      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(70, 70, 70)
      const lines = doc.splitTextToSize(quadrant.description, pageWidth - 2 * margin - 5)
      lines.forEach((line: string) => {
        addPageIfNeeded(5)
        doc.text(line, margin + 5, y)
        y += 4
      })
      y += 4
    })

    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(80, 50, 180)
    doc.text('Score = Impact × Feasibility (both rated 1-10)', margin, y)
    y += 10
  } else {
    addPageIfNeeded(60)
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(80, 50, 180)
    doc.text('Financial Impact Scoring', margin, y)
    y += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    const intro = 'Financial Impact prioritizes opportunities by the largest quantified upside or downside across your portfolio. This highlights the biggest business cases, even if feasibility is uncertain.'
    doc.text(intro, margin, y, { maxWidth: pageWidth - 2 * margin })
    y += 14

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(80, 50, 180)
    doc.text('Score = max(Annual Expected Value, Annual Cost of Inaction)', margin, y)
    y += 10
  }

  doc.addPage()
  y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(80, 50, 180)
  doc.text('Top Recommendations', margin, y)
  y += 10

  for (const [index, useCase] of topUseCases.entries()) {
    addPageIfNeeded(70)

    doc.setFillColor(165, 120, 255)
    doc.roundedRect(margin, y - 5, 10, 10, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(255, 255, 255)
    doc.text(`${index + 1}`, margin + 5, y + 1.5, { align: 'center' })

    doc.setTextColor(40, 40, 40)
    doc.setFontSize(12)
    doc.text(useCase.title, margin + 15, y + 1)
    y += 8

    if (useCase.description) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(70, 70, 70)
      const descLines = doc.splitTextToSize(useCase.description, pageWidth - 2 * margin - 5)
      descLines.forEach((line: string) => {
        addPageIfNeeded(5)
        doc.text(line, margin + 5, y)
        y += 4
      })
      y += 4
    }

    // Reference architecture text note (diagrams handled in Threadlight)
    if (useCase.referenceArchitecture) {
      const arch = REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as keyof typeof REFERENCE_ARCHITECTURES]
      if (arch) {
        addPageIfNeeded(10)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(90, 90, 120)
        doc.text(`Reference Architecture: ${arch.label}`, margin + 5, y)
        y += 4
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
        doc.text('See Threadlight for detailed architecture diagrams.', margin + 5, y)
        y += 6
      }
    }

    // Customer Journey (Innovation Hub Engagement Roadmap)
    if (options.includeCustomerJourney !== false && useCase.customerJourney?.milestones?.length) {
      addPageIfNeeded(30)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(100, 80, 140)
      doc.text('Customer Journey (Innovation Hub Engagement Roadmap)', margin + 5, y)
      y += 5

      // Total duration
      const totalDuration = useCase.customerJourney.milestones.reduce((sum, m) => sum + (parseInt(m.duration, 10) || 0), 0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(80, 80, 80)
      doc.text(`Total Duration: ${totalDuration} weeks`, margin + 5, y)
      y += 5

      // Render each milestone as a timeline item
      const engagementColors: Record<string, { r: number; g: number; b: number }> = {
        'Business Envisioning': { r: 59, g: 130, b: 246 },    // Blue
        'Solution Envisioning': { r: 16, g: 185, b: 129 },    // Green
        'Architecture Design': { r: 245, g: 158, b: 11 },     // Amber
        'Rapid Prototype': { r: 139, g: 92, b: 246 }          // Purple
      }

      useCase.customerJourney.milestones.forEach((milestone, idx) => {
        addPageIfNeeded(18)
        
        const color = engagementColors[milestone.engagement] || { r: 100, g: 100, b: 100 }
        
        // Timeline connector line
        if (idx < useCase.customerJourney!.milestones.length - 1) {
          doc.setDrawColor(200, 200, 200)
          doc.setLineWidth(0.3)
          doc.line(margin + 8, y + 3, margin + 8, y + 16)
        }
        
        // Milestone dot
        doc.setFillColor(color.r, color.g, color.b)
        doc.circle(margin + 8, y + 1, 1.5, 'F')
        
        // Engagement type label
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(color.r, color.g, color.b)
        doc.text(`${idx + 1}. ${milestone.engagement}`, margin + 12, y + 1.5)
        
        // Duration
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(120, 120, 120)
        doc.text(`(${milestone.duration})`, margin + 55, y + 1.5)
        y += 5

        // Deliverables (compact list)
        if (milestone.deliverables && milestone.deliverables.length > 0) {
          doc.setFontSize(6)
          doc.setTextColor(90, 90, 90)
          const deliverablesText = 'Deliverables: ' + milestone.deliverables.join(', ')
          const delLines = doc.splitTextToSize(deliverablesText, pageWidth - 2 * margin - 20)
          delLines.slice(0, 2).forEach((line: string) => {
            doc.text(line, margin + 12, y)
            y += 3
          })
        }

        // Notes (if any)
        if (milestone.notes && milestone.notes.trim().length > 0) {
          doc.setFontSize(6)
          doc.setTextColor(100, 100, 120)
          const notesLines = doc.splitTextToSize(`Note: ${milestone.notes}`, pageWidth - 2 * margin - 20)
          notesLines.slice(0, 1).forEach((line: string) => {
            doc.text(line, margin + 12, y)
            y += 3
          })
        }

        y += 2
      })
      y += 4
    }

    // Data Sources
    if (options.includeDataSources !== false && useCase.dataSources && useCase.dataSources.length > 0) {
      addPageIfNeeded(8)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(100, 100, 150)
      doc.text('Data Sources:', margin + 5, y)
      doc.setFont('helvetica', 'normal')
      const sourcesText = useCase.dataSources.map(s => getDataSourceLabel(s)).join(' • ')
      doc.text(sourcesText, margin + 30, y)
      y += 5
    }

    if (useCase.kpis && useCase.kpis.length > 0) {
      addPageIfNeeded(10)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.text('KPIs:', margin + 5, y)
      y += 4

      doc.setFont('helvetica', 'normal')
      const kpiNames = useCase.kpis.map(kpiId => {
        const kpi = getKPIById(kpiId)
        return kpi ? kpi.name : null
      }).filter(Boolean).join(', ')
      
      const kpiLines = doc.splitTextToSize(kpiNames, pageWidth - 2 * margin - 10)
      kpiLines.forEach((line: string) => {
        addPageIfNeeded(4)
        doc.text(line, margin + 5, y)
        y += 3.5
      })
      y += 4
    }

    // COI and Expected Value for top recommendations
    if ((options.includeCOI !== false && useCase.costOfInaction?.totalAnnualCOI) || 
        (options.includeExpectedValue !== false && useCase.expectedValue?.totalAnnualValue)) {
      addPageIfNeeded(16)
      
      doc.setFillColor(248, 248, 255)
      doc.roundedRect(margin + 5, y - 2, pageWidth - 2 * margin - 10, 12, 2, 2, 'F')
      
      let xPos = margin + 8
      
      if (options.includeCOI !== false && useCase.costOfInaction?.totalAnnualCOI) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(180, 60, 60)
        doc.text(`COI: ${formatCurrency(useCase.costOfInaction.totalAnnualCOI)}/yr`, xPos, y + 5)
        xPos += 45
      }
      
      if (options.includeExpectedValue !== false && useCase.expectedValue?.totalAnnualValue) {
        doc.setTextColor(60, 140, 60)
        doc.text(`Value: ${formatCurrency(useCase.expectedValue.totalAnnualValue)}/yr`, xPos, y + 5)
        xPos += 45
        
        if (useCase.expectedValue.paybackMonths) {
          doc.setTextColor(80, 80, 120)
          doc.text(`Payback: ${useCase.expectedValue.paybackMonths}mo`, xPos, y + 5)
          xPos += 35
        }
        
        if (useCase.expectedValue.threeYearROI) {
          doc.text(`3Y ROI: ${useCase.expectedValue.threeYearROI}%`, xPos, y + 5)
        }
      }
      
      y += 14
    }

    // Notes / assumptions + discovery artifacts (executive-ready)
    const coiNotes = useCase.costOfInaction?.notes
    const evNotes = useCase.expectedValue?.notes
    const hasAnyNotes = (coiNotes && coiNotes.trim().length > 0) || (evNotes && evNotes.trim().length > 0)
    const hasAnyBusiness = useCase.businessProcesses && useCase.businessProcesses.length > 0
    const hasAnySolutions = useCase.microsoftSolutions && useCase.microsoftSolutions.length > 0
    const hasAnyConstraints = (useCase.aiRegulations?.applicableFrameworks?.length || useCase.cybersecurity)
    const hasAnyFinContext = (useCase.earningsContext && useCase.earningsContext.length > 0) || (useCase.industryContext && useCase.industryContext.length > 0)
    const hasAnyEffort = useCase.aiEffortEstimate?.effortWeeks

    if (hasAnyNotes || hasAnyBusiness || hasAnySolutions || hasAnyConstraints || hasAnyFinContext || hasAnyEffort) {
      addPageIfNeeded(30)
      doc.setFillColor(252, 252, 255)
      doc.roundedRect(margin + 5, y - 2, pageWidth - 2 * margin - 10, 8, 2, 2, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(60, 60, 80)
      doc.text('Evidence, Assumptions & Design Inputs', margin + 8, y + 3)
      y += 10

      if (hasAnyNotes) {
        drawMiniSection('Financial calculation notes')
        if (coiNotes && coiNotes.trim().length > 0) {
          drawBullets([`COI notes: ${coiNotes.trim()}`], margin + 8, pageWidth - 2 * margin - 16)
        }
        if (evNotes && evNotes.trim().length > 0) {
          drawBullets([`ROI/Value notes: ${evNotes.trim()}`], margin + 8, pageWidth - 2 * margin - 16)
        }
        y += 2
      }

      if (hasAnyBusiness) {
        drawMiniSection('Business processes')
        const items = (useCase.businessProcesses || []).slice(0, 8).map((p) => {
          const cycle = p.expectedCycleTimeReduction ? ` (cycle time: ${p.expectedCycleTimeReduction})` : ''
          return `${p.processName}: ${p.proposedImprovement}${cycle}`
        })
        drawBullets(items, margin + 8, pageWidth - 2 * margin - 16)
        y += 2
      }

      if (hasAnySolutions) {
        drawMiniSection('Microsoft solution & architecture')
        const solutionItems = (useCase.microsoftSolutions || []).slice(0, 8).map((s) => {
          const services = (s.services || []).join(', ')
          const justification = s.justification ? ` — ${s.justification}` : ''
          return `${s.productFamily} (${s.role}): ${services}${justification}`
        })
        drawBullets(solutionItems, margin + 8, pageWidth - 2 * margin - 16)
        y += 2
      }

      if (hasAnyConstraints) {
        drawMiniSection('Constraints & security')
        const constraintLines: string[] = []
        if (useCase.aiRegulations?.applicableFrameworks?.length) {
          constraintLines.push(`AI regulations: ${useCase.aiRegulations.applicableFrameworks.join(', ')}`)
        }
        if (useCase.aiRegulations?.riskClassification) {
          constraintLines.push(`AI risk classification: ${useCase.aiRegulations.riskClassification}`)
        }
        if (useCase.cybersecurity?.dataClassification) {
          constraintLines.push(`Data classification: ${useCase.cybersecurity.dataClassification}`)
        }
        if (useCase.cybersecurity?.securityRequirements?.length) {
          constraintLines.push(`Security requirements: ${useCase.cybersecurity.securityRequirements.join(', ')}`)
        }
        if (useCase.cybersecurity?.securityNotes) {
          constraintLines.push(`Security notes: ${useCase.cybersecurity.securityNotes}`)
        }
        if (useCase.aiRegulations?.complianceNotes) {
          constraintLines.push(`Compliance notes: ${useCase.aiRegulations.complianceNotes}`)
        }
        drawBullets(constraintLines, margin + 8, pageWidth - 2 * margin - 16)
        y += 2
      }

      if (hasAnyFinContext) {
        drawMiniSection('Financial analysis highlights')
        const earnings = (useCase.earningsContext || []).slice(0, 5).map((t) => `Earnings: ${t}`)
        const industry = (useCase.industryContext || []).slice(0, 5).map((t) => `Market: ${t}`)
        drawBullets([...earnings, ...industry], margin + 8, pageWidth - 2 * margin - 16)
        y += 2
      }

      if (hasAnyEffort) {
        drawMiniSection('Implementation effort estimate')
        const weeks = useCase.aiEffortEstimate?.effortWeeks
        const reason = useCase.aiEffortEstimate?.reasoning
        const lines = [
          weeks ? `Estimated effort: ${weeks} person-weeks` : '',
          reason ? `Reasoning: ${reason}` : '',
        ].filter(Boolean)
        drawBullets(lines, margin + 8, pageWidth - 2 * margin - 16)
        y += 2
      }
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(40, 40, 40)
    if (scoringMethod === 'rice') {
      const score = calculateRICEScore(useCase)
      const effortConverted = convertEffort(useCase.rice.effort, options.effortUnit)
      const effortLabel = getEffortUnitLabel(options.effortUnit)
      
      doc.setFillColor(240, 240, 250)
      doc.roundedRect(margin + 5, y - 3, pageWidth - 2 * margin - 10, 18, 2, 2, 'F')
      
      doc.text(`RICE Score: ${score.toFixed(1)}`, margin + 8, y + 2)
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`Reach: ${useCase.rice.reach.toLocaleString()} users/${useCase.rice.period || 'period'}`, margin + 8, y)
      y += 4
      doc.text(`Impact: ${useCase.rice.impact}× | Confidence: ${useCase.rice.confidence}% | Effort: ${effortConverted.toFixed(2)} ${effortLabel}`, margin + 8, y)
    } else if (scoringMethod === 'impact-feasibility') {
      const combinedScore = useCase.impact * useCase.feasibility
      const quadrant = getQuadrant(useCase.impact, useCase.feasibility)
      
      doc.setFillColor(240, 240, 250)
      doc.roundedRect(margin + 5, y - 3, pageWidth - 2 * margin - 10, 18, 2, 2, 'F')
      
      doc.text(`Score: ${combinedScore.toFixed(1)} | Quadrant: ${quadrant}`, margin + 8, y + 2)
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`Impact: ${useCase.impact}/10 | Feasibility: ${useCase.feasibility}/10`, margin + 8, y)
    } else if (scoringMethod === 'blended') {
      const balanced = calculateBlendedScore(useCase)
      const riskAdjusted = calculateRiskAdjustedFinancial(useCase)

      doc.setFillColor(240, 240, 250)
      doc.roundedRect(margin + 5, y - 3, pageWidth - 2 * margin - 10, 18, 2, 2, 'F')

      doc.text(`Balanced Score: ${balanced.toFixed(1)}`, margin + 8, y + 2)
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`Impact: ${useCase.impact}/10 | Feasibility: ${useCase.feasibility}/10 | Risk-adjusted value: ${formatCurrency(riskAdjusted)}/yr`, margin + 8, y)
    } else {
      const coi = useCase.costOfInaction?.totalAnnualCOI || 0
      const ev = useCase.expectedValue?.totalAnnualValue || 0
      const score = Math.max(coi, ev)

      doc.setFillColor(240, 240, 250)
      doc.roundedRect(margin + 5, y - 3, pageWidth - 2 * margin - 10, 14, 2, 2, 'F')

      doc.text(`Financial Impact Score: ${formatCurrency(score)}/yr`, margin + 8, y + 2)
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`Uses max(COI, Value) across quantified inputs`, margin + 8, y)
    }
    y += 12
  }

  if (useCases.length > topUseCases.length) {
    doc.addPage()
    y = margin

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(80, 50, 180)
    doc.text(`All Use Cases (${useCases.length})`, margin, y)
    y += 10

    useCases.forEach((useCase) => {
      addPageIfNeeded(50)

      const isTopPick = topUseCases.some(top => top.id === useCase.id)
      
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(40, 40, 40)
      doc.text(useCase.title, margin, y)
      
      if (isTopPick) {
        doc.setTextColor(165, 120, 255)
        doc.setFontSize(8)
        doc.text('★ TOP PICK', pageWidth - margin - 20, y)
        doc.setTextColor(0, 0, 0)
      }
      y += 6

      if (useCase.description) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(70, 70, 70)
        const descLines = doc.splitTextToSize(useCase.description, pageWidth - 2 * margin - 3)
        descLines.forEach((line: string) => {
          addPageIfNeeded(4)
          doc.text(line, margin + 3, y)
          y += 3.5
        })
        y += 3
      }

      // Data Sources
      if (options.includeDataSources !== false && useCase.dataSources && useCase.dataSources.length > 0) {
        addPageIfNeeded(6)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7)
        doc.setTextColor(100, 100, 150)
        const sourcesText = 'Sources: ' + useCase.dataSources.map(s => getDataSourceLabel(s)).join(' • ')
        doc.text(sourcesText, margin + 3, y)
        y += 4
      }

      if (useCase.kpis && useCase.kpis.length > 0) {
        addPageIfNeeded(8)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(100, 100, 100)
        doc.text('KPIs:', margin + 3, y)
        doc.setFont('helvetica', 'normal')
        const kpiNames = useCase.kpis.map(kpiId => {
          const kpi = getKPIById(kpiId)
          return kpi ? kpi.name : null
        }).filter(Boolean).join(', ')
        doc.text(kpiNames, margin + 13, y, { maxWidth: pageWidth - 2 * margin - 16 })
        y += 5
      }

      // COI and Expected Value for all use cases (compact format)
      const hasCOI = options.includeCOI !== false && useCase.costOfInaction?.totalAnnualCOI
      const hasEV = options.includeExpectedValue !== false && useCase.expectedValue?.totalAnnualValue
      if (hasCOI || hasEV) {
        addPageIfNeeded(6)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        
        let financialText = ''
        if (hasCOI) {
          doc.setTextColor(180, 60, 60)
          financialText += `COI: ${formatCurrency(useCase.costOfInaction!.totalAnnualCOI)}/yr`
        }
        if (hasEV) {
          if (financialText) financialText += ' | '
          financialText += `Value: ${formatCurrency(useCase.expectedValue!.totalAnnualValue)}/yr`
          if (useCase.expectedValue!.paybackMonths) {
            financialText += ` (${useCase.expectedValue!.paybackMonths}mo payback)`
          }
        }
        
        doc.setTextColor(80, 80, 120)
        doc.text(financialText, margin + 3, y)
        y += 5
      }

      // Notes (compact)
      const notes: string[] = []
      if (useCase.costOfInaction?.notes && useCase.costOfInaction.notes.trim().length > 0) {
        notes.push(`COI notes: ${useCase.costOfInaction.notes.trim()}`)
      }
      if (useCase.expectedValue?.notes && useCase.expectedValue.notes.trim().length > 0) {
        notes.push(`ROI/Value notes: ${useCase.expectedValue.notes.trim()}`)
      }
      if (notes.length > 0) {
        addPageIfNeeded(10)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(90, 90, 90)
        const joined = notes.join(' | ')
        doc.text(doc.splitTextToSize(joined, pageWidth - 2 * margin - 6), margin + 3, y)
        y += 6
      }

      doc.setFontSize(8)
      doc.setTextColor(60, 60, 60)
      if (scoringMethod === 'rice') {
        const score = calculateRICEScore(useCase)
        const effortConverted = convertEffort(useCase.rice.effort, options.effortUnit)
        const effortLabel = getEffortUnitLabel(options.effortUnit)
        
        doc.text(
          `RICE: ${score.toFixed(1)} | R: ${useCase.rice.reach} | I: ${useCase.rice.impact}× | C: ${useCase.rice.confidence}% | E: ${effortConverted.toFixed(2)} ${effortLabel}`,
          margin + 3,
          y
        )
      } else if (scoringMethod === 'impact-feasibility') {
        const combinedScore = useCase.impact * useCase.feasibility
        doc.text(
          `Score: ${combinedScore.toFixed(1)} | Impact: ${useCase.impact}/10 | Feasibility: ${useCase.feasibility}/10`,
          margin + 3,
          y
        )
      } else if (scoringMethod === 'blended') {
        const balanced = calculateBlendedScore(useCase)
        const riskAdjusted = calculateRiskAdjustedFinancial(useCase)
        doc.text(
          `Balanced: ${balanced.toFixed(1)} | Impact: ${useCase.impact}/10 | Feasibility: ${useCase.feasibility}/10 | Risk-adj: ${formatCurrency(riskAdjusted)}/yr`,
          margin + 3,
          y
        )
      } else {
        const coi = useCase.costOfInaction?.totalAnnualCOI || 0
        const ev = useCase.expectedValue?.totalAnnualValue || 0
        const score = Math.max(coi, ev)
        doc.text(
          `Financial Impact: ${formatCurrency(score)}/yr | COI: ${formatCurrency(coi)}/yr | Value: ${formatCurrency(ev)}/yr`,
          margin + 3,
          y
        )
      }
      y += 10
    })
  }

  // ============ AI REGULATIONS & COMPLIANCE (if any use cases have regulations) ============
  const useCasesWithRegulations = useCases.filter(uc => uc.aiRegulations?.applicableFrameworks?.length)
  if (useCasesWithRegulations.length > 0) {
    doc.addPage()
    y = margin

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(80, 50, 180)
    doc.text('AI Regulatory Considerations', margin, y)
    y += 10

    // Collect unique frameworks
    const uniqueFrameworks = new Set<string>()
    useCasesWithRegulations.forEach(uc => {
      uc.aiRegulations?.applicableFrameworks?.forEach(fw => uniqueFrameworks.add(fw))
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)
    doc.text('The following regulatory frameworks may be applicable to the identified use cases:', margin, y)
    y += 8

    Array.from(uniqueFrameworks).forEach(frameworkId => {
      const policy = getPolicyById(frameworkId as any)
      if (policy) {
        addPageIfNeeded(25)
        
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(40, 40, 40)
        doc.text(`• ${policy.name}`, margin, y)
        y += 5
        
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(80, 80, 80)
        
        const statusText = `Status: ${policy.status.charAt(0).toUpperCase() + policy.status.slice(1)} | Jurisdiction: ${policy.jurisdiction.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`
        doc.text(statusText, margin + 5, y)
        y += 4
        
        const descLines = doc.splitTextToSize(policy.description, pageWidth - 2 * margin - 10)
        descLines.slice(0, 2).forEach((line: string) => {
          doc.text(line, margin + 5, y)
          y += 3.5
        })
        y += 5
      }
    })
  }

  // ============ DISCLAIMERS PAGE ============
  if (options.includeGovernance !== false && options.governanceAssessment) {
    const gov = options.governanceAssessment
    doc.addPage()
    y = margin

    // Section title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(80, 60, 150)
    doc.text('AI Governance Assessment', margin, y)
    y += 10

    // Overall maturity badge
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(60, 60, 80)
    doc.text(`Overall Maturity: ${gov.overallMaturity.toFixed(1)}/5 (${AI_GOVERNANCE_MATURITY_CONFIG[gov.overallMaturityLabel].label})`, margin, y)
    y += 8

    // Dimension scores table
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('Dimension', margin, y)
    doc.text('Level', margin + 80, y)
    doc.text('Score', margin + 130, y)
    y += 2
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 4

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 80)
    const dims = Object.keys(gov.dimensionScores) as Array<keyof typeof gov.dimensionScores>
    for (const dim of dims) {
      addPageIfNeeded(6)
      const level = gov.dimensionScores[dim]
      const config = AI_GOVERNANCE_MATURITY_CONFIG[level]
      doc.text(AI_GOVERNANCE_DIMENSION_LABELS[dim], margin, y)
      doc.text(config.label, margin + 80, y)
      doc.text(`${config.numericValue}/5`, margin + 130, y)
      y += 5
    }
    y += 5

    // Key gaps
    if (gov.gaps.length > 0) {
      addPageIfNeeded(10)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(180, 100, 50)
      doc.text(`Key Gaps (${gov.gaps.length})`, margin, y)
      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(60, 60, 80)
      for (const gap of gov.gaps.slice(0, 6)) {
        addPageIfNeeded(10)
        doc.setFont('helvetica', 'bold')
        doc.text(`${AI_GOVERNANCE_DIMENSION_LABELS[gap.dimension]} [${gap.impact} impact]`, margin + 3, y)
        y += 4
        doc.setFont('helvetica', 'normal')
        const gapLines = doc.splitTextToSize(gap.gap, pageWidth - 2 * margin - 6)
        gapLines.slice(0, 2).forEach((line: string) => {
          doc.text(line, margin + 3, y)
          y += 3.5
        })
        y += 3
      }
    }

    // Action plan overview
    if (gov.actionPlan) {
      addPageIfNeeded(15)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(80, 60, 150)
      doc.text('AI Governance Action Plan', margin, y)
      y += 6

      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 100)
      const readinessLines = doc.splitTextToSize(gov.actionPlan.overallReadinessStatement, pageWidth - 2 * margin)
      readinessLines.slice(0, 3).forEach((line: string) => {
        addPageIfNeeded(5)
        doc.text(line, margin, y)
        y += 4
      })
      y += 3

      const phases = [
        { label: 'Short-term (0-3 months)', items: gov.actionPlan.shortTerm },
        { label: 'Medium-term (3-12 months)', items: gov.actionPlan.mediumTerm },
        { label: 'Long-term (12+ months)', items: gov.actionPlan.longTerm },
      ]
      for (const phase of phases) {
        if (phase.items.length === 0) continue
        addPageIfNeeded(8)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(60, 60, 80)
        doc.text(phase.label, margin, y)
        y += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        for (const rec of phase.items.slice(0, 5)) {
          addPageIfNeeded(6)
          const bulletText = `\u2022 [${rec.priority}] ${rec.action}`
          const recLines = doc.splitTextToSize(bulletText, pageWidth - 2 * margin - 5)
          recLines.slice(0, 2).forEach((line: string) => {
            doc.text(line, margin + 3, y)
            y += 3.5
          })
          y += 1
        }
        y += 3
      }
    }

    // RAIA summary for use cases that have it
    const ucWithRAIA = useCases.filter(uc => uc.responsibleAIImpact)
    if (ucWithRAIA.length > 0) {
      addPageIfNeeded(15)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(80, 60, 150)
      doc.text('Responsible AI Impact Summary', margin, y)
      y += 7

      // Header row
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.text('Use Case', margin, y)
      doc.text('Risk', margin + 90, y)
      doc.text('People Decisions', margin + 110, y)
      doc.text('Human Oversight', margin + 145, y)
      y += 2
      doc.line(margin, y, pageWidth - margin, y)
      y += 4

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(60, 60, 80)
      for (const uc of ucWithRAIA.slice(0, 10)) {
        addPageIfNeeded(6)
        const raia = uc.responsibleAIImpact!
        const titleTrunc = uc.title.length > 40 ? uc.title.slice(0, 38) + '...' : uc.title
        doc.text(titleTrunc, margin, y)
        doc.text(raia.overallRisk, margin + 90, y)
        doc.text(raia.involvesDecisionsAboutPeople ? 'Yes' : 'No', margin + 110, y)
        doc.text(raia.humanOversightRequired ? 'Required' : 'Optional', margin + 145, y)
        y += 5
      }
    }
  }

  // ============ DISCLAIMERS PAGE ============
  if (options.includeDisclaimers !== false) {
    doc.addPage()
    y = margin

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(180, 100, 50)
    doc.text('Important Disclaimers & Legal Notices', margin, y)
    y += 12

    // General Disclaimer
    doc.setFillColor(255, 248, 240)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 35, 2, 2, 'F')
    doc.setDrawColor(200, 150, 100)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 35, 2, 2, 'S')
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(150, 80, 30)
    doc.text(DISCLAIMERS.general.title, margin + 5, y + 4)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80, 60, 40)
    const generalLines = doc.splitTextToSize(DISCLAIMERS.general.text, pageWidth - 2 * margin - 12)
    generalLines.slice(0, 4).forEach((line: string, idx: number) => {
      doc.text(line, margin + 5, y + 12 + (idx * 4))
    })
    y += 42

    // AI Generated Content Disclaimer
    addPageIfNeeded(45)
    doc.setFillColor(248, 240, 255)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 32, 2, 2, 'F')
    doc.setDrawColor(150, 100, 200)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 32, 2, 2, 'S')
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(100, 60, 150)
    doc.text(DISCLAIMERS.aiGenerated.title, margin + 5, y + 4)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80, 60, 100)
    const aiLines = doc.splitTextToSize(DISCLAIMERS.aiGenerated.text, pageWidth - 2 * margin - 12)
    aiLines.slice(0, 3).forEach((line: string, idx: number) => {
      doc.text(line, margin + 5, y + 12 + (idx * 4))
    })
    y += 40

    // Not Legal Advice
    addPageIfNeeded(35)
    doc.setFillColor(255, 245, 240)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 28, 2, 2, 'F')
    doc.setDrawColor(200, 130, 100)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 28, 2, 2, 'S')
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(180, 100, 60)
    doc.text(DISCLAIMERS.notLegalAdvice.title, margin + 5, y + 4)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 80, 60)
    const legalLines = doc.splitTextToSize(DISCLAIMERS.notLegalAdvice.text, pageWidth - 2 * margin - 12)
    legalLines.slice(0, 2).forEach((line: string, idx: number) => {
      doc.text(line, margin + 5, y + 12 + (idx * 4))
    })
    y += 35

    // Not Financial Advice
    addPageIfNeeded(35)
    doc.setFillColor(240, 255, 245)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 28, 2, 2, 'F')
    doc.setDrawColor(100, 180, 130)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 28, 2, 2, 'S')
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(60, 130, 90)
    doc.text(DISCLAIMERS.notFinancialAdvice.title, margin + 5, y + 4)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(60, 100, 80)
    const finLines = doc.splitTextToSize(DISCLAIMERS.notFinancialAdvice.text, pageWidth - 2 * margin - 12)
    finLines.slice(0, 2).forEach((line: string, idx: number) => {
      doc.text(line, margin + 5, y + 12 + (idx * 4))
    })
    y += 35

    // South Africa / Africa Region Notice
    addPageIfNeeded(45)
    doc.setFillColor(240, 248, 255)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 38, 2, 2, 'F')
    doc.setDrawColor(100, 150, 200)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 38, 2, 2, 'S')
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(60, 100, 150)
    doc.text('South Africa & Africa Region Compliance', margin + 5, y + 4)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(60, 80, 120)
    const saText = 'For deployments in South Africa and across African jurisdictions, organizations must ensure compliance with the Protection of Personal Information Act (POPIA), the African Union Continental AI Strategy, and relevant national policies. Consider data sovereignty requirements, cross-border data transfer restrictions, and local capacity building priorities.'
    const saLines = doc.splitTextToSize(saText, pageWidth - 2 * margin - 12)
    saLines.slice(0, 4).forEach((line: string, idx: number) => {
      doc.text(line, margin + 5, y + 12 + (idx * 4))
    })
    y += 45

    // Microsoft Position
    addPageIfNeeded(35)
    doc.setFillColor(245, 245, 250)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 30, 2, 2, 'F')
    doc.setDrawColor(150, 150, 170)
    doc.roundedRect(margin, y - 3, pageWidth - 2 * margin, 30, 2, 2, 'S')
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(80, 80, 100)
    doc.text(DISCLAIMERS.microsoftPosition.title, margin + 5, y + 4)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 100)
    const msLines = doc.splitTextToSize(DISCLAIMERS.microsoftPosition.text, pageWidth - 2 * margin - 12)
    msLines.slice(0, 3).forEach((line: string, idx: number) => {
      doc.text(line, margin + 5, y + 12 + (idx * 4))
    })
  }

  // ============ ADD PAGE NUMBERS TO ALL PAGES ============
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' })
    doc.text('Microsoft Innovation Hub - Confidential', margin, pageHeight - 10)
    doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 10, { align: 'right' })
  }

  const customerSlug = (options.customerMetadata?.customerName || 'assessment').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30)
  const fileName = `ID-8-${customerSlug}-${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

// ============================================================================
// ACCOUNT TECHNOLOGY PLAN EXPORT (ATS-specific)
// ============================================================================

import type { Account, Workload, DiscoverySession as DiscSession } from './types'
import { SOLUTION_AREA_LABELS, WORKLOAD_TYPE_LABELS, ACCOUNT_TEAM_ROLE_LABELS } from './types'

export interface AccountTechPlanExportOptions {
  account: Account
  sessions: DiscSession[]
  useCases: UseCase[]
  workloads: Workload[]
  totalEstimatedConsumption: number
  maccOnTrack?: boolean
}

export function exportAccountTechPlanToPDF(opts: AccountTechPlanExportOptions): void {
  const { account, sessions, useCases, workloads, totalEstimatedConsumption, maccOnTrack } = opts
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setProperties({ creator: 'ID-8', title: 'ID-8 Account Technology Plan' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  let y = 0

  const checkNewPage = (needed: number = 30) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage()
      y = margin
    }
  }

  // ───── Cover Page ─────
  doc.setFillColor(0, 120, 212)
  doc.rect(0, 0, pageWidth, 100, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.text('Account Technology Plan', margin, 40)
  doc.setFontSize(16)
  doc.text(account.name, margin, 55)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`${account.fiscalYear || 'FY26'} ${account.fiscalQuarter || ''}`.trim(), margin, 70)
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 80)
  doc.setTextColor(0, 0, 0)

  // ───── Account Overview ─────
  y = 115
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Account Overview', margin, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const overviewLines = [
    `Account: ${account.name}`,
    `Segment: ${account.accountSegment}`,
    `Health: ${account.healthRating}`,
    `Sessions: ${sessions.length}  |  Use Cases: ${useCases.length}  |  Workloads: ${workloads.length}`,
    `Estimated Monthly Consumption: ${formatCurrency(totalEstimatedConsumption)}`,
  ]
  overviewLines.forEach((line) => {
    doc.text(line, margin, y)
    y += 6
  })

  // Team
  if (account.team.length > 0) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.text('Account Team:', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    account.team.forEach((m) => {
      doc.text(`  ${m.name} — ${ACCOUNT_TEAM_ROLE_LABELS[m.role]}`, margin, y)
      y += 5
    })
  }

  // ───── MACC Tracking ─────
  if (account.maccCommitment) {
    checkNewPage(50)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('MACC Commitment', margin, y)
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const m = account.maccCommitment
    const consumed = m.totalAmount - m.remainingBalance
    const pct = Math.round((consumed / m.totalAmount) * 100)
    doc.text(`Total: ${formatCurrency(m.totalAmount)}  |  Remaining: ${formatCurrency(m.remainingBalance)}  |  Consumed: ${pct}%`, margin, y)
    y += 6
    doc.text(`Current ACR: ${formatCurrency(m.currentACR)}/mo  |  Status: ${maccOnTrack ? 'On Track' : 'At Risk'}`, margin, y)
    y += 6
    doc.text(`Period: ${new Date(m.startDate).toLocaleDateString()} – ${new Date(m.endDate).toLocaleDateString()}`, margin, y)
    y += 6
  }

  // ───── Workload Portfolio ─────
  if (workloads.length > 0) {
    doc.addPage()
    y = margin
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Workload Portfolio', margin, y)
    y += 10

    workloads.forEach((w, idx) => {
      checkNewPage(40)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`${idx + 1}. ${w.name}`, margin, y)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Type: ${WORKLOAD_TYPE_LABELS[w.type]}  |  Area: ${SOLUTION_AREA_LABELS[w.solutionArea]}  |  Priority: ${w.priority}`, margin + 4, y)
      y += 5
      doc.text(`Readiness: ${w.migrationReadiness}%  |  Status: ${w.status}`, margin + 4, y)
      y += 5
      if (w.sourceSystem) {
        doc.text(`Source: ${w.sourceSystem}`, margin + 4, y)
        y += 5
      }
      if (w.targetServices.length > 0) {
        doc.text(`Target: ${w.targetServices.join(', ')}`, margin + 4, y)
        y += 5
      }
      if (w.consumptionEstimate) {
        doc.text(`Est. Consumption: ${formatCurrency(w.consumptionEstimate.estimatedMonthly)}/mo`, margin + 4, y)
        y += 5
      }
      if (w.blockers.length > 0) {
        doc.text(`Blockers: ${w.blockers.join('; ')}`, margin + 4, y)
        y += 5
      }
      if (w.competitors.length > 0) {
        const compStr = w.competitors.map((c) => `${c.platform} (${c.currentPosition})`).join(', ')
        doc.text(`Competitors: ${compStr}`, margin + 4, y)
        y += 5
      }
      y += 4
    })
  }

  // ───── Use Case Portfolio ─────
  if (useCases.length > 0) {
    doc.addPage()
    y = margin
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Use Case Portfolio', margin, y)
    y += 10

    useCases.forEach((uc, idx) => {
      checkNewPage(30)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`${idx + 1}. ${uc.title}`, margin, y)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const descLines = doc.splitTextToSize(uc.description, pageWidth - 2 * margin - 8)
      descLines.slice(0, 2).forEach((line: string) => {
        doc.text(line, margin + 4, y)
        y += 4.5
      })
      if (uc.consumptionEstimate) {
        doc.text(`Est. Consumption: ${formatCurrency(uc.consumptionEstimate.estimatedMonthly)}/mo`, margin + 4, y)
        y += 5
      }
      y += 3
    })
  }

  // ───── Technology Plan Summary ─────
  if (account.technologyPlanSummary) {
    doc.addPage()
    y = margin
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Technology Strategy', margin, y)
    y += 10
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const planLines = doc.splitTextToSize(account.technologyPlanSummary, pageWidth - 2 * margin)
    planLines.forEach((line: string) => {
      checkNewPage()
      doc.text(line, margin, y)
      y += 5
    })
  }

  // ───── Next 90-Day Action Plan ─────
  checkNewPage(40)
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Next 90-Day Actions', margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const actions = [
    workloads.filter((w) => w.priority === 'critical').length > 0 ? `[Critical] ${workloads.filter((w) => w.priority === 'critical').length} critical workloads require immediate attention` : null,
    account.maccCommitment && !maccOnTrack ? '[MACC] Consumption is behind schedule — review acceleration levers' : null,
    workloads.filter((w) => w.endOfSupportDate).length > 0 ? `[EOS] ${workloads.filter((w) => w.endOfSupportDate).length} workloads have end-of-support deadlines` : null,
    sessions.length > 0 ? `[Discovery] ${sessions.length} discovery session(s) completed — review use case pipeline` : null,
    useCases.length > 0 ? `[Use Cases] ${useCases.length} use cases identified — prioritize for implementation` : null,
  ].filter(Boolean) as string[]

  if (actions.length === 0) actions.push('No critical actions identified. Schedule next QBR to review progress.')
  actions.forEach((a) => {
    checkNewPage()
    doc.text(`• ${a}`, margin, y)
    y += 5
  })

  // ───── Footer on all pages ─────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' })
    doc.text('Account Technology Plan - Confidential', margin, pageHeight - 10)
    doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 10, { align: 'right' })
  }

  const slug = account.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30)
  doc.save(`ID-8-account-tech-plan-${slug}-${new Date().toISOString().split('T')[0]}.pdf`)
}
