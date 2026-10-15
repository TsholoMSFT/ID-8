/**
 * Apps That Matter (ATM) Qualification Scoring Engine
 * 
 * Quantifies Microsoft's FY26 ATM qualitative checklist into a data-driven,
 * repeatable score using data fields ID-8 already captures.
 * 
 * ATM defines qualifying opportunities through 5 attributes:
 * 1. Business Impact   — "Solves real business problems with measurable value"
 * 2. Innovation/Agentic — "Leverages agentic technologies and real-time data"
 * 3. Enterprise-Grade  — "Production-ready, governed, secure, continuously optimized"
 * 4. Multi-Pillar      — "Spanning AI (Foundry) + Apps + Data pillars"
 * 5. Repeatability     — "Built on proven blueprints and solution patterns"
 * 
 * IMPORTANT: This is ID-8's quantified interpretation. The official ATM
 * criteria are qualitative (pass/fail). This model provides numerical assessment
 * to help systematically strengthen opportunities before pipeline tagging.
 * 
 * Transparency principles:
 * - Every point maps back to a specific data field
 * - "Low because weak" vs "low because not assessed" are distinguished
 * - Scores normalise against assessed components only
 * - Gap recommendations are specific and actionable
 */

import type {
  UseCase,
  DiscoverySession,
  ATMScore,
  ATMDimensionScore,
  ATMComponentScore,
  ATMComponentStatus,
  ATMGapRecommendation,
  ATMTier,
  ATMPillar,
  ATMDimension,
  MicrosoftProductFamily,
  CAFCapability,
  CAFMaturityLevel,
} from './types'
import { REFERENCE_ARCHITECTURES, type ReferenceArchitecturePattern } from './microsoft-solutions'
import { calculateRICEScore } from './scoring'

// ============================================================================
// DIMENSION WEIGHTS (sum to 1.0)
// ============================================================================

const DIMENSION_WEIGHTS: Record<ATMDimension, number> = {
  'business-impact': 0.25,
  'innovation-agentic': 0.25,
  'enterprise-grade': 0.20,
  'multi-pillar': 0.15,
  'repeatability': 0.15,
}

// ============================================================================
// PILLAR MAPPING
// ============================================================================

const PILLAR_MAP: Record<MicrosoftProductFamily, ATMPillar | null> = {
  'azure-ai': 'ai',
  'azure-data': 'data',
  'azure-infrastructure': 'apps',
  'power-platform': 'apps',
  'microsoft-365': 'apps',
  'dynamics-365': 'apps',
  'microsoft-fabric': 'data',
  'microsoft-security': null,   // Cross-cutting, contributes to Enterprise-Grade
}

export function mapProductFamilyToPillar(family: MicrosoftProductFamily): ATMPillar | null {
  return PILLAR_MAP[family] ?? null
}

export function getPillarsCovered(useCase: UseCase): ATMPillar[] {
  const pillars = new Set<ATMPillar>()
  if (useCase.microsoftSolutions) {
    for (const sol of useCase.microsoftSolutions) {
      const pillar = mapProductFamilyToPillar(sol.productFamily)
      if (pillar) pillars.add(pillar)
    }
  }
  return Array.from(pillars)
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Calculate the complete ATM qualification score for a use case.
 * 
 * @param useCase - The use case to score
 * @param session - Optional session context (for readiness assessment data)
 * @returns ATMScore with full transparency breakdown
 */
export function calculateATMScore(
  useCase: UseCase,
  session?: DiscoverySession | null,
): ATMScore {
  const dimensions: ATMDimensionScore[] = [
    scoreBusinessImpact(useCase),
    scoreInnovationAgentic(useCase),
    scoreEnterpriseGrade(useCase, session),
    scoreMultiPillar(useCase),
    scoreRepeatability(useCase, session),
  ]

  // Confidence = % of components that have data
  const totalComponents = dimensions.reduce((sum, d) => sum + d.componentsTotal, 0)
  const assessedComponents = dimensions.reduce((sum, d) => sum + d.componentsAssessed, 0)
  const confidence = totalComponents > 0 ? Math.round((assessedComponents / totalComponents) * 100) : 0

  // Composite score = weighted average of dimension scores
  const compositeScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.rawScore * d.weight, 0)
  )

  // Determine tier (with confidence gate)
  const tier = determineTier(compositeScore, confidence)

  // Pillar coverage
  const pillarsCovered = getPillarsCovered(useCase)

  // Gap recommendations — gather from all dimensions, sort by impact
  const gapRecommendations = generateGapRecommendations(dimensions)

  return {
    compositeScore,
    tier,
    confidence,
    dimensions,
    pillarsCovered,
    gapRecommendations,
    calculatedAt: Date.now(),
  }
}

function determineTier(score: number, confidence: number): ATMTier {
  if (confidence < 50) return 'insufficient-data'
  if (score >= 80) return 'platinum'
  if (score >= 60) return 'gold'
  if (score >= 40) return 'silver'
  return 'not-qualified'
}

// ============================================================================
// DIMENSION 1: BUSINESS IMPACT (0-100)
// ============================================================================

