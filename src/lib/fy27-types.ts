/**
 * FY27 ATS alignment types.
 *
 * These entities close the genuine gaps between ID-8 and the ATS FY27 focus
 * areas that were NOT already covered by the existing subsystems (MCEM pipeline,
 * ATM scoring, governance / regulatory / sovereign assessments, CSAM cockpit):
 *
 *   - Blocker           -> structured blocker orchestration           (Focus 6)
 *   - ConsumptionPlan   -> MACC burn / forecast / renewal planning     (Focus 6)
 *   - SecureAIAssessment-> aggregated, refreshable secure-AI posture    (Focus 3)
 *   - Interaction /
 *     StakeholderRelationship / BuyerPersona -> relationship tracking   (Focus 2)
 *   - TransformationRoadmap -> multi-horizon roadmap                    (Focus 1)
 *   - Fy27AlignmentScorecard -> leadership-facing alignment roll-up     (capstone)
 *
 * New entities live here to avoid churning the large shared `types.ts`. Shared
 * primitives are imported from `./types`.
 */
import type {
  SolutionArea,
  AccountTeamRole,
  StakeholderType,
  StakeholderDisposition,
  AIGovernanceAssessment,
  RegulatoryAssessment,
} from './types'

// ============================================================================
// FOCUS 6 — BLOCKER ORCHESTRATION
// ============================================================================

export type BlockerCategory =
  | 'technical'
  | 'commercial'
  | 'security'
  | 'compliance'
  | 'resource'
  | 'partner'
  | 'customer'
  | 'other'

export const BLOCKER_CATEGORY_LABELS: Record<BlockerCategory, string> = {
  technical: 'Technical',
  commercial: 'Commercial',
  security: 'Security',
  compliance: 'Compliance',
  resource: 'Resource / Capacity',
  partner: 'Partner',
  customer: 'Customer',
  other: 'Other',
}

export type BlockerPriority = 'critical' | 'high' | 'medium' | 'low'
export type BlockerStatus = 'open' | 'in-progress' | 'escalated' | 'resolved' | 'accepted-risk'

export const BLOCKER_STATUS_LABELS: Record<BlockerStatus, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  escalated: 'Escalated',
  resolved: 'Resolved',
  'accepted-risk': 'Accepted risk',
}

/**
 * A structured blocker — replaces the untyped `Workload.blockers: string[]`
 * with an ownable, escalatable, trackable item that can be linked to the
 * workloads, use cases and opportunities it is holding up.
 */
export interface Blocker {
  id: string
  accountId?: string
  customerId?: string
  title: string
  description?: string
  category: BlockerCategory
  priority: BlockerPriority
  status: BlockerStatus
  ownerName?: string
  ownerRole?: AccountTeamRole
  /** Who / where this escalates to if it stalls. */
  escalationPath?: string
  linkedWorkloadIds?: string[]
  linkedUseCaseIds?: string[]
  linkedOpportunityIds?: string[]
  /** Target resolution date (timestamp). Used to flag overdue / at-risk items. */
  targetResolutionDate?: number
  resolvedAt?: number
  resolutionNotes?: string
  createdAt: number
  updatedAt?: number
}

// ============================================================================
// FOCUS 6 — MACC CONSUMPTION PLANNING
// ============================================================================

export type ConsumptionAlertSeverity = 'info' | 'warning' | 'critical'

export interface ConsumptionAlert {
  id: string
  severity: ConsumptionAlertSeverity
  message: string
}

/** A single trailing- or forward-looking ACR data point. */
export interface ConsumptionDataPoint {
  /** Human label for the period, e.g. "FY26-M03" or "2026-03". */
  period: string
  /** Azure Consumed Revenue for that month (USD). */
  acr: number
  /** True when this point is a forward projection rather than actual. */
  projected?: boolean
}

/**
 * A consumption plan drives MACC burn-down / forecast / renewal planning for an
 * account. It is derived from trailing ACR history + the account's MACC
 * commitment (see `consumption-planning-engine.ts`).
 */
export interface ConsumptionPlan {
  id: string
  accountId: string
  /** Trailing actual ACR history (oldest -> newest). */
  history: ConsumptionDataPoint[]
  /** Forward projection produced by the engine. */
  forecast: ConsumptionDataPoint[]
  currentMonthlyACR: number
  /** Average monthly burn over the trailing window. */
  burnRatePerMonth: number
  /** When the remaining MACC balance is projected to be exhausted (timestamp). */
  projectedExhaustionDate?: number
  /** Commitment renewal date (timestamp). */
  renewalDate?: number
  /** Alert if projected consumption over-/under-runs commitment by this %. */
  overconsumptionThresholdPct: number
  alerts: ConsumptionAlert[]
  updatedAt: number
}

// ============================================================================
// FOCUS 3 — CUSTOMER SECURE AI ASSESSMENT (aggregated + refreshable)
// ============================================================================

export type SecurePostureBand = 'critical' | 'at-risk' | 'developing' | 'strong' | 'leading'

export const SECURE_POSTURE_BAND_LABELS: Record<SecurePostureBand, string> = {
  critical: 'Critical',
  'at-risk': 'At risk',
  developing: 'Developing',
  strong: 'Strong',
  leading: 'Leading',
}

export type SecureAIAssessmentStatus = 'draft' | 'active' | 'superseded'

/** One rolled-up dimension of the secure-AI posture. */
export interface SecureAIDimensionScore {
  key: 'ai-governance' | 'regulatory-compliance' | 'responsible-ai'
  label: string
  /** 0-100 normalized score. */
  score: number
  /** Relative weight in the composite (0-1). */
  weight: number
  band: SecurePostureBand
  summary: string
  gaps: string[]
}

export interface SecureAIRemediation {
  id: string
  title: string
  dimension: SecureAIDimensionScore['key']
  priority: 'high' | 'medium' | 'low'
  effort: 'low' | 'medium' | 'high'
  recommendation: string
}

/**
 * A packaged, versioned, refreshable Customer Secure AI Assessment. Aggregates
 * the existing AI-governance and regulatory-compliance
 * assessments into a single ownable posture score the ATS can share with the
 * v-team and re-run over time (the `refreshedFromId` / `version` chain).
 */
export interface SecureAIAssessment {
  id: string
  accountId?: string
  customerId?: string
  sessionId?: string
  customerName: string
  version: number
  status: SecureAIAssessmentStatus
  /** 0-100 composite posture score. */
  postureScore: number
  postureBand: SecurePostureBand
  dimensions: SecureAIDimensionScore[]
  remediations: SecureAIRemediation[]
  /** Optional executive narrative for sharing with the v-team. */
  narrative?: string
  assessmentDate: number
  /** Previous assessment this one was refreshed from (version chain). */
  refreshedFromId?: string
  /** Recommended date for the next refresh (timestamp). */
  nextRefreshDue?: number
  createdBy?: string
  createdAt: number
  updatedAt?: number
}

/** Loose input bundle the engine aggregates into a SecureAIAssessment. */
export interface SecureAIAssessmentInput {
  customerName: string
  accountId?: string
  customerId?: string
  sessionId?: string
  governance?: AIGovernanceAssessment
  /** Use-case level regulatory assessments (worst-case is used for the gate). */
  regulatory?: RegulatoryAssessment[]
  createdBy?: string
}

// ============================================================================
// FOCUS 2 — DECISION-MAKER RELATIONSHIPS
// ============================================================================

export type InteractionType =
  | 'meeting'
  | 'email'
  | 'call'
  | 'event'
  | 'workshop'
  | 'exec-briefing'
  | 'other'

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  meeting: 'Meeting',
  email: 'Email',
  call: 'Call',
  event: 'Event',
  workshop: 'Workshop',
  'exec-briefing': 'Exec briefing',
  other: 'Other',
}