function scoreBusinessImpact(useCase: UseCase): ATMDimensionScore {
  const components: ATMComponentScore[] = []

  // 1. Strategic Alignment (max 20)
  {
    const alignment = useCase.strategicAlignment
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    if (alignment?.alignmentScore != null) {
      status = 'scored'
      points = Math.min(alignment.alignmentScore * 2, 20)
      sourceFields.push('strategicAlignment.alignmentScore')
      explanation = `Alignment score ${alignment.alignmentScore}/10 → ${points} points`
      if (alignment.primaryPriority) {
        explanation += `. Linked to: "${alignment.primaryPriority}"`
        sourceFields.push('strategicAlignment.primaryPriority')
      }
    } else {
      recommendation = 'Link this use case to a strategic priority to gain up to 20 points'
      explanation = 'No strategic alignment data provided'
    }

    components.push({ name: 'Strategic Alignment', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 2. Financial Quantification (max 30)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    const sourceFields: string[] = []
    let explanation = ''
    let recommendation: string | undefined

    const coi = useCase.costOfInaction?.totalAnnualCOI
    const ev = useCase.expectedValue?.totalAnnualValue

    if (coi != null || ev != null) {
      status = (coi != null && ev != null) ? 'scored' : 'partial'
      let coiPts = 0
      if (coi != null) {
        sourceFields.push('costOfInaction.totalAnnualCOI')
        if (coi >= 1_000_000) coiPts = 15
        else if (coi >= 500_000) coiPts = 10
        else if (coi >= 100_000) coiPts = 5
        else coiPts = 2
      }
      let evPts = 0
      if (ev != null) {
        sourceFields.push('expectedValue.totalAnnualValue')
        if (ev >= 1_000_000) evPts = 15
        else if (ev >= 500_000) evPts = 10
        else if (ev >= 100_000) evPts = 5
        else evPts = 2
      }
      points = Math.min(coiPts + evPts, 30)
      explanation = `COI: ${coi != null ? formatCurrency(coi) : 'N/A'} (${coiPts}pts), Expected Value: ${ev != null ? formatCurrency(ev) : 'N/A'} (${evPts}pts)`

      if (coi == null) recommendation = 'Add Cost of Inaction estimate to gain up to 15 more points'
      else if (ev == null) recommendation = 'Add Expected Value estimate to gain up to 15 more points'
    } else {
      explanation = 'No financial quantification provided'
      recommendation = 'Estimate COI and Expected Value to gain up to 30 points'
    }

    components.push({ name: 'Financial Quantification', maxPoints: 30, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 3. Impact × Feasibility (max 15)
  {
    const product = useCase.impact * useCase.feasibility
    const points = Math.round((product / 100) * 15 * 10) / 10   // round to 1 decimal
    const status: ATMComponentStatus = 'scored' // Always has data (required fields)
    const explanation = `Impact ${useCase.impact} × Feasibility ${useCase.feasibility} = ${product} → ${points.toFixed(1)} points`
    const sourceFields = ['impact', 'feasibility']
    const recommendation = product < 50 ? 'Consider how to increase impact or feasibility ratings' : undefined

    components.push({ name: 'Impact × Feasibility', maxPoints: 15, earnedPoints: Math.min(points, 15), status, explanation, sourceFields, recommendation })
  }

  // 4. RICE Score (max 15)
  {
    const rice = calculateRICEScore(useCase)
    // Normalise RICE to 0-15 using log scale (RICE values vary widely)
    // Calibrated: RICE 5 → ~7pts, RICE 20 → ~11pts, RICE 50+ → 15pts
    const normalisedPoints = rice > 0 ? Math.min(Math.round(Math.log10(rice + 1) * 8.8), 15) : 0
    const status: ATMComponentStatus = 'scored'
    const explanation = `RICE ${rice.toFixed(1)} (Reach: ${useCase.rice.reach}, Impact: ${useCase.rice.impact}, Confidence: ${useCase.rice.confidence}%, Effort: ${useCase.rice.effort}) → ${normalisedPoints} points`
    const sourceFields = ['rice.reach', 'rice.impact', 'rice.confidence', 'rice.effort']

    components.push({ name: 'RICE Score', maxPoints: 15, earnedPoints: normalisedPoints, status, explanation, sourceFields })
  }

  // 5. KPI Definition (max 10)
  {
    const kpiCount = useCase.kpis?.length ?? 0
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    let recommendation: string | undefined
    const sourceFields: string[] = []

    if (kpiCount > 0) {
      status = 'scored'
      sourceFields.push('kpis')
      if (kpiCount >= 3) points = 10
      else if (kpiCount === 2) points = 7
      else points = 4
      explanation = `${kpiCount} KPI${kpiCount !== 1 ? 's' : ''} defined → ${points} points`
      if (kpiCount < 3) recommendation = `Add ${3 - kpiCount} more KPI${3 - kpiCount !== 1 ? 's' : ''} to reach full 10 points`
    } else {
      explanation = 'No KPIs defined'
      recommendation = 'Define at least 3 KPIs to gain up to 10 points'
    }

    components.push({ name: 'KPI Definition', maxPoints: 10, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 6. Data Grounding (max 10)
  {
    const sources = useCase.dataSources ?? []
    const hasEarnings = sources.includes('earnings') || sources.includes('financials')
    const hasResearch = sources.includes('news') || sources.includes('industry-research')
    const hasDiscovery = sources.includes('discovery') || sources.includes('manual')
    const sourceCount = new Set(sources).size
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    if (sourceCount > 0) {
      status = 'scored'
      sourceFields.push('dataSources')
      if (hasEarnings) { points += 5; explanation += 'Earnings/financial grounding (+5). ' }
      if (hasResearch) { points += 3; explanation += 'News/industry research (+3). ' }
      if (hasDiscovery) { points += 2; explanation += 'Discovery session data (+2). ' }
      if (sourceCount === 1 && sources[0] === 'ai-generated') { points = 2; explanation = 'AI-generated only (2pts — add real data for more)' }
      points = Math.min(points, 10)
      if (useCase.earningsContext?.length) {
        sourceFields.push('earningsContext')
      }
      if (!hasEarnings) recommendation = 'Add company research / earnings data for stronger grounding'
    } else {
      explanation = 'No data sources recorded'
      recommendation = 'Ground use case in company research, earnings, or discovery data to gain up to 10 points'
    }

    components.push({ name: 'Data Grounding', maxPoints: 10, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  return buildDimensionScore('business-impact', 'Business Impact', components)
}

// ============================================================================
// DIMENSION 2: INNOVATION & AGENTIC (0-100)
// ============================================================================

function scoreInnovationAgentic(useCase: UseCase): ATMDimensionScore {
  const components: ATMComponentScore[] = []
  const agents = useCase.agenticOpportunities ?? []

  // 1. Agentic Opportunity Defined (max 20)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    if (agents.length > 0) {
      status = 'scored'
      points = agents.length >= 2 ? 20 : 15
      sourceFields.push('agenticOpportunities')
      const names = agents.map(a => a.title).join(', ')
      explanation = `${agents.length} agent${agents.length !== 1 ? 's' : ''} defined: ${names} → ${points} points`
    } else {
      explanation = 'No agentic opportunities identified'
      recommendation = 'Identify at least one AI agent opportunity to gain up to 20 points'
    }

    components.push({ name: 'Agentic Opportunity Defined', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 2. Agent Sophistication (max 25)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    if (agents.length > 0) {
      status = 'scored'
      // Use the most sophisticated agent
      const bestAgent = agents.reduce((best, a) => {
        const typeScore = agentTypeScore(a.agentType)
        const bestTypeScore = agentTypeScore(best.agentType)
        return typeScore > bestTypeScore ? a : best
      }, agents[0])

      const typePoints = agentTypeScore(bestAgent.agentType)
      const capabilityPoints = Math.min(Math.round(bestAgent.capabilities.length * 2.14), 15)
      points = Math.min(typePoints + capabilityPoints, 25)
      sourceFields.push('agenticOpportunities[].agentType', 'agenticOpportunities[].capabilities')
      explanation = `${bestAgent.agentType} (${typePoints}pts) + ${bestAgent.capabilities.length} capabilities (${capabilityPoints}pts) = ${points}`
      if (bestAgent.capabilities.length < 5) recommendation = 'Add more agent capabilities (reasoning, planning, tool-use) to increase sophistication score'
    } else {
      explanation = 'No agents defined — sophistication cannot be assessed'
      recommendation = 'Define an agentic opportunity with capabilities to enable scoring'
    }

    components.push({ name: 'Agent Sophistication', maxPoints: 25, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 3. Automation Level (max 20)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    if (agents.length > 0) {
      status = 'scored'
      const bestAgent = agents.reduce((best, a) => {
        return automationScore(a.automationLevel) > automationScore(best.automationLevel) ? a : best
      }, agents[0])

      const autoPoints = automationScore(bestAgent.automationLevel)
      const oversightPenalty = oversightDeduction(bestAgent.humanOversight)
      points = Math.max(autoPoints - oversightPenalty, 0)
      sourceFields.push('agenticOpportunities[].automationLevel', 'agenticOpportunities[].humanOversight')
      explanation = `${bestAgent.automationLevel} (${autoPoints}pts) − ${bestAgent.humanOversight} oversight (${oversightPenalty}pts) = ${points}`
    } else {
      explanation = 'No agents defined — automation level cannot be assessed'
      recommendation = 'Define an agent with automation level to enable scoring'
    }

    components.push({ name: 'Automation Level', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 4. Reference Architecture (max 15)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    if (useCase.referenceArchitecture) {
      status = 'scored'
      sourceFields.push('referenceArchitecture')
      const archInfo = REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern]
      if (useCase.referenceArchitecture === 'agentic-ai') {
        points = 15
        explanation = 'Agentic AI reference architecture → 15 points (maximum)'
      } else if (archInfo) {
        if (archInfo.agenticPotential === 'high') { points = 10; explanation = `${archInfo.label} (high agentic potential) → 10 points` }
        else if (archInfo.agenticPotential === 'medium') { points = 6; explanation = `${archInfo.label} (medium agentic potential) → 6 points` }
        else { points = 3; explanation = `${archInfo.label} (low agentic potential) → 3 points` }
      } else {
        points = 3
        explanation = `Custom architecture "${useCase.referenceArchitecture}" → 3 points`
      }
    } else {
      explanation = 'No reference architecture selected'
      recommendation = 'Select a reference architecture (especially agentic-ai) to gain up to 15 points'
    }

    components.push({ name: 'Reference Architecture', maxPoints: 15, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 5. Process AI Opportunities (max 20)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const processes = useCase.businessProcesses ?? []
    if (processes.length > 0) {
      status = 'scored'
      sourceFields.push('businessProcesses')
      // Count processes with pain points that have AI opportunity
      const aiProcesses = processes.filter(p => p.currentPainPoints && p.currentPainPoints.length > 0)
      const processPoints = Math.min(aiProcesses.length * 5, 10)
      const improvementPoints = Math.min(processes.filter(p => p.expectedCycleTimeReduction).length * 5, 10)
      points = Math.min(processPoints + improvementPoints, 20)
      explanation = `${aiProcesses.length} processes with AI pain points (${processPoints}pts) + ${processes.filter(p => p.expectedCycleTimeReduction).length} with cycle time targets (${improvementPoints}pts)`
      if (points < 20) recommendation = 'Map more business processes with AI opportunities and cycle time targets'
    } else {
      explanation = 'No business processes mapped'
      recommendation = 'Map business processes with AI opportunities to gain up to 20 points'
    }

    components.push({ name: 'Process AI Opportunities', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 6. Interop & Orchestration (max 15)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const agents = useCase.agenticOpportunities ?? []
    const withInterop = agents.filter(a => a.interopProtocols && a.interopProtocols.length > 0)
    const withOrchestration = agents.filter(a => a.orchestrationPattern)

    if (withInterop.length > 0 || withOrchestration.length > 0) {
      status = 'scored'
      // Interop protocols: MCP/A2A are highest value
      const allProtocols = new Set(withInterop.flatMap(a => a.interopProtocols ?? []))
      let interopPts = 0
      if (allProtocols.has('mcp') || allProtocols.has('a2a')) interopPts = 8
      else if (allProtocols.size >= 2) interopPts = 5
      else if (allProtocols.size === 1) interopPts = 3
      if (withInterop.length > 0) sourceFields.push('agenticOpportunities[].interopProtocols')

      // Orchestration pattern
      let orchPts = 0
      if (withOrchestration.length > 0) {
        sourceFields.push('agenticOpportunities[].orchestrationPattern')
        const patterns = new Set(withOrchestration.map(a => a.orchestrationPattern))
        orchPts = patterns.size >= 2 ? 7 : 4
      }

      points = Math.min(interopPts + orchPts, 15)
      explanation = `Protocols: ${[...allProtocols].join(', ') || 'none'} (${interopPts}pts) + ${withOrchestration.length} orchestration pattern${withOrchestration.length !== 1 ? 's' : ''} (${orchPts}pts)`
      if (!allProtocols.has('mcp')) recommendation = 'Add MCP protocol support for cutting-edge agent interoperability'
    } else if (agents.length > 0) {
      status = 'partial'
      explanation = 'Agents defined but no interop protocols or orchestration patterns specified'
      recommendation = 'Add interop protocols (MCP, A2A) and orchestration patterns to agentic opportunities'
    } else {
      explanation = 'No agentic opportunities — cannot assess interop'
    }

    components.push({ name: 'Interop & Orchestration', maxPoints: 15, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  return buildDimensionScore('innovation-agentic', 'Innovation & Agentic', components)
}

// ============================================================================
// DIMENSION 3: ENTERPRISE-GRADE (0-100)
// ============================================================================

function scoreEnterpriseGrade(useCase: UseCase, session?: DiscoverySession | null): ATMDimensionScore {
  const components: ATMComponentScore[] = []

  // 1. Regulatory Assessment (max 25)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const reg = useCase.regulatoryAssessment
    if (reg) {
      status = 'scored'
      sourceFields.push('regulatoryAssessment.gateStatus', 'regulatoryAssessment.frameworkAssessments')
      
      if (reg.gateStatus === 'clear') {
        points = 25
        explanation = `Gate status: clear — ${reg.frameworkAssessments.length} frameworks assessed → 25 points`
      } else if (reg.gateStatus === 'warning') {
        const ackCount = reg.remediations.filter(r => r.acknowledged).length
        const totalRemediations = reg.remediations.length
        if (ackCount === totalRemediations && totalRemediations > 0) {
          points = 18
          explanation = `Gate status: warning — all ${ackCount} remediations acknowledged → 18 points`
        } else {
          points = 10
          explanation = `Gate status: warning — ${ackCount}/${totalRemediations} remediations acknowledged → 10 points`
          recommendation = `Acknowledge ${totalRemediations - ackCount} outstanding remediation${totalRemediations - ackCount !== 1 ? 's' : ''} to gain +8 points`
        }
      } else {
        points = 0
        explanation = `Gate status: blocked — compliance issues must be resolved`
        recommendation = 'Resolve blocking compliance issues before this opportunity can qualify'
      }
    } else {
      explanation = 'No regulatory assessment performed'
      recommendation = 'Complete the regulatory assessment to gain up to 25 points'
    }

    components.push({ name: 'Regulatory Assessment', maxPoints: 25, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 2. Security Posture (max 20)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const cyber = useCase.cybersecurity
    if (cyber) {
      status = 'scored'
      sourceFields.push('cybersecurity.securityRequirements')
      const reqCount = cyber.securityRequirements?.length ?? 0
      const reqPoints = Math.round((reqCount / 13) * 15)
      let classPoints = 0
      if (cyber.dataClassification) {
        sourceFields.push('cybersecurity.dataClassification')
        const sensitiveTypes: string[] = ['highly-confidential', 'phi', 'financial', 'pii']
        classPoints = sensitiveTypes.includes(cyber.dataClassification) ? 5 : 3
      }
      points = Math.min(reqPoints + classPoints, 20)
      explanation = `${reqCount}/13 security requirements (${reqPoints}pts) + data classification: ${cyber.dataClassification || 'N/A'} (${classPoints}pts)`
      if (reqCount < 8) recommendation = 'Define more security requirements to strengthen posture score'
    } else {
      explanation = 'No cybersecurity information provided'
      recommendation = 'Define security requirements and data classification to gain up to 20 points'
    }

    components.push({ name: 'Security Posture', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 3. Risk Management (max 20)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const risks = useCase.implementationComplexity?.keyRisks ?? []
    const remediations = useCase.regulatoryAssessment?.remediations ?? []
    
    if (risks.length > 0 || remediations.length > 0) {
      status = 'scored'
      // Risks identified
      let riskPoints = 0
      if (risks.length >= 5) riskPoints = 12
      else if (risks.length >= 3) riskPoints = 8
      else if (risks.length >= 1) riskPoints = 4
      sourceFields.push('implementationComplexity.keyRisks')
      
      // Mitigations acknowledged
      const ackCount = remediations.filter(r => r.acknowledged).length
      const mitigationPoints = remediations.length > 0 ? Math.round((ackCount / remediations.length) * 8) : 0
      if (remediations.length > 0) sourceFields.push('regulatoryAssessment.remediations')
      
      points = Math.min(riskPoints + mitigationPoints, 20)
      explanation = `${risks.length} risks identified (${riskPoints}pts) + ${ackCount}/${remediations.length} mitigations acknowledged (${mitigationPoints}pts)`
      if (risks.length < 3) recommendation = 'Identify more implementation risks for a thorough risk assessment'
    } else {
      explanation = 'No implementation risks or mitigations documented'
      recommendation = 'Identify implementation risks to gain up to 20 points'
    }

    components.push({ name: 'Risk Management', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 4. Implementation Readiness (max 20)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const complexity = useCase.implementationComplexity
    if (complexity) {
      status = 'scored'
      points = 10  // Base points for having assessed complexity at all
      sourceFields.push('implementationComplexity.level')
      explanation = `Complexity assessed: ${complexity.level} (10pts base)`
      
      if (complexity.estimatedDuration) {
        points += 5
        sourceFields.push('implementationComplexity.estimatedDuration')
        explanation += ` + duration: ${complexity.estimatedDuration} (+5pts)`
      }
      if (complexity.estimatedTeamSize) {
        points += 5
        sourceFields.push('implementationComplexity.estimatedTeamSize')
        explanation += ` + team: ${complexity.estimatedTeamSize} (+5pts)`
      }
      points = Math.min(points, 20)
      
      if (!complexity.estimatedDuration) recommendation = 'Add estimated duration to gain +5 points'
      else if (!complexity.estimatedTeamSize) recommendation = 'Add estimated team size to gain +5 points'
    } else {
      explanation = 'No implementation complexity assessment'
      recommendation = 'Assess implementation complexity to gain up to 20 points — rewards planning, not simplicity'
    }

    components.push({ name: 'Implementation Readiness', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 5. Customer Maturity (max 15)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const currentState = session?.businessEnvisioning?.currentState
    if (currentState) {
      status = 'scored'
      // Cloud readiness
      const cloudScores: Record<string, number> = { 'cloud-native': 15, 'cloud-first': 11, 'hybrid': 7, 'on-premises': 3 }
      let cloudPoints = cloudScores[currentState.infrastructure.cloudReadiness] ?? 3
      sourceFields.push('businessEnvisioning.currentState.infrastructure.cloudReadiness')
      explanation = `Cloud: ${currentState.infrastructure.cloudReadiness} (${cloudPoints}pts)`

      // Data maturity bonus
      const dataBonus: Record<string, number> = { 'ai-ready': 3, 'governed': 2, 'integrated': 1, 'siloed': 0 }
      const dPts = dataBonus[currentState.data.maturity] ?? 0
      if (dPts > 0) {
        sourceFields.push('businessEnvisioning.currentState.data.maturity')
        explanation += ` + data: ${currentState.data.maturity} (+${dPts})`
      }

      // AI governance bonus
      if (currentState.aiMaturity.aiGovernance) {
        sourceFields.push('businessEnvisioning.currentState.aiMaturity.aiGovernance')
        explanation += ' + AI governance in place (+2)'
        cloudPoints += 2
      }

      points = Math.min(cloudPoints + dPts, 15)
    } else {
      explanation = 'No current state assessment available (session-level data)'
      recommendation = 'Complete the current state assessment in Business Envisioning to gain up to 15 points'
    }

    components.push({ name: 'Customer Maturity', maxPoints: 15, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 6. Landing Zone Readiness (max 20)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const lz = session?.businessEnvisioning?.currentState?.landingZone
    if (lz) {
      status = 'scored'
      sourceFields.push('businessEnvisioning.currentState.landingZone')
      if (lz.hasAILandingZone) points += 5
      if (lz.eslzCompliant) points += 4
      if (lz.privateEndpoints) points += 3
      if (lz.networkModel === 'hub-spoke' || lz.networkModel === 'vwan') points += 3
      else if (lz.networkModel) points += 1
      if (lz.environmentSeparation) points += 3
      if (lz.managementGroups) points += 2
      points = Math.min(points, 20)
      const checks = [
        lz.hasAILandingZone ? 'AI LZ' : null,
        lz.eslzCompliant ? 'ESLZ' : null,
        lz.privateEndpoints ? 'PE' : null,
        lz.networkModel,
        lz.environmentSeparation ? 'env-sep' : null,
        lz.managementGroups ? 'mgmt-groups' : null,
      ].filter(Boolean)
      explanation = `Landing zone: ${checks.join(', ')} → ${points} points`
      if (!lz.hasAILandingZone) recommendation = 'Deploy an AI Landing Zone to gain +5 points'
      else if (!lz.eslzCompliant) recommendation = 'Align to Enterprise-Scale Landing Zone for +4 points'
    } else {
      explanation = 'No landing zone assessment provided (session-level data)'
      recommendation = 'Complete the Landing Zone readiness assessment to gain up to 20 points'
    }

    components.push({ name: 'Landing Zone Readiness', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 7. WAF Assessment (max 15)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const waf = session?.businessEnvisioning?.currentState?.wafAssessment
    if (waf && waf.length > 0) {
      status = 'scored'
      sourceFields.push('businessEnvisioning.currentState.wafAssessment')
      const avgScore = Math.round(waf.reduce((sum, p) => sum + p.score, 0) / waf.length)
      // Scale: avg 80+ → 15pts, 60-79 → 10, 40-59 → 6, <40 → 3
      if (avgScore >= 80) points = 15
      else if (avgScore >= 60) points = 10
      else if (avgScore >= 40) points = 6
      else points = 3
      explanation = `WAF: ${waf.length} pillars assessed, avg score ${avgScore}% → ${points} points`
      const weak = waf.filter(p => p.score < 60)
      if (weak.length > 0) recommendation = `Improve WAF pillar${weak.length > 1 ? 's' : ''}: ${weak.map(p => p.pillar).join(', ')}  (score < 60%)`
    } else {
      explanation = 'No Well-Architected Framework assessment provided'
      recommendation = 'Complete a WAF assessment to gain up to 15 points'
    }

    components.push({ name: 'WAF Assessment', maxPoints: 15, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  return buildDimensionScore('enterprise-grade', 'Enterprise-Grade', components)
}

// ============================================================================
// DIMENSION 4: MULTI-PILLAR (0-100)
// ============================================================================

function scoreMultiPillar(useCase: UseCase): ATMDimensionScore {
  const components: ATMComponentScore[] = []
  const solutions = useCase.microsoftSolutions ?? []

  // 1. Pillar Coverage (max 50)
  {
    const pillars = getPillarsCovered(useCase)
    let points = 0
    let status: ATMComponentStatus = solutions.length > 0 ? 'scored' : 'not-assessed'
    const sourceFields = solutions.length > 0 ? ['microsoftSolutions[].productFamily'] : []
    let explanation = ''
    let recommendation: string | undefined

    if (pillars.length === 3) {
      points = 50
      explanation = `All 3 pillars covered: AI ✓, Apps ✓, Data ✓ → 50 points`
    } else if (pillars.length === 2) {
      points = 30
      const missing = (['ai', 'apps', 'data'] as ATMPillar[]).filter(p => !pillars.includes(p))
      explanation = `2/3 pillars: ${pillars.join(', ')} → 30 points`
      recommendation = `Add a ${missing[0].toUpperCase()} pillar service to gain +20 points`
    } else if (pillars.length === 1) {
      points = 15
      explanation = `1/3 pillars: ${pillars[0]} → 15 points`
      const missing = (['ai', 'apps', 'data'] as ATMPillar[]).filter(p => !pillars.includes(p))
      recommendation = `Add ${missing.map(p => p.toUpperCase()).join(' and ')} pillar services to significantly increase score`
    } else {
      explanation = 'No Microsoft solutions mapped'
      recommendation = 'Map Microsoft solutions to enable multi-pillar scoring'
    }

    components.push({ name: 'Pillar Coverage', maxPoints: 50, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 2. Service Depth (max 30)
  {
    const allServices = new Set<string>()
    solutions.forEach(s => s.services.forEach(svc => allServices.add(svc)))
    const count = allServices.size
    let points = 0
    let status: ATMComponentStatus = count > 0 ? 'scored' : 'not-assessed'
    const sourceFields = count > 0 ? ['microsoftSolutions[].services'] : []
    let explanation = ''
    let recommendation: string | undefined

    if (count >= 8) points = 30
    else if (count >= 6) points = 22
    else if (count >= 4) points = 15
    else if (count >= 2) points = 8
    else if (count === 1) points = 3
    
    if (count > 0) {
      explanation = `${count} distinct Azure/Microsoft services → ${points} points`
      if (count < 6) recommendation = 'Add more Microsoft services to increase depth score'
    } else {
      explanation = 'No services mapped'
      recommendation = 'Map specific Microsoft services for each solution'
    }

    components.push({ name: 'Service Depth', maxPoints: 30, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 3. Role Diversity (max 20)
  {
    const roles = new Set(solutions.map(s => s.role))
    let points = 0
    let status: ATMComponentStatus = solutions.length > 0 ? 'scored' : 'not-assessed'
    const sourceFields = solutions.length > 0 ? ['microsoftSolutions[].role'] : []
    let explanation = ''
    let recommendation: string | undefined

    const hasPrimary = roles.has('primary')
    const hasSupporting = roles.has('supporting')
    const hasIntegration = roles.has('integration')

    if (hasPrimary && hasSupporting && hasIntegration) {
      points = 20
      explanation = 'Primary + Supporting + Integration roles → 20 points'
    } else if (hasPrimary && hasSupporting) {
      points = 15
      explanation = 'Primary + Supporting roles → 15 points'
      recommendation = 'Add an integration-role service (e.g., API Management, Logic Apps) to gain +5 points'
    } else if (hasPrimary) {
      points = 8
      explanation = 'Primary role only → 8 points'
      recommendation = 'Add supporting and integration services to diversify solution roles'
    } else if (solutions.length > 0) {
      points = 4
      explanation = 'Solutions mapped but no primary role designated → 4 points'
      recommendation = 'Designate at least one solution as primary role'
    } else {
      explanation = 'No solutions mapped'
    }

    components.push({ name: 'Role Diversity', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  return buildDimensionScore('multi-pillar', 'Multi-Pillar', components)
}

// ============================================================================
// DIMENSION 5: REPEATABILITY (0-100)
// ============================================================================

function scoreRepeatability(useCase: UseCase, session?: DiscoverySession | null): ATMDimensionScore {
  const components: ATMComponentScore[] = []

  // 1. Reference Architecture (max 35)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    if (useCase.referenceArchitecture) {
      const archInfo = REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern]
      if (archInfo) {
        status = 'scored'
        points = 35
        sourceFields.push('referenceArchitecture')
        explanation = `Known pattern: "${archInfo.label}" → 35 points (proven catalog pattern)`
      } else {
        status = 'scored'
        points = 15
        sourceFields.push('referenceArchitecture')
        explanation = `Custom pattern "${useCase.referenceArchitecture}" → 15 points (not in standard catalog)`
        recommendation = 'Consider aligning to a standard reference architecture for full repeatability credit'
      }
    } else {
      explanation = 'No reference architecture selected'
      recommendation = 'Select a reference architecture pattern to gain up to 35 points'
    }

    components.push({ name: 'Reference Architecture', maxPoints: 35, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 2. Business Process Mapping (max 30)
  {
    const processes = useCase.businessProcesses ?? []
    let points = 0
    let status: ATMComponentStatus = processes.length > 0 ? 'scored' : 'not-assessed'
    const sourceFields = processes.length > 0 ? ['businessProcesses'] : []
    let explanation = ''
    let recommendation: string | undefined

    if (processes.length > 0) {
      let processPoints = 0
      if (processes.length >= 3) processPoints = 20
      else if (processes.length === 2) processPoints = 12
      else processPoints = 6

      const withCycleTime = processes.filter(p => p.expectedCycleTimeReduction).length
      const cyclePoints = Math.min(withCycleTime * 5, 10)
      
      points = Math.min(processPoints + cyclePoints, 30)
      explanation = `${processes.length} process${processes.length !== 1 ? 'es' : ''} mapped (${processPoints}pts) + ${withCycleTime} with cycle time targets (${cyclePoints}pts)`
      if (processes.length < 3) recommendation = 'Map at least 3 business processes for full process coverage'
      else if (withCycleTime < processes.length) recommendation = 'Add expected cycle time reduction for all processes'
    } else {
      explanation = 'No business processes mapped'
      recommendation = 'Map business processes with improvement targets to gain up to 30 points'
    }

    components.push({ name: 'Business Process Mapping', maxPoints: 30, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 3. Industry Alignment (max 20)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const industry = session?.industry
    if (useCase.referenceArchitecture && industry) {
      status = 'scored'
      sourceFields.push('referenceArchitecture', 'session.industry')
      const archInfo = REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern]
      if (archInfo?.industries.includes(industry)) {
        points = 20
        explanation = `"${archInfo.label}" is proven in ${industry} → 20 points`
      } else if (archInfo) {
        points = 10
        explanation = `"${archInfo.label}" exists but not tagged for ${industry} → 10 points`
        recommendation = `Consider an architecture with proven ${industry} applicability`
      } else {
        points = 5
        explanation = `Custom architecture — industry alignment cannot be verified → 5 points`
      }
    } else if (!useCase.referenceArchitecture) {
      explanation = 'No reference architecture — industry alignment cannot be assessed'
      recommendation = 'Select a reference architecture to enable industry alignment scoring'
    } else {
      explanation = 'No industry set on session'
      recommendation = 'Set the session industry to enable alignment scoring'
    }

    components.push({ name: 'Industry Alignment', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 4. Solution Play Tagging (max 15)
  {
    const plays = useCase.solutionPlays ?? []
    let points = 0
    let status: ATMComponentStatus = plays.length > 0 ? 'scored' : 'not-assessed'
    const sourceFields = plays.length > 0 ? ['solutionPlays'] : []
    let explanation = ''
    let recommendation: string | undefined

    if (plays.length > 0) {
      points = 15
      explanation = `${plays.length} solution play${plays.length !== 1 ? 's' : ''} tagged: ${plays.join(', ')} → 15 points`
    } else {
      explanation = 'No solution plays tagged'
      recommendation = 'Tag at least one solution play to gain 15 points'
    }

    components.push({ name: 'Solution Play Tagging', maxPoints: 15, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 5. CAF Maturity (max 20)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    const cafStage = session?.businessEnvisioning?.currentState?.cafStage
    const cafMaturity = session?.businessEnvisioning?.currentState?.cafCapabilityMaturity

    if (cafStage || cafMaturity) {
      status = 'scored'
      // CAF lifecycle stage
      let stagePts = 0
      if (cafStage) {
        sourceFields.push('businessEnvisioning.currentState.cafStage')
        const stageScores: Record<string, number> = { 'define': 2, 'plan': 4, 'ready': 7, 'adopt': 10, 'govern-manage': 10 }
        stagePts = stageScores[cafStage] ?? 2
      }
      // CAF pillar maturity — average across assessed pillars
      let maturityPts = 0
      if (cafMaturity) {
        sourceFields.push('businessEnvisioning.currentState.cafCapabilityMaturity')
        const entries = Object.entries(cafMaturity) as [CAFCapability, CAFMaturityLevel][]
        if (entries.length > 0) {
          const maturityScores: Record<string, number> = { 'initial': 1, 'developing': 2, 'defined': 4, 'managed': 7, 'optimizing': 10 }
          const avgMaturity = entries.reduce((sum, [, lvl]) => sum + (maturityScores[lvl] ?? 1), 0) / entries.length
          maturityPts = Math.round(avgMaturity)
        }
      }
      points = Math.min(stagePts + maturityPts, 20)
      explanation = `CAF stage: ${cafStage ?? 'N/A'} (${stagePts}pts) + pillar maturity avg (${maturityPts}pts)`
      if (!cafStage) recommendation = 'Set the CAF lifecycle stage for the customer'
      else if (stagePts < 7) recommendation = 'Progress the customer through CAF lifecycle toward Ready/Adopt phase'
    } else {
      explanation = 'No CAF assessment provided (session-level data)'
      recommendation = 'Complete the CAF readiness assessment to gain up to 20 points'
    }

    components.push({ name: 'CAF Maturity', maxPoints: 20, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  // 6. Architecture Layer Coverage (max 15)
  {
    let points = 0
    let status: ATMComponentStatus = 'not-assessed'
    let explanation = ''
    const sourceFields: string[] = []
    let recommendation: string | undefined

    if (useCase.referenceArchitecture) {
      const archInfo = REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern]
      if (archInfo?.layers && archInfo.layers.length > 0) {
        status = 'scored'
        sourceFields.push('referenceArchitecture (layers)')
        // 5 layers maximum → 3pts per layer
        points = Math.min(archInfo.layers.length * 3, 15)
        explanation = `Covers ${archInfo.layers.length}/5 architecture layers: ${archInfo.layers.join(', ')} → ${points} points`
        if (archInfo.layers.length < 4) recommendation = `Architecture spans ${archInfo.layers.length} layers — a broader solution may strengthen repeatability`
      } else if (archInfo) {
        status = 'partial'
        points = 5
        explanation = 'Reference architecture selected but layers not mapped → 5 base points'
        recommendation = 'Architecture layer mapping improves repeatability assessment'
      }
    } else {
      explanation = 'No reference architecture — layer coverage cannot be assessed'
    }

    components.push({ name: 'Architecture Layer Coverage', maxPoints: 15, earnedPoints: points, status, explanation, sourceFields, recommendation })
  }

  return buildDimensionScore('repeatability', 'Repeatability', components)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildDimensionScore(
  dimension: ATMDimension,
  label: string,
  components: ATMComponentScore[],
): ATMDimensionScore {
  const assessed = components.filter(c => c.status !== 'not-assessed')
  const assessedMaxPoints = assessed.reduce((sum, c) => sum + c.maxPoints, 0)
  const earnedPoints = components.reduce((sum, c) => sum + c.earnedPoints, 0)

  // Normalise against assessed components only (avoid penalising missing data)
  const rawScore = assessedMaxPoints > 0 ? Math.round((earnedPoints / assessedMaxPoints) * 100) : 0

  // Top recommendation = the not-assessed or partial component with highest maxPoints
  const topRec = components
    .filter(c => c.recommendation)
    .sort((a, b) => {
      // Prioritise not-assessed over partial, then by max points
      const aPriority = a.status === 'not-assessed' ? 1 : 0
      const bPriority = b.status === 'not-assessed' ? 1 : 0
      if (aPriority !== bPriority) return bPriority - aPriority
      return (b.maxPoints - b.earnedPoints) - (a.maxPoints - a.earnedPoints)
    })

  return {
    dimension,
    label,
    weight: DIMENSION_WEIGHTS[dimension],
    rawScore,
    componentsAssessed: assessed.length,
    componentsTotal: components.length,
    components,
    topRecommendation: topRec[0]?.recommendation,
  }
}

function generateGapRecommendations(dimensions: ATMDimensionScore[]): ATMGapRecommendation[] {
  const recommendations: ATMGapRecommendation[] = []

  for (const dim of dimensions) {
    for (const comp of dim.components) {
      if (comp.recommendation && comp.earnedPoints < comp.maxPoints) {
        const potentialGain = Math.round((comp.maxPoints - comp.earnedPoints) * dim.weight)
        recommendations.push({
          dimension: dim.dimension,
          action: comp.recommendation,
          potentialPointsGain: potentialGain,
          priority: potentialGain >= 5 ? 'high' : potentialGain >= 2 ? 'medium' : 'low',
        })
      }
    }
  }

  return recommendations.sort((a, b) => b.potentialPointsGain - a.potentialPointsGain)
}

function agentTypeScore(agentType: string): number {
  const scores: Record<string, number> = {
    'orchestrator-agent': 10,
    'specialist-agent': 8,
    'task-agent': 5,
    'assistant-agent': 3,
  }
  return scores[agentType] ?? 3
}

function automationScore(level: string): number {
  const scores: Record<string, number> = { 'autonomous': 20, 'semi-autonomous': 14, 'assisted': 8 }
  return scores[level] ?? 0
}

function oversightDeduction(oversight: string): number {
  const deductions: Record<string, number> = { 'none': 0, 'approval': 2, 'review': 4, 'supervision': 6 }
  return deductions[oversight] ?? 0
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

// ============================================================================
// PORTFOLIO-LEVEL HELPERS
// ============================================================================

/**
 * Calculate ATM scores for all use cases in a session
 */
export function calculatePortfolioATMScores(
  useCases: UseCase[],
  session?: DiscoverySession | null,
): { useCaseId: string; score: ATMScore }[] {
  return useCases.map(uc => ({
    useCaseId: uc.id,
    score: calculateATMScore(uc, session),
  }))
}

/**
 * Get a portfolio-level ATM summary
 */
export function getPortfolioATMSummary(
  scores: { useCaseId: string; score: ATMScore }[],
): {
  totalUseCases: number
  qualifiedCount: number           // Gold or Platinum
  tierBreakdown: Record<ATMTier, number>
  averageComposite: number
  weakestDimension: ATMDimension | null
  pillarCoverage: ATMPillar[]      // Union of all pillars across portfolio
} {
  const tierBreakdown: Record<ATMTier, number> = {
    'platinum': 0,
    'gold': 0,
    'silver': 0,
    'not-qualified': 0,
    'insufficient-data': 0,
  }
  const allPillars = new Set<ATMPillar>()
  const dimensionTotals: Record<ATMDimension, number[]> = {
    'business-impact': [],
    'innovation-agentic': [],
    'enterprise-grade': [],
    'multi-pillar': [],
    'repeatability': [],
  }

  for (const { score } of scores) {
    tierBreakdown[score.tier]++
    score.pillarsCovered.forEach(p => allPillars.add(p))
    for (const dim of score.dimensions) {
      dimensionTotals[dim.dimension].push(dim.rawScore)
    }
  }

  const averageComposite = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.score.compositeScore, 0) / scores.length)
    : 0

  // Find weakest dimension (lowest average)
  let weakestDimension: ATMDimension | null = null
  let lowestAvg = Infinity
  for (const [dim, values] of Object.entries(dimensionTotals) as [ATMDimension, number[]][]) {
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      if (avg < lowestAvg) {
        lowestAvg = avg
        weakestDimension = dim
      }
    }
  }

  return {
    totalUseCases: scores.length,
    qualifiedCount: tierBreakdown.platinum + tierBreakdown.gold,
    tierBreakdown,
    averageComposite,
    weakestDimension,
    pillarCoverage: Array.from(allPillars),
  }
}