/** A logged touchpoint with a customer stakeholder. */
export interface Interaction {
  id: string
  accountId?: string
  customerId?: string
  stakeholderId?: string
  stakeholderName?: string
  type: InteractionType
  /** When the interaction happened (timestamp). */
  date: number
  summary: string
  nextAction?: string
  nextActionDue?: number
  /** Microsoft v-team member who logged / owns this touchpoint. */
  ownerName?: string
  createdAt: number
}

export type RelationshipHealthBand = 'strong' | 'stable' | 'at-risk' | 'stale' | 'none'

export const RELATIONSHIP_HEALTH_LABELS: Record<RelationshipHealthBand, string> = {
  strong: 'Strong',
  stable: 'Stable',
  'at-risk': 'At risk',
  stale: 'Stale',
  none: 'No contact',
}

/**
 * A tracked relationship with a customer decision maker. Adds the power /
 * interest coordinates and an owning v-team member on top of the existing
 * enterprise-discovery `Stakeholder` model so relationships can be visualised
 * on an influence matrix and nurtured over time.
 */
export interface StakeholderRelationship {
  id: string
  accountId?: string
  customerId?: string
  name: string
  role: string
  stakeholderType: StakeholderType
  disposition: StakeholderDisposition
  /** Power / influence axis (1-10) for the influence matrix. */
  influence: number
  /** Interest / engagement axis (1-10) for the influence matrix. */
  interest: number
  /** Microsoft v-team member who owns this relationship. */
  relationshipOwner?: string
  /** Linked buyer persona for tailored briefings. */
  personaId?: string
  /** Last contact timestamp (derived from interactions when available). */
  lastContact?: number
  createdAt: number
  updatedAt?: number
}

/** A reusable buyer persona used to tailor briefings to a decision maker. */
export interface BuyerPersona {
  id: string
  /** e.g. "CFO", "CTO", "Chief Digital Officer". */
  title: string
  stakeholderType: StakeholderType
  /** What this persona cares about most. */
  priorities: string[]
  /** How value should be framed (revenue / cost / risk levers). */
  valueLevers: string[]
  concerns: string[]
  /** Guidance for tailoring a briefing to this persona. */
  briefingFocus: string
}

/** Seed library of common enterprise buyer personas. */
export const DEFAULT_BUYER_PERSONAS: BuyerPersona[] = [
  {
    id: 'persona-cfo',
    title: 'CFO',
    stakeholderType: 'economic-buyer',
    priorities: ['Margin & cost discipline', 'Predictable ROI', 'Risk & compliance exposure'],
    valueLevers: ['Cost reduction', 'Payback period', 'Risk-adjusted value'],
    concerns: ['Unclear ROI', 'CapEx vs OpEx shift', 'Hidden run costs'],
    briefingFocus:
      'Lead with quantified financial impact (payback, NPV, cost of inaction). Keep architecture light.',
  },
  {
    id: 'persona-cto',
    title: 'CTO / CIO',
    stakeholderType: 'technical-evaluator',
    priorities: ['Architecture fit', 'Security & resilience', 'Technical debt reduction'],
    valueLevers: ['Modernization', 'Reliability', 'Developer velocity'],
    concerns: ['Integration risk', 'Lock-in', 'Security posture'],
    briefingFocus:
      'Lead with reference architecture, security posture and integration path. Show technical soundness.',
  },
  {
    id: 'persona-ciso',
    title: 'CISO',
    stakeholderType: 'technical-evaluator',
    priorities: ['Threat reduction', 'Regulatory compliance', 'Data sovereignty'],
    valueLevers: ['Risk mitigation', 'Zero Trust', 'Responsible AI'],
    concerns: ['Data exposure', 'AI governance gaps', 'Audit readiness'],
    briefingFocus:
      'Lead with the Secure AI Assessment posture, compliance coverage and remediation roadmap.',
  },
  {
    id: 'persona-coo',
    title: 'COO / Business Line Owner',
    stakeholderType: 'user-buyer',
    priorities: ['Operational efficiency', 'Customer experience', 'Time to value'],
    valueLevers: ['Productivity', 'Cycle-time reduction', 'Revenue growth'],
    concerns: ['Change management', 'Adoption', 'Disruption to operations'],
    briefingFocus:
      'Lead with the business outcome, adoption plan and operational KPIs. Tie use cases to their priorities.',
  },
]

// ============================================================================
// FOCUS 1 — TRANSFORMATION ROADMAP
// ============================================================================

export type RoadmapHorizon = 'now' | 'next' | 'later'

export const ROADMAP_HORIZON_LABELS: Record<RoadmapHorizon, string> = {
  now: 'Now (0-6 months)',
  next: 'Next (6-18 months)',
  later: 'Later (18+ months)',
}

export interface RoadmapObjective {
  id: string
  title: string
  /** Optional link to a captured BusinessOutcome. */
  businessOutcomeRef?: string
  linkedUseCaseIds: string[]
  solutionArea?: SolutionArea
  /** e.g. "FY26 H2". */
  targetFiscalPeriod?: string
}

export interface RoadmapPhase {
  id: string
  name: string
  horizon: RoadmapHorizon
  fiscalPeriod?: string
  objectives: RoadmapObjective[]
  milestones: string[]
}

/** A multi-horizon transformation roadmap tying objectives to use cases. */
export interface TransformationRoadmap {
  id: string
  accountId?: string
  customerId?: string
  sessionId?: string
  customerName: string
  phases: RoadmapPhase[]
  createdAt: number
  updatedAt?: number
}

// ============================================================================
// CAPSTONE — FY27 ALIGNMENT SCORECARD
// ============================================================================

export type Fy27FocusId =
  | 'understand-document'
  | 'grow-relationships'
  | 'secure-ai-assessment'
  | 'robust-pipeline'
  | 'qualify-orchestrate'
  | 'macc-consumption'

export const FY27_FOCUS_LABELS: Record<Fy27FocusId, string> = {
  'understand-document': 'Understand & document the customer',
  'grow-relationships': 'Grow decision-maker relationships',
  'secure-ai-assessment': 'Own & refresh the Secure AI Assessment',
  'robust-pipeline': 'Robust, technically-sound pipeline',
  'qualify-orchestrate': 'Qualify Stage 1 & orchestrate owners',
  'macc-consumption': 'Drive MACC consumption & remove blockers',
}

export type Fy27Band = 'strong' | 'moderate' | 'partial' | 'weak'

export interface Fy27FocusScore {
  id: Fy27FocusId
  label: string
  /** 0-100 alignment score for this focus area. */
  score: number
  band: Fy27Band
  /** Positive signals that contributed to the score. */
  signals: string[]
  /** Outstanding gaps for this focus area. */
  gaps: string[]
}

export interface Fy27AlignmentScorecard {
  accountId?: string
  customerName?: string
  /** 0-100 overall alignment (weighted mean of focus scores). */
  overallScore: number
  overallBand: Fy27Band
  focusScores: Fy27FocusScore[]
  generatedAt: number
}

/** Signals the alignment engine consumes to compute the scorecard. */
export interface Fy27AlignmentSignals {
  customerName?: string
  accountId?: string
  // Focus 1
  hasBusinessEnvisioning: boolean
  hasCompanyResearch: boolean
  roadmapPhaseCount: number
  // Focus 2
  trackedRelationships: number
  staleRelationships: number
  interactionsLast90Days: number
  // Focus 3
  hasSecureAIAssessment: boolean
  secureAIPostureScore?: number
  secureAIRefreshOverdue: boolean
  // Focus 4 & 5
  totalUseCases: number
  qualifiedOpportunities: number
  opportunitiesStage2Plus: number
  // Focus 6
  hasMaccCommitment: boolean
  consumptionOnTrack?: boolean
  openBlockers: number
  overdueBlockers: number
}
