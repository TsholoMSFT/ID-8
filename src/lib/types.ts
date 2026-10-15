import { CompanyInsight } from './company-research-service'
import type {
  FrontierDeliveryStage,
  FrontierMaturityStage,
  FrontierOfferingId,
  FrontierPillarId,
  FrontierReadinessRatings,
  FrontierWorkstreamId,
} from './frontier-ai/catalog'

export interface KPI {
  id: string
  name: string
  category: 'efficiency' | 'quality' | 'performance' | 'compliance' | 'workload'
  description: string
}

export interface Customer {
  id: string
  name: string
  innovationHubSPOC: string
  stockTicker?: string
  accountId?: string              // Linked Account entity (ATS)
  stakeholders?: CustomerStakeholder[]
  createdAt: number
  updatedAt?: number
}

export type StakeholderInfluence = 'low' | 'high'
export type StakeholderInterest = 'low' | 'high'

export interface CustomerStakeholder extends Stakeholder {
  department?: string
  email?: string
  influence: StakeholderInfluence
  interest: StakeholderInterest
}

// ============================================================================
// AI REGULATIONS & CYBERSECURITY TYPES
// ============================================================================

// Note: Full policy details are in ai-policies.ts
export type AIRegulationFramework = 
  // International/Global
  | 'oecd-ai-principles'      // OECD AI Principles
  | 'unesco-ai-ethics'        // UNESCO Recommendation on AI Ethics
  | 'iso-42001'               // ISO/IEC 42001 AI Management System
  
  // European Union
  | 'eu-ai-act'               // EU AI Act (2024)
  | 'gdpr'                    // General Data Protection Regulation
  
  // United States
  | 'nist-ai-rmf'             // NIST AI Risk Management Framework
  | 'white-house-eo'          // US Executive Order on AI (Oct 2023)
  | 'ccpa'                    // California Consumer Privacy Act
  | 'hipaa'                   // HIPAA (healthcare)
  | 'sox'                     // Sarbanes-Oxley (financial)
  | 'ferpa'                   // Education records
  | 'glba'                    // Gramm-Leach-Bliley (financial)
  
  // African Union & Africa
  | 'au-ai-strategy'          // African Union AI Continental Strategy
  | 'au-data-policy'          // AU Data Policy Framework
  | 'smart-africa'            // Smart Africa Alliance AI Blueprint
  
  // South Africa
  | 'sa-ai-policy-draft'      // South Africa Draft National AI Policy
  | 'popia'                   // Protection of Personal Information Act
  | 'ecta'                    // Electronic Communications and Transactions Act
  | 'dmre'                    // Dept of Mineral Resources (mining)
  | 'sahpra'                  // SA Health Products Regulatory Authority
  
  // EU Sector-Specific
  | 'dora'                    // Digital Operational Resilience Act (EU financial)
  | 'nis2'                    // NIS2 Directive (EU critical infrastructure)

  // US Sector-Specific
  | 'fedramp'                 // FedRAMP (US federal cloud)
  | 'finra'                   // Financial Industry Regulatory Authority
  | 'cpra'                    // California Privacy Rights Act (supersedes CCPA)
  | 'fda-samd'                // FDA Software as Medical Device

  // International Standards
  | 'soc2'                    // SOC 2 Type II
  | 'iso-27001'               // ISO/IEC 27001 Information Security

  // Industry-Specific
  | 'msha'                    // Mine Safety and Health (mining)
  | 'epa'                     // Environmental Protection
  | 'osha'                    // Occupational Safety
  | 'nerc-cip'                // Energy sector cybersecurity
  | 'pci-dss'                 // Payment Card Industry
  
  // Australia
  | 'au-ai-ethics-framework'  // Australia AI Ethics Framework
  
  // Brazil
  | 'brazil-lgpd'             // Lei Geral de Proteção de Dados
  | 'brazil-ai-bill'          // Brazil AI Regulation Bill
  
  // Singapore
  | 'singapore-ai-governance' // Singapore Model AI Governance Framework
  
  // United Kingdom
  | 'uk-ai-regulation'        // UK Pro-innovation AI Regulation
  
  // Canada
  | 'canada-aida'             // Artificial Intelligence and Data Act
  
  // Japan
  | 'japan-ai-strategy'       // Japan AI Strategy
  
  // India
  | 'india-dpdp'              // Digital Personal Data Protection Act
  
  // UAE
  | 'uae-ai-strategy'         // UAE National AI Strategy 2031
  
  // Kenya
  | 'kenya-dpa'               // Kenya Data Protection Act
  
  // Nigeria
  | 'nigeria-ndpr'            // Nigeria Data Protection Regulation
  
  // China
  | 'china-ai-regulations'    // China AI Regulations (Deep Synthesis / Generative AI)
  
  // Microsoft & Technology
  | 'ms-responsible-ai'       // Microsoft Responsible AI Standard
  | 'ms-ai-principles'        // Microsoft AI Principles
  | 'ms-copilot-governance'   // Microsoft Copilot Governance
  
  | 'other'

export type AIRiskLevel = 
  | 'unacceptable'        // Banned under EU AI Act
  | 'high'                // Requires conformity assessment
  | 'limited'             // Transparency obligations
  | 'minimal'             // No specific requirements

export type SecurityRequirement =
  | 'encryption-at-rest'
  | 'encryption-in-transit'
  | 'access-control'
  | 'audit-logging'
  | 'penetration-testing'
  | 'vulnerability-scanning'
  | 'data-masking'
  | 'mfa-required'
  | 'soc2-compliance'
  | 'iso27001'
  | 'zero-trust'
  | 'air-gapped'
  | 'on-premises-only'
  | 'scada-protection'    // Industrial control systems

export type ThreatCategory =
  | 'data-breach'
  | 'prompt-injection'
  | 'model-poisoning'
  | 'adversarial-attacks'
  | 'data-exfiltration'
  | 'insider-threat'
  | 'supply-chain'
  | 'denial-of-service'
  | 'ot-it-convergence'   // Operational Technology risks
  | 'scada-attack'        // Industrial control system attacks

export type DataClassification =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'highly-confidential'
  | 'pii'
  | 'phi'                 // Protected Health Information
  | 'financial'
  | 'operational'         // Operational/industrial data

// ============================================================================
// ENTITY TYPE - For public vs private vs government organizations
// ============================================================================

export type EntityType = 
  | 'public-company'      // Publicly traded company with stock ticker
  | 'private-company'     // Private company (no stock ticker)
  | 'government'          // Government / Public Sector agency
  | 'non-profit'          // Non-profit organization

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  'public-company': 'Public Company',
  'private-company': 'Private Company',
  'government': 'Government / Public Sector',
  'non-profit': 'Non-Profit Organization',
}

export const ENTITY_TYPE_DESCRIPTIONS: Record<EntityType, string> = {
  'public-company': 'Publicly traded on stock exchanges (NYSE, NASDAQ, JSE, etc.)',
  'private-company': 'Privately held company, not publicly traded',
  'government': 'Government department, agency, or public sector organization',
  'non-profit': 'Non-profit, NGO, or charitable organization',
}

// ============================================================================
// ACCOUNT SEGMENT — Adapts discovery depth for different customer sizes
// ============================================================================

export type AccountSegment = 'enterprise' | 'majors-growth' | 'smec'

export const ACCOUNT_SEGMENT_LABELS: Record<AccountSegment, string> = {
  'enterprise': 'Enterprise',
  'majors-growth': 'Majors Growth',
  'smec': 'SME & Commercial',
}

export const ACCOUNT_SEGMENT_DESCRIPTIONS: Record<AccountSegment, string> = {
  'enterprise': 'Large organizations — full discovery depth, financial modeling, and multi-stakeholder assessment',
  'majors-growth': 'Mid-market ($50 M–$500 M) — streamlined discovery with essential scoring and simplified financials',
  'smec': 'Small & medium businesses — rapid value assessment with pre-configured defaults and one-pager output',
}

/** Segment-specific metadata surfaced in segment picker and configuration */
export interface AccountSegmentMeta {
  segment: AccountSegment
  label: string
  description: string
  typicalDealSize: string
  discoveryDuration: string
  maxDiscoveryQuestions: number
  showStrategicAssessment: boolean
  showATMScoring: boolean
  showFinancialModeling: boolean
  defaultEntityType: EntityType
  budgetRanges: string[]
}

export const ACCOUNT_SEGMENT_META: Record<AccountSegment, AccountSegmentMeta> = {
  'enterprise': {
    segment: 'enterprise',
    label: 'Enterprise',
    description: 'Full-depth discovery with financial modeling and multi-stakeholder mapping',
    typicalDealSize: '$150 K – $5 M+',
    discoveryDuration: '2–4 hours',
    maxDiscoveryQuestions: 8,
    showStrategicAssessment: true,
    showATMScoring: true,
    showFinancialModeling: true,
    defaultEntityType: 'public-company',
    budgetRanges: ['< $50 K', '$50 K–$150 K', '$150 K–$500 K', '$500 K–$1 M', '> $1 M'],
  },
  'majors-growth': {
    segment: 'majors-growth',
    label: 'Majors Growth',
    description: 'Streamlined discovery focused on business value and quick ROI',
    typicalDealSize: '$25 K – $250 K',
    discoveryDuration: '30–60 min',
    maxDiscoveryQuestions: 5,
    showStrategicAssessment: true,   // available but simplified
    showATMScoring: true,            // summary only
    showFinancialModeling: false,    // simple ROI instead
    defaultEntityType: 'private-company',
    budgetRanges: ['< $25 K', '$25 K–$50 K', '$50 K–$150 K', '$150 K–$500 K', '> $500 K'],
  },
  'smec': {
    segment: 'smec',
    label: 'SME & Commercial',
    description: 'Rapid value assessment — identify 1–3 high-impact use cases in 15 minutes',
    typicalDealSize: '$5 K – $75 K',
    discoveryDuration: '15–30 min',
    maxDiscoveryQuestions: 3,
    showStrategicAssessment: false,
    showATMScoring: false,
    showFinancialModeling: false,
    defaultEntityType: 'private-company',
    budgetRanges: ['< $5 K', '$5 K–$15 K', '$15 K–$25 K', '$25 K–$50 K', '> $50 K'],
  },
}

export interface AIRegulationsInfo {
  applicableFrameworks: AIRegulationFramework[]
  riskClassification?: AIRiskLevel
  complianceNotes?: string
  jurisdictions?: string[]  // e.g., ['South Africa', 'EU', 'USA']
}

export interface CybersecurityInfo {
  securityRequirements: SecurityRequirement[]
  threatCategories?: ThreatCategory[]
  dataClassification?: DataClassification
  securityNotes?: string
}

// ============================================================================
// REGULATORY STAGE-GATE TYPES
// ============================================================================

/** Enforcement mode for compliance gating — configurable per session */
export type ComplianceEnforcement = 'strict' | 'advisory'

/** Per-framework risk assessment result */
export interface FrameworkAssessment {
  framework: AIRegulationFramework
  risk: AIRiskLevel
  reason: string
  articles?: string[]     // e.g., ["Art. 5(1)(a)", "Art. 6"]
}

/** A concrete remediation action to reduce risk */
export interface RemediationOption {
  id: string
  framework: AIRegulationFramework
  action: string
  priority: 'critical' | 'recommended' | 'optional'
  description: string
  acknowledged?: boolean  // User has reviewed / accepted this remediation
  acknowledgedAt?: number
  acknowledgedBy?: string
}

/** Aggregate regulatory assessment attached to a use case */
export interface RegulatoryAssessment {
  overallRisk: AIRiskLevel
  frameworkAssessments: FrameworkAssessment[]
  remediations: RemediationOption[]
  gateStatus: 'blocked' | 'warning' | 'clear'
  signOffRequired: boolean
  signedOff?: boolean
  signedOffBy?: string
  signedOffAt?: number
  overrideJustification?: string  // If facilitator overrides risk
  assessedAt: number
}

/** A regulatory news item from the regulatory-feeds endpoint */
export interface RegulatoryNewsItem {
  id: string
  title: string
  description: string
  source: string
  publishedDate: string
  jurisdiction: string
  url: string
  relevanceScore?: number
}

/** A violation / enforcement case ranked by AI for similarity */
export interface ViolationCase {
  id: string
  headline: string
  jurisdiction: string
  framework: string
  penaltyAmount?: string
  date: string
  relevanceSummary: string
  lessonsLearned: string
  sourceUrl: string
  severity: 'major' | 'moderate' | 'minor'
}

/** Manual financial context for non-public entities */
export interface ManualFinancialContext {
  annualRevenue?: number        // Or annual budget for government
  employeeCount?: number
  itBudget?: number
  keyFinancialMetrics?: string  // Freeform text
  financialSource?: 'manual' | 'document-extraction' | 'industry-benchmark'
}

/**
 * Internal sales / account data ingested from a CSV export of CRM
 * (Dynamics 365, Salesforce, MSX, etc.). Stored per customer in localStorage
 * via src/lib/sales-data-service.ts.
 */
export interface InternalSalesRecord {
  customerId: string
  customerName?: string
  accountId?: string                 // CRM account id
  arrUSD?: number                    // current annual recurring revenue
  expansionPipelineUSD?: number      // open opps
  productsOwned?: string[]           // e.g. "M365 E5", "Dynamics 365 Sales", "Azure"
  renewalDate?: string               // ISO
  segment?: string                   // SMB | Enterprise | Strategic
  accountTier?: string               // SMC | Major | Strategic
  primaryContact?: string
  notes?: string
  source: 'csv-upload' | 'graph' | 'dynamics' | 'msx'
  importedAt: number
  rawRow?: Record<string, string | number | null>
}

/** Industry benchmark data (used as fallback when no financials available) */
export interface IndustryBenchmark {
  industry: Industry
  revenuePerEmployee?: { min: number; median: number; max: number }
  itSpendPercent?: { min: number; median: number; max: number }
  operationalCostPercent?: number
  source: string
  year: number
}

// ============================================================================
// COST OF INACTION (COI) TYPES
// ============================================================================

export interface UseCaseCOI {
  directCosts: number           // Current spending on workarounds
  opportunityCosts: number      // Lost revenue/market share
  riskCosts: number             // Potential fines/compliance issues
  totalAnnualCOI: number        // Sum of all costs (risk-adjusted central estimate)
  low?: number                  // Conservative annual COI (lead with this)
  high?: number                 // Optimistic annual COI
  confidence?: 'low' | 'medium' | 'high'
  valueBasis?: 'estimated' | 'benchmarked' | 'customer-validated'
  verificationStep?: string     // How to validate this estimate with the customer
  notes?: string                // Calculation assumptions
  calculatedAt?: number         // Timestamp
}

export interface UseCaseExpectedValue {
  revenueImpact?: number        // Annual revenue improvement
  costSavings?: number          // Annual cost reduction
  riskMitigation?: number       // Risk-adjusted value avoided
  totalAnnualValue: number      // Total expected value (risk-adjusted central estimate)
  low?: number                  // Conservative annual value (lead with this)
  high?: number                 // Optimistic annual value
  confidence?: 'low' | 'medium' | 'high'
  valueBasis?: 'estimated' | 'benchmarked' | 'customer-validated'
  verificationStep?: string     // How to validate this estimate with the customer
  implementationCost?: number   // One-time implementation cost
  paybackMonths?: number        // Payback period in months
  threeYearROI?: number         // 3-year ROI percentage
  notes?: string                // Calculation assumptions / derived notes (editable)
}

/**
 * Deterministic per-use-case Azure run-cost estimate.
 * Produced by `src/lib/cost-engine.ts` from selected microsoftSolutions +
 * referenceArchitecture + aiEffortEstimate + assumed users/transactions.
 */
export interface UseCaseRunCost {
  /** Display currency. Defaults to USD; auto-converted via /api/exchange-rates. */
  currency: 'USD' | 'EUR' | 'GBP' | 'ZAR'
  /** Monthly Azure compute cost (AOAI + AI Search + Functions + storage etc.). */
  monthlyComputeUSD: number
  /** Monthly per-user license cost (M365 Copilot, Power Platform, Fabric). */
  monthlyLicenseUSD: number
  /** Monthly external data / egress / API cost (FRED, market data, etc.). */
  monthlyDataUSD: number
  /** One-time implementation cost (effortWeeks × loaded weekly rate). */
  oneTimeImplementationUSD: number
  /** Total monthly run cost (compute + license + data). */
  totalMonthlyUSD: number
  /** Total annual run cost = totalMonthlyUSD × 12. */
  totalAnnualUSD: number
  /** Assumptions / line items (one per major SKU). */
  assumptions: string[]
  /** Inputs the engine used so the user can tweak and recalc. */
  inputs?: {
    activeUsers?: number
    monthlyTransactions?: number
    region?: string
    searchBackend?: 'azure-ai-search' | 'blob-hybrid'
    sharedPlatformId?: string
  }
  lastEstimatedAt: number
  /** Pricing-table version used. */
  pricingVersion?: string
  /** Fixed costs may be shared only when the user explicitly selects the same platform group. */
  sharedPlatformCosts?: Array<{ key: string; monthlyUSD: number }>
}

/** AI-suggested SKU swap to reduce run cost (Phase 8 — cost optimization). */
export interface UseCaseCostOptimization {
  id: string
  title: string             // e.g. "Switch GPT-4o → GPT-4o-mini for analysis"
  rationale: string
  estimatedMonthlySavingsUSD: number
  confidence: 'low' | 'medium' | 'high'
  appliesTo?: string        // service / SKU label
}

export interface UseCase {
  id: string
  discoverySessionId?: string
  title: string
  description: string
  // Ownership / accountability
  customerAccountable?: string
  microsoftAccountable?: string
  bant?: BantQualification
  raciAssignments?: RaciAssignment[]
  impact: number
  feasibility: number
  rice: {
    reach: number
    users?: number
    period?: string
    impact: number
    confidence: number
    effort: number
  }
  kpis?: string[]
  // Business function / department this use case primarily serves (Discovery dept dimension)
  businessFunction?: BusinessFunction
  secondaryBusinessFunctions?: BusinessFunction[]
  // AI Regulations & Cybersecurity (footnote-level considerations)
  aiRegulations?: AIRegulationsInfo
  cybersecurity?: CybersecurityInfo
  // Regulatory stage-gate assessment (populated by regulatory engine)
  regulatoryAssessment?: RegulatoryAssessment
  // Data sources that informed this use case
  dataSources?: ('earnings' | 'financials' | 'news' | 'industry-research' | 'discovery' | 'ai-generated' | 'manual' | 'fallback')[]
  // AI-powered effort estimation (cached)
  aiEffortEstimate?: {
    effortWeeks: number
    reasoning: string
    estimatedAt: number
  }
  // Financial quantification (optional)
  costOfInaction?: UseCaseCOI
  expectedValue?: UseCaseExpectedValue
  // Deterministic Azure run-cost estimate (Phase 1: cost engine).
  // Auto-derived from microsoftSolutions + referenceArchitecture + aiEffortEstimate
  // via src/lib/cost-engine.ts. User editable.
  runCost?: UseCaseRunCost
  // AI-suggested cheaper SKU swaps for this use case (Phase 8).
  costOptimizations?: UseCaseCostOptimization[]
  // AI-generated executive Business Case markdown (Phase 2).
  businessCase?: {
    markdown: string
    generatedAt: number
    model?: string
  }
  // Contextual data from discovery
  earningsContext?: string[]    // Key earnings insights relevant to this use case
  industryContext?: string[]    // Industry trends/standards addressed
  createdAt: number
  
  // ============================================================================
  // INNOVATION HUB METHODOLOGY ADDITIONS
  // ============================================================================
  
  // Strategic alignment (Business Envisioning)
  strategicAlignment?: StrategicAlignmentInfo
  
  // Business process mapping (Business Envisioning)
  businessProcesses?: UseCaseBusinessProcess[]
  
  // Microsoft solution recommendations (Solution Envisioning)
  microsoftSolutions?: UseCaseMicrosoftSolution[]
  // Quick Discovery solution mapping (name/play only)
  solutionPlays?: string[]
  referenceArchitecture?: string  // Reference architecture pattern ID
  
  // Agentic AI opportunities (Solution Envisioning)
  agenticOpportunities?: UseCaseAgenticOpportunity[]
  
  // Implementation complexity (Solution Envisioning)
  implementationComplexity?: ImplementationComplexityInfo

  // AI mapping performed after prioritization, before Solution Blueprint.
  solutionMapping?: {
    provider: string
    model: string
    deployment?: string
    correlationId: string
    generatedAt: number
  }

  // Canonical Solution Blueprint linkage (Phase 4: collapsed shape).
  // The SolutionBlueprintWorkspace mirrors selected metadata onto the source
  // UseCase so prioritization, exec summary annex, and exports can derive
  // signals without reaching into a parallel localStorage shape.
  solutionBlueprint?: {
    archetypeId?: string
    sovereigntyRequired?: boolean
    extraCapabilities?: string[]
    draftId?: string
    linkedAt: number
  }

  // Customer Journey / Engagement Roadmap
  customerJourney?: CustomerJourney

  // Apps That Matter (ATM) Qualification Score (computed, not persisted)
  atmScore?: ATMScore

  // Responsible AI Impact Assessment (populated by governance engine)
  responsibleAIImpact?: ResponsibleAIImpact

  // ATS Enablement: Consumption, partner, workload linkage
  consumptionEstimate?: ConsumptionEstimate
  partner?: WorkloadPartner
  linkedWorkloadIds?: string[]      // Workloads this use case depends on or enhances

  // ============================================================================
  // LGROLNP (Khalsa) — "Move off the solution" gate + qualify-out support.
  // ============================================================================
  /** Pursue/defer/no-go disposition. Defaults to 'pursue' implicitly when undefined. */
  disposition?: 'pursue' | 'defer' | 'no-go'
  /** Why this was deferred or no-go'd (so future sessions don't re-litigate). */
  dispositionNote?: string
  /** True when the customer has confirmed the problem statement in their words. */
  problemConfirmed?: boolean
  /** Customer's problem statement (their words, not the seller's framing). */
  problemStatement?: string
  /**
   * Khalsa: explicit ignorance. Open questions surfaced during discovery
   * that block confident progression. Each item can be resolved (answered)
   * inline so the audit trail of what was unknown survives.
   */
  openQuestions?: Array<{
    id: string
    question: string
    answer?: string
    askedAt: number
    answeredAt?: number
  }>
}

export type QualificationSignalStatus = 'unknown' | 'weak' | 'confirmed'

export interface QualificationSignal {
  status: QualificationSignalStatus
  evidence?: string
  stakeholderId?: string
}

export interface BantQualification {
  budget: QualificationSignal
  authority: QualificationSignal
  need: QualificationSignal
  timeline: QualificationSignal
  updatedAt?: number
}

export type RaciRole = 'responsible' | 'accountable' | 'consulted' | 'informed'

export interface RaciAssignment {
  stakeholderId: string
  role: RaciRole
}

// ============================================================================
// AI GOVERNANCE TYPES
// ============================================================================

/** The 6 governance dimensions aligned with MS Responsible AI Standard & NIST AI RMF */
export type AIGovernanceDimension =
  | 'ai-strategy'
  | 'data-governance'
  | 'model-lifecycle'
  | 'ethics-fairness'
  | 'security-privacy'
  | 'monitoring-accountability'

export const AI_GOVERNANCE_DIMENSION_LABELS: Record<AIGovernanceDimension, string> = {
  'ai-strategy': 'AI Strategy',
  'data-governance': 'Data Governance',
  'model-lifecycle': 'Model Lifecycle',
  'ethics-fairness': 'Ethics & Fairness',
  'security-privacy': 'Security & Privacy',
  'monitoring-accountability': 'Monitoring & Accountability',
}

export const AI_GOVERNANCE_DIMENSION_DESCRIPTIONS: Record<AIGovernanceDimension, string> = {
  'ai-strategy': 'Organization-wide AI vision, roadmap, investment priorities, and executive sponsorship',
  'data-governance': 'Data quality, lineage, cataloging, access controls, and AI-readiness of data assets',
  'model-lifecycle': 'Model development, versioning, testing, documentation (model cards), and retirement processes',
  'ethics-fairness': 'Bias assessment, fairness metrics, AI ethics board, inclusive design, and impact assessments',
  'security-privacy': 'AI-specific threat modeling, adversarial robustness, PII handling, differential privacy, and red-teaming',
  'monitoring-accountability': 'Production monitoring, drift detection, incident response, audit trails, and human oversight escalation',
}

/** 5-level maturity scale matching industry standards (CMMI-style) */
export type AIGovernanceMaturityLevel = 'ad-hoc' | 'developing' | 'defined' | 'managed' | 'optimized'

export const AI_GOVERNANCE_MATURITY_CONFIG: Record<AIGovernanceMaturityLevel, {
  label: string
  description: string
  numericValue: number
  color: string
}> = {
  'ad-hoc': { label: 'Ad-hoc', description: 'No formal processes; AI governance is reactive', numericValue: 1, color: '#ef4444' },
  'developing': { label: 'Developing', description: 'Basic awareness; some informal practices emerging', numericValue: 2, color: '#f97316' },
  'defined': { label: 'Defined', description: 'Documented policies and processes; consistent application', numericValue: 3, color: '#eab308' },
  'managed': { label: 'Managed', description: 'Measured and controlled; continuous improvement', numericValue: 4, color: '#22c55e' },
  'optimized': { label: 'Optimized', description: 'Industry-leading; automated governance integrated into CI/CD', numericValue: 5, color: '#3b82f6' },
}

/** A single governance gap identified by the deterministic engine */
export interface GovernanceGap {
  dimension: AIGovernanceDimension
  currentLevel: AIGovernanceMaturityLevel
  targetLevel: AIGovernanceMaturityLevel
  gap: string
  impact: 'high' | 'medium' | 'low'
}

/** A governance recommendation (deterministic or AI-generated) */
export interface GovernanceRecommendation {
  id: string
  dimension: AIGovernanceDimension
  priority: 'critical' | 'recommended' | 'optional'
  action: string
  rationale: string
  timeframe: 'short-term' | 'medium-term' | 'long-term'
  referenceFramework?: string
  acknowledged?: boolean
}

/** AI-generated governance action plan */
export interface GovernanceActionPlan {
  shortTerm: GovernanceRecommendation[]   // 0-3 months
  mediumTerm: GovernanceRecommendation[]  // 3-12 months
  longTerm: GovernanceRecommendation[]    // 12+ months
  overallReadinessStatement: string
  generatedAt: number
}

/** Complete AI Governance Assessment attached to a session */
export interface AIGovernanceAssessment {
  dimensionScores: Record<AIGovernanceDimension, AIGovernanceMaturityLevel>
  overallMaturity: number  // 1-5 average
  overallMaturityLabel: AIGovernanceMaturityLevel
  gaps: GovernanceGap[]
  recommendations: GovernanceRecommendation[]
  actionPlan?: GovernanceActionPlan
  assessedAt: number
}

/** The 6 Microsoft Responsible AI Principles for per-use-case impact assessment */
export type ResponsibleAIPrinciple =
  | 'fairness'
  | 'reliability-safety'
  | 'privacy-security'
  | 'inclusiveness'
  | 'transparency'
  | 'accountability'

export const RESPONSIBLE_AI_PRINCIPLE_LABELS: Record<ResponsibleAIPrinciple, string> = {
  'fairness': 'Fairness',
  'reliability-safety': 'Reliability & Safety',
  'privacy-security': 'Privacy & Security',
  'inclusiveness': 'Inclusiveness',
  'transparency': 'Transparency',
  'accountability': 'Accountability',
}

export const RESPONSIBLE_AI_PRINCIPLE_DESCRIPTIONS: Record<ResponsibleAIPrinciple, string> = {
  'fairness': 'AI systems should treat all people fairly — assess and mitigate bias in training data, model outputs, and decision-making',
  'reliability-safety': 'AI systems should perform reliably and safely under expected and unexpected conditions',
  'privacy-security': 'AI systems should be secure and respect privacy — protect personal data and resist adversarial attacks',
  'inclusiveness': 'AI systems should empower everyone and engage people — design for diverse users and accessibility needs',
  'transparency': 'AI systems should be understandable — provide explanations, disclose AI involvement, and document model behavior',
  'accountability': 'People should be accountable for AI systems — establish human oversight, governance, and redress mechanisms',
}

/** Per-principle risk assessment within RAIA */
export interface RAIPrincipleAssessment {
  principle: ResponsibleAIPrinciple
  risk: AIRiskLevel
  reason: string
  mitigations?: string[]
}

/** Responsible AI Impact Assessment for a single use case */
export interface ResponsibleAIImpact {
  overallRisk: AIRiskLevel
  principleAssessments: RAIPrincipleAssessment[]
  involvesDecisionsAboutPeople: boolean
  protectedClassesAffected?: string[]
  fairnessMetricsRecommended?: string[]
  humanOversightRequired: boolean
  modelDocumentationRequired: boolean
  assessedAt: number
}

// ============================================================================
// SOVEREIGN CLOUD & DATA RESIDENCY TYPES
// ============================================================================

/**
 * Azure cloud environments — determines endpoint resolution, auth, and service availability.
 */
export type SovereignCloudEnvironment =
  | 'azure-public'                // Azure Commercial (global)
  | 'azure-government'            // Azure Government (US FedRAMP / IL4)
  | 'azure-government-dod'        // Azure Government DoD (IL5/IL6)
  | 'azure-china-21vianet'        // Azure China operated by 21Vianet
  | 'azure-eu-boundary'           // Azure EU Data Boundary (GDPR/EU AI Act)
  | 'azure-local'                 // Azure Local (on-premises, formerly Azure Stack HCI)
  | 'azure-arc'                   // Azure Arc-managed hybrid resources
  | 'disconnected'                // Fully air-gapped / disconnected cloud
  | 'private-cloud'               // Non-Azure private cloud infrastructure
  | 'foundry-local'               // Foundry Local — on-premises AI model runtime

/**
 * Sovereign Azure region codes for data residency.
 */
export type SovereignCloudRegion =
  // Azure Government
  | 'usgovvirginia' | 'usgovarizona' | 'usgovtexas' | 'usdodcentral' | 'usdodeast'
  // Azure China 21Vianet
  | 'chinanorth3' | 'chinaeast3'
  // EU Data Boundary (standard regions, but with data boundary controls)
  | 'westeurope' | 'northeurope' | 'germanywestcentral' | 'francecentral' | 'swedencentral' | 'switzerlandnorth'
  // Africa
  | 'southafricanorth' | 'southafricawest'
  // Middle East
  | 'uaenorth' | 'qatarcentral' | 'israelcentral'
  // Other
  | string  // Allow custom regions

/**
 * Level of enforcement for sovereign cloud requirements.
 */
export type SovereignCloudMandateLevel = 'required' | 'recommended' | 'optional'

/**
 * Data residency requirement derived from regulatory frameworks and entity type.
 */
export interface DataResidencyRequirement {
  requiredCloud: SovereignCloudEnvironment
  requiredRegions: SovereignCloudRegion[]
  mandateLevel: SovereignCloudMandateLevel
  dataClassification: DataClassification
  crossBorderTransferAllowed: boolean
  justification: string             // Why this cloud/region is required
  triggeringFrameworks: AIRegulationFramework[] // Which regulations drive this
}

/**
 * A gap identified in sovereign cloud readiness.
 */
export interface SovereignCloudGap {
  id: string
  dimension: string                 // e.g., 'endpoint-routing', 'service-availability', 'auth-model'
  description: string
  impact: 'high' | 'medium' | 'low'
  recommendation: string
}

/**
 * Service availability check result for a sovereign cloud.
 */
export interface SovereignServiceCheck {
  service: string                   // e.g., 'Azure OpenAI', 'Document Intelligence'
  availableInCloud: boolean
  availableModels?: string[]        // e.g., ['gpt-4o'] — which models are deployed
  limitations?: string              // e.g., 'Only GPT-4o, no Phi-4'
}

/**
 * Cross-border data flow assessment.
 */
export interface CrossBorderDataFlow {
  sourceJurisdiction: string
  targetCloud: SovereignCloudEnvironment
  targetRegion: SovereignCloudRegion
  dataTypes: string[]               // e.g., ['AI prompts', 'customer business data']
  permitted: boolean
  mechanism?: string                // e.g., 'EU Standard Contractual Clauses', 'FedRAMP ATO'
  risk: AIRiskLevel
}

// ── Configuration constants ──

export const SOVEREIGN_CLOUD_LABELS: Record<SovereignCloudEnvironment, string> = {
  'azure-public': 'Azure Commercial (Global)',
  'azure-government': 'Azure Government (US)',
  'azure-government-dod': 'Azure Government DoD',
  'azure-china-21vianet': 'Azure China (21Vianet)',
  'azure-eu-boundary': 'Azure EU Data Boundary',
  'azure-local': 'Azure Local (On-Premises)',
  'azure-arc': 'Azure Arc (Hybrid)',
  'disconnected': 'Disconnected / Air-Gapped',
  'private-cloud': 'Private Cloud',
  'foundry-local': 'Foundry Local (On-Premises AI)',
}

export const SOVEREIGN_CLOUD_CONFIG: Record<SovereignCloudEnvironment, {
  label: string
  endpointSuffix: string
  authType: 'key' | 'entra-id' | 'both'
  openAIDomain: string
  cognitiveServicesDomain: string
  availableRegions: SovereignCloudRegion[]
  apiVersion: string
  color: string
}> = {
  'azure-public': {
    label: 'Azure Commercial',
    endpointSuffix: '.azure.com',
    authType: 'both',
    openAIDomain: 'openai.azure.com',
    cognitiveServicesDomain: 'cognitiveservices.azure.com',
    availableRegions: ['westeurope', 'northeurope', 'southafricanorth', 'southafricawest', 'uaenorth', 'qatarcentral', 'swedencentral', 'francecentral', 'germanywestcentral', 'switzerlandnorth'],
    apiVersion: '2024-08-01-preview',
    color: '#3b82f6',
  },
  'azure-government': {
    label: 'Azure Government',
    endpointSuffix: '.azure.us',
    authType: 'entra-id',
    openAIDomain: 'openai.azure.us',
    cognitiveServicesDomain: 'cognitiveservices.azure.us',
    availableRegions: ['usgovvirginia', 'usgovarizona', 'usgovtexas'],
    apiVersion: '2024-06-01',
    color: '#1d4ed8',
  },
  'azure-government-dod': {
    label: 'Azure Government DoD',
    endpointSuffix: '.azure.us',
    authType: 'entra-id',
    openAIDomain: 'openai.azure.us',
    cognitiveServicesDomain: 'cognitiveservices.azure.us',
    availableRegions: ['usdodcentral', 'usdodeast'],
    apiVersion: '2024-06-01',
    color: '#1e3a5f',
  },
  'azure-china-21vianet': {
    label: 'Azure China',
    endpointSuffix: '.azure.cn',
    authType: 'key',
    openAIDomain: 'openai.azure.cn',
    cognitiveServicesDomain: 'cognitiveservices.azure.cn',
    availableRegions: ['chinanorth3', 'chinaeast3'],
    apiVersion: '2024-06-01',
    color: '#dc2626',
  },
  'azure-eu-boundary': {
    label: 'Azure EU Data Boundary',
    endpointSuffix: '.azure.com',
    authType: 'both',
    openAIDomain: 'openai.azure.com',
    cognitiveServicesDomain: 'cognitiveservices.azure.com',
    availableRegions: ['westeurope', 'northeurope', 'germanywestcentral', 'francecentral', 'swedencentral', 'switzerlandnorth'],
    apiVersion: '2024-08-01-preview',
    color: '#0ea5e9',
  },
  'azure-local': {
    label: 'Azure Local',
    endpointSuffix: '.local',
    authType: 'entra-id',
    openAIDomain: 'N/A — on-premises',
    cognitiveServicesDomain: 'N/A — on-premises',
    availableRegions: ['on-premises'],
    apiVersion: 'N/A',
    color: '#8b5cf6',
  },
  'azure-arc': {
    label: 'Azure Arc',
    endpointSuffix: '.azure.com',
    authType: 'entra-id',
    openAIDomain: 'arc-managed',
    cognitiveServicesDomain: 'arc-managed',
    availableRegions: ['on-premises', 'edge'],
    apiVersion: '2024-08-01-preview',
    color: '#06b6d4',
  },
  'disconnected': {
    label: 'Disconnected / Air-Gapped',
    endpointSuffix: 'N/A',
    authType: 'key',
    openAIDomain: 'N/A — air-gapped',
    cognitiveServicesDomain: 'N/A — air-gapped',
    availableRegions: ['on-premises'],
    apiVersion: 'N/A',
    color: '#f59e0b',
  },
  'private-cloud': {
    label: 'Private Cloud',
    endpointSuffix: 'N/A',
    authType: 'both',
    openAIDomain: 'N/A — private',
    cognitiveServicesDomain: 'N/A — private',
    availableRegions: ['on-premises'],
    apiVersion: 'N/A',
    color: '#64748b',
  },
  'foundry-local': {
    label: 'Foundry Local',
    endpointSuffix: '.local',
    authType: 'key',
    openAIDomain: 'foundry-local',
    cognitiveServicesDomain: 'foundry-local',
    availableRegions: ['on-premises', 'edge'],
    apiVersion: 'N/A',
    color: '#ec4899',
  },
}

export const SOVEREIGN_REGION_LABELS: Record<string, string> = {
  // Azure Government
  usgovvirginia: 'US Gov Virginia',
  usgovarizona: 'US Gov Arizona',
  usgovtexas: 'US Gov Texas',
  usdodcentral: 'US DoD Central',
  usdodeast: 'US DoD East',
  // Azure China
  chinanorth3: 'China North 3',
  chinaeast3: 'China East 3',
  // EU
  westeurope: 'West Europe (Netherlands)',
  northeurope: 'North Europe (Ireland)',
  germanywestcentral: 'Germany West Central',
  francecentral: 'France Central',
  swedencentral: 'Sweden Central',
  switzerlandnorth: 'Switzerland North',
  // Africa
  southafricanorth: 'South Africa North',
  southafricawest: 'South Africa West',
  // Middle East
  uaenorth: 'UAE North',
  qatarcentral: 'Qatar Central',
  israelcentral: 'Israel Central',
  // On-premises / Edge
  'on-premises': 'On-Premises',
  'edge': 'Edge Location',
}

// ============================================================================
// DEPLOYMENT MODEL & SOVEREIGN CLOUD TRACK TYPES
// ============================================================================

/**
 * Deployment model — the target environment class for workloads.
 */
export type DeploymentModel =
  | 'public-cloud'
  | 'sovereign-cloud'
  | 'azure-local'
  | 'azure-arc'
  | 'disconnected'
  | 'foundry-local'
  | 'private-cloud'
  | 'hybrid'

export const DEPLOYMENT_MODEL_LABELS: Record<DeploymentModel, string> = {
  'public-cloud': 'Azure Public Cloud',
  'sovereign-cloud': 'Sovereign Cloud',
  'azure-local': 'Azure Local (On-Premises)',
  'azure-arc': 'Azure Arc (Hybrid)',
  'disconnected': 'Disconnected / Air-Gapped',
  'foundry-local': 'Foundry Local (On-Premises AI)',
  'private-cloud': 'Private Cloud',
  'hybrid': 'Hybrid (Multi-Environment)',
}

export const DEPLOYMENT_MODEL_DESCRIPTIONS: Record<DeploymentModel, string> = {
  'public-cloud': 'Standard Azure commercial cloud with full service catalog and global availability',
  'sovereign-cloud': 'Azure Government, EU Data Boundary, or China 21Vianet — regulatory-mandated environments',
  'azure-local': 'Azure Local (formerly Azure Stack HCI) — Azure services running on customer-owned hardware on-premises',
  'azure-arc': 'Azure Arc-enabled infrastructure — manage on-prem, multi-cloud, and edge resources from Azure control plane',
  'disconnected': 'Fully air-gapped environment with no internet connectivity — requires offline deployment and update processes',
  'foundry-local': 'Microsoft Foundry Local — run AI models on-premises with local inference, no cloud dependency',
  'private-cloud': 'Non-Azure private cloud infrastructure (VMware, OpenStack, Hyper-V)',
  'hybrid': 'Combination of cloud and on-premises environments connected via Arc or VPN/ExpressRoute',
}

/**
 * Connectivity level — determines what deployment models are viable.
 */
export type ConnectivityLevel = 'always-on' | 'intermittent' | 'air-gapped'

/**
 * Data classification level — drives sovereign cloud and deployment model selection.
 */
export type DataClassificationLevel = 'public' | 'internal' | 'confidential' | 'restricted' | 'top-secret'

/**
 * Latency requirement — influences edge/on-prem vs cloud decisions.
 */
export type LatencyRequirement = 'tolerant' | 'sensitive' | 'real-time'

/**
 * Constraints that drive the deployment model decision tree.
 */
export interface DeploymentConstraints {
  connectivity: ConnectivityLevel
  dataClassification: DataClassificationLevel
  latencyRequirements: LatencyRequirement
  regulatoryFrameworks: string[]        // e.g., ['fedramp', 'gdpr', 'popia']
  physicalLocation?: string             // e.g., 'South Africa', 'UAE'
  edgeRequirements?: string             // free-text description
  aiWorkloadType?: string               // e.g., 'inference-only', 'training-and-inference', 'rag'
  existingInfrastructure?: string        // e.g., 'Azure Local', 'VMware vSphere', 'bare metal'
  isGovernmentWorkload: boolean
  governmentClassificationLevel?: string // e.g., 'IL4', 'IL5', 'IL6', 'unclassified'
  requiresFoundryLocal: boolean
  requiresAzureArc: boolean
  hybridAcceptable: boolean
}

/**
 * The output of the deployment-model decision engine.
 */
export interface DeploymentRecommendation {
  primaryModel: DeploymentModel
  primaryCloudEnvironment?: SovereignCloudEnvironment
  fallbackModel?: DeploymentModel
  rationale: string
  architecturePattern: string            // e.g., 'Hub-spoke with Arc-managed edge nodes'
  serviceAvailability: SovereignServiceCheck[]
  gaps: SovereignCloudGap[]
  foundryLocalCapabilities?: FoundryLocalCapability[]
  readinessScore: number                 // 0-100
}

/**
 * Foundry Local model capability — what can run on-premises.
 */
export interface FoundryLocalCapability {
  modelName: string                      // e.g., 'Phi-4', 'Phi-3.5-mini'
  modelFamily: string                    // e.g., 'Phi', 'Mistral'
  supportedTasks: string[]               // e.g., ['chat', 'completion', 'embedding']
  minGPUMemoryGB: number
  onnxSupported: boolean
  quantizationOptions: string[]          // e.g., ['INT4', 'INT8', 'FP16']
  maxContextTokens: number
}

/**
 * Current-state maturity — migrated from AI Assessment Lite.
 */
export interface CurrentStateMaturity {
  techStackMaturity: 'legacy' | 'modernizing' | 'modern' | 'cloud-native'
  dataMaturity: 'siloed' | 'integrated' | 'governed' | 'ai-ready'
  cloudReadiness: 'on-premises' | 'hybrid' | 'cloud-first' | 'cloud-native'
  aiUsage: 'none' | 'experimental' | 'pilot' | 'production'
  aiGovernance: 'yes' | 'no' | 'unknown'
}

// ============================================================================
// ATS (ACCOUNT TECHNOLOGY STRATEGIST) ENABLEMENT TYPES
// ============================================================================

/**
 * User persona — controls feature visibility, discovery track defaults,
 * and label styling. Not a security boundary; purely UX adaptation.
 */
export type UserRole = 'innovation-hub' | 'ats' | 'csa' | 'sales' | 'csam'

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  'innovation-hub': 'Innovation Hub',
  'ats': 'Account Technology Strategist',
  'csa': 'Cloud Solution Architect',
  'sales': 'Account Executive / Sales',
  'csam': 'Customer Success Account Manager',
}

export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  'innovation-hub': 'Innovation Hub facilitated customer engagement with AI-focused discovery',
  'ats': 'Account-level technology strategy with full portfolio, MACC tracking, and workload planning',
  'csa': 'Azure solution architecture, Well-Architected Review, and technical assessments',
  'sales': 'Opportunity qualification, stakeholder mapping, and executive business cases',
  'csam': 'Post-sale value realisation: customer health, adoption, financial impact, and Customer Success Plan / CSDR guidance',
}

export const USER_ROLE_ICONS: Record<UserRole, string> = {
  'innovation-hub': '💡',
  'ats': '🗺️',
  'csa': '🏗️',
  'sales': '📊',
  'csam': '🤝',
}

/** Feature visibility matrix per user role */
export const USER_ROLE_FEATURES: Record<UserRole, {
  showAccountDashboard: boolean
  showMACCTracking: boolean
  showWorkloads: boolean
  showFullPortfolioDiscovery: boolean
  showInfraDiscovery: boolean
  showModernWorkDiscovery: boolean
  showAIDiscovery: boolean
  showEnterpriseDiscovery: boolean
  showAccountTechPlan: boolean
  showATMScoring: boolean
  showGovernanceAssessment: boolean
  showSovereignCloudTrack: boolean
  defaultDiscoveryTrack: string
}> = {
  'innovation-hub': {
    showAccountDashboard: false,
    showMACCTracking: false,
    showWorkloads: false,
    showFullPortfolioDiscovery: false,
    showInfraDiscovery: false,
    showModernWorkDiscovery: false,
    showAIDiscovery: true,
    showEnterpriseDiscovery: true,
    showAccountTechPlan: false,
    showATMScoring: true,
    showGovernanceAssessment: true,
    showSovereignCloudTrack: true,
    defaultDiscoveryTrack: 'use-case',
  },
  'ats': {
    showAccountDashboard: true,
    showMACCTracking: true,
    showWorkloads: true,
    showFullPortfolioDiscovery: true,
    showInfraDiscovery: true,
    showModernWorkDiscovery: true,
    showAIDiscovery: true,
    showEnterpriseDiscovery: true,
    showAccountTechPlan: true,
    showATMScoring: true,
    showGovernanceAssessment: true,
    showSovereignCloudTrack: true,
    defaultDiscoveryTrack: 'full-portfolio',
  },
  'csa': {
    showAccountDashboard: false,
    showMACCTracking: false,
    showWorkloads: true,
    showFullPortfolioDiscovery: false,
    showInfraDiscovery: true,
    showModernWorkDiscovery: false,
    showAIDiscovery: true,
    showEnterpriseDiscovery: false,
    showAccountTechPlan: false,
    showATMScoring: true,
    showGovernanceAssessment: true,
    showSovereignCloudTrack: true,
    defaultDiscoveryTrack: 'use-case',
  },
  'sales': {
    showAccountDashboard: true,
    showMACCTracking: true,
    showWorkloads: false,
    showFullPortfolioDiscovery: true,
    showInfraDiscovery: false,
    showModernWorkDiscovery: false,
    showAIDiscovery: true,
    showEnterpriseDiscovery: true,
    showAccountTechPlan: false,
    showATMScoring: true,
    showGovernanceAssessment: false,
    showSovereignCloudTrack: true,
    defaultDiscoveryTrack: 'use-case',
  },
  'csam': {
    showAccountDashboard: true,
    showMACCTracking: true,
    showWorkloads: true,
    showFullPortfolioDiscovery: false,
    showInfraDiscovery: false,
    showModernWorkDiscovery: false,
    showAIDiscovery: true,
    showEnterpriseDiscovery: false,
    showAccountTechPlan: false,
    showATMScoring: false,
    showGovernanceAssessment: true,
    showSovereignCloudTrack: true,
    defaultDiscoveryTrack: 'use-case',
  },
}

// ============================================================================
// ACCOUNT ENTITY — Aggregates sessions, MACC, and workloads per customer
// ============================================================================

export type FiscalQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export type AccountTeamRole = 'ats' | 'csa' | 'ae' | 'csam' | 'ssp' | 'tsp' | 'innovation-hub-spoc' | 'solution-engineer'

export const ACCOUNT_TEAM_ROLE_LABELS: Record<AccountTeamRole, string> = {
  'ats': 'Account Technology Strategist',
  'csa': 'Cloud Solution Architect',
  'ae': 'Account Executive',
  'csam': 'Customer Success Account Manager',
  'ssp': 'Solution Sales Professional',
  'tsp': 'Technical Sales Professional',
  'innovation-hub-spoc': 'Innovation Hub SPOC',
  'solution-engineer': 'Solution Engineer',
}

export interface AccountTeamMember {
  name: string
  role: AccountTeamRole
  email?: string
}

export interface MACCCommitment {
  totalAmount: number             // Total MACC commitment in USD
  startDate: number               // Commitment start (timestamp)
  endDate: number                 // Commitment end (timestamp)
  remainingBalance: number        // Remaining commitment balance
  currentACR: number              // Current Azure Consumed Revenue (monthly)
  lastUpdated: number             // Timestamp of last update
  notes?: string                  // E.g., "Renewed FY26 H1"
}

export type AccountHealthRating = 'healthy' | 'at-risk' | 'critical' | 'unknown'

export interface Account {
  id: string
  name: string                    // Account / customer name
  accountSegment: AccountSegment
  team: AccountTeamMember[]
  maccCommitment?: MACCCommitment
  fiscalYear?: string             // E.g., "FY26"
  fiscalQuarter?: FiscalQuarter
  sessionIds: string[]            // Linked DiscoverySession IDs
  workloadIds: string[]           // Linked Workload IDs
  healthRating: AccountHealthRating
  healthNotes?: string
  technologyPlanSummary?: string  // Free-form ATS technology plan summary
  createdAt: number
  updatedAt?: number
}

// ============================================================================
// MACC / CONSUMPTION TRACKING
// ============================================================================

export type ConsumptionTShirt = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export const CONSUMPTION_TSHIRT_RANGES: Record<ConsumptionTShirt, {
  label: string
  minMonthly: number
  maxMonthly: number
}> = {
  xs: { label: 'XS (< $1 K/mo)', minMonthly: 0, maxMonthly: 1000 },
  sm: { label: 'S ($1 K–$5 K/mo)', minMonthly: 1000, maxMonthly: 5000 },
  md: { label: 'M ($5 K–$25 K/mo)', minMonthly: 5000, maxMonthly: 25000 },
  lg: { label: 'L ($25 K–$100 K/mo)', minMonthly: 25000, maxMonthly: 100000 },
  xl: { label: 'XL ($100 K+/mo)', minMonthly: 100000, maxMonthly: Infinity },
}

/** Per-use-case consumption estimate */
export interface ConsumptionEstimate {
  tShirtSize: ConsumptionTShirt
  estimatedMonthly: number         // Estimated monthly Azure consumption in USD
  primaryServices: string[]        // Azure services driving consumption
  assumptions?: string             // Estimation notes
  estimatedAt?: number
}

// ============================================================================
// WORKLOAD MODEL — Migration, modernization, and infrastructure workloads
// ============================================================================

export type WorkloadType = 'migration' | 'modernization' | 'new-build' | 'optimization'

export const WORKLOAD_TYPE_LABELS: Record<WorkloadType, string> = {
  'migration': 'Migration',
  'modernization': 'Modernization',
  'new-build': 'New Build',
  'optimization': 'Optimization',
}

export type SolutionArea =
  | 'infrastructure'
  | 'data-ai'
  | 'digital-app-innovation'
  | 'modern-work'
  | 'security'
  | 'biz-apps'

export const SOLUTION_AREA_LABELS: Record<SolutionArea, string> = {
  'infrastructure': 'Infrastructure',
  'data-ai': 'Data & AI',
  'digital-app-innovation': 'Digital & App Innovation',
  'modern-work': 'Modern Work',
  'security': 'Security',
  'biz-apps': 'Business Applications',
}

export const SOLUTION_AREA_COLORS: Record<SolutionArea, string> = {
  'infrastructure': '#0078D4',      // Azure blue
  'data-ai': '#8661C5',             // Purple
  'digital-app-innovation': '#00A4EF', // Light blue
  'modern-work': '#7FBA00',         // Green
  'security': '#F25022',            // Red
  'biz-apps': '#FFB900',            // Yellow
}

export type ModernizationPath = 'rehost' | 'refactor' | 'rearchitect' | 'rebuild' | 'replace'

export const MODERNIZATION_PATH_LABELS: Record<ModernizationPath, string> = {
  'rehost': 'Rehost (Lift & Shift)',
  'refactor': 'Refactor (Repackage)',
  'rearchitect': 'Rearchitect',
  'rebuild': 'Rebuild',
  'replace': 'Replace (SaaS)',
}

export type CompetitorPlatform =
  | 'aws' | 'gcp' | 'oracle-cloud' | 'ibm-cloud'
  | 'salesforce' | 'servicenow' | 'sap-cloud' | 'vmware'
  | 'on-premises' | 'other'

export const COMPETITOR_PLATFORM_LABELS: Record<CompetitorPlatform, string> = {
  'aws': 'Amazon Web Services',
  'gcp': 'Google Cloud Platform',
  'oracle-cloud': 'Oracle Cloud',
  'ibm-cloud': 'IBM Cloud',
  'salesforce': 'Salesforce',
  'servicenow': 'ServiceNow',
  'sap-cloud': 'SAP Cloud',
  'vmware': 'VMware / Broadcom',
  'on-premises': 'On-Premises',
  'other': 'Other',
}

export type DisplacementFeasibility = 'high' | 'medium' | 'low' | 'none'

export interface WorkloadCompetitor {
  platform: CompetitorPlatform
  currentPosition: CompetitivePosition  // Reuses existing type
  displacementFeasibility: DisplacementFeasibility
  switchingCostEstimate?: ConsumptionTShirt  // T-shirt sizing for switching cost
  notes?: string
}

export interface WorkloadPartner {
  partnerName: string
  partnerType: 'isv' | 'si' | 'msp' | 'consulting'
  partnerRole: 'build' | 'run' | 'co-sell'
  partnerStatus: 'identified' | 'engaged' | 'committed'
}

export interface Workload {
  id: string
  accountId?: string              // Linked to Account
  name: string
  description: string
  type: WorkloadType
  solutionArea: SolutionArea
  sourceSystem?: string           // E.g., "SAP ERP 6.0", "SQL Server 2012", "VMware vSphere"
  targetServices: string[]        // Azure target services
  modernizationPath?: ModernizationPath
  consumptionEstimate?: ConsumptionEstimate
  migrationReadiness: number      // 0-100 readiness score
  blockers: string[]
  competitors: WorkloadCompetitor[]
  partner?: WorkloadPartner
  linkedUseCaseIds: string[]      // Use cases that depend on or enhance this workload
  endOfSupportDate?: string       // E.g., "2025-10-14" for SQL 2012 EOS
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'identified' | 'assessed' | 'planned' | 'in-progress' | 'completed'
  notes?: string
  createdAt: number
  updatedAt?: number
}

// ============================================================================
// ENGAGEMENT MODEL — Generalized engagement types beyond Innovation Hub
// ============================================================================

export type EngagementType =
  | 'innovation-hub'        // Original 4-phase IH methodology
  | 'ads'                   // Architecture Design Session
  | 'war'                   // Well-Architected Review
  | 'amsp'                  // Azure Migration & Modernization Program
  | 'partner-delivery'      // Partner-led delivery engagement
  | 'executive-briefing'    // Executive Briefing / Envision workshop
  | 'qbr'                   // Quarterly Business Review
  | 'poc'                   // Proof of Concept (standalone)
  | 'workshop'              // Generic technical workshop

export const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  'innovation-hub': 'Innovation Hub Engagement',
  'ads': 'Architecture Design Session (ADS)',
  'war': 'Well-Architected Review (WAR)',
  'amsp': 'Azure Migration & Modernization (AMSP)',
  'partner-delivery': 'Partner Delivery Engagement',
  'executive-briefing': 'Executive Briefing',
  'qbr': 'Quarterly Business Review (QBR)',
  'poc': 'Proof of Concept',
  'workshop': 'Technical Workshop',
}

export const ENGAGEMENT_TYPE_DESCRIPTIONS: Record<EngagementType, string> = {
  'innovation-hub': 'Facilitated 4-phase engagement: Business Envisioning → Solution Envisioning → Architecture Design → Rapid Prototype',
  'ads': 'Deep-dive architecture session to design Azure solution architecture for a specific workload',
  'war': 'Assessment against Azure Well-Architected Framework pillars with actionable recommendations',
  'amsp': 'Structured migration/modernization program with planning, assessment, and execution phases',
  'partner-delivery': 'Engagement delivered through an ISV or SI partner with Microsoft support',
  'executive-briefing': 'CxO-level session aligned to customer strategic priorities and Microsoft capabilities',
  'qbr': 'Quarterly account review covering consumption, adoption, roadmap, and success metrics',
  'poc': 'Focused proof of concept to validate a specific technical hypothesis or capability',
  'workshop': 'Hands-on technical workshop for a specific Azure service or scenario',
}

export interface EngagementPhaseTemplate {
  name: string
  description: string
  defaultDuration: string         // E.g., "1 week"
  deliverables: string[]
  keyQuestions: string[]
}

/** Pre-defined phase templates for each engagement type */
export const ENGAGEMENT_PHASE_TEMPLATES: Record<EngagementType, EngagementPhaseTemplate[]> = {
  'innovation-hub': [
    { name: 'Business Envisioning', description: 'Design thinking & use case prioritization', defaultDuration: '1-2 weeks', deliverables: ['Use case portfolio', 'Prioritization matrix', 'Strategic alignment map'], keyQuestions: ['What are the top business priorities?', 'Where is AI applicable?'] },
    { name: 'Solution Envisioning', description: 'Technical direction & Microsoft capabilities mapping', defaultDuration: '1-2 weeks', deliverables: ['Solution architecture concept', 'Microsoft solution mapping', 'Agentic opportunity analysis'], keyQuestions: ['What Microsoft services apply?', 'What data is available?'] },
    { name: 'Architecture Design', description: 'Reference architectures & scope definition', defaultDuration: '1-2 weeks', deliverables: ['Reference architecture', 'Cost estimation', 'Landing zone assessment'], keyQuestions: ['What is the target architecture?', 'What infrastructure is needed?'] },
    { name: 'Rapid Prototype', description: 'POC demo & technical validation', defaultDuration: '2-4 weeks', deliverables: ['Working POC', 'Validation report', 'Go/No-Go recommendation'], keyQuestions: ['What needs to be proven?', 'What are success criteria?'] },
  ],
  'ads': [
    { name: 'Preparation', description: 'Gather requirements, existing architecture, constraints', defaultDuration: '1 week', deliverables: ['Pre-read questionnaire', 'Current architecture inventory'], keyQuestions: ['What are the non-functional requirements?', 'What are the constraints?'] },
    { name: 'Design Session', description: 'Collaborative architecture design with whiteboarding', defaultDuration: '1-2 days', deliverables: ['Architecture diagram', 'Technology selection rationale', 'Security considerations'], keyQuestions: ['What are the availability requirements?', 'What is the data model?'] },
    { name: 'Documentation', description: 'Finalize architecture & produce deliverables', defaultDuration: '1 week', deliverables: ['Architecture Decision Record', 'Implementation roadmap', 'Cost estimate'], keyQuestions: ['Are all WAF pillars addressed?', 'What are the risks?'] },
  ],
  'war': [
    { name: 'Assessment', description: 'Evaluate workload against WAF pillars', defaultDuration: '1-2 weeks', deliverables: ['WAF assessment results', 'Pillar scorecards'], keyQuestions: ['Which pillars are weakest?', 'What is the SLA target?'] },
    { name: 'Recommendations', description: 'Prioritize improvements with actionable guidance', defaultDuration: '1 week', deliverables: ['Prioritized recommendation list', 'Effort-impact matrix'], keyQuestions: ['What improvements have highest impact?', 'What is the cost of remediation?'] },
    { name: 'Roadmap', description: 'Build implementation plan for recommendations', defaultDuration: '1 week', deliverables: ['Remediation roadmap', 'Quick wins list', 'Long-term improvements'], keyQuestions: ['What can be done in 30 days?', 'What needs budget approval?'] },
  ],
  'amsp': [
    { name: 'Assessment', description: 'Inventory, dependency mapping, readiness scoring', defaultDuration: '2-4 weeks', deliverables: ['Migration inventory', 'Readiness assessment', 'TCO analysis'], keyQuestions: ['What is the full server/app inventory?', 'What are the dependencies?'] },
    { name: 'Planning', description: 'Wave planning, migration path selection, landing zone', defaultDuration: '2-3 weeks', deliverables: ['Wave plan', 'Migration path per workload', 'Landing zone design'], keyQuestions: ['Which workloads migrate first?', 'What is the rollback strategy?'] },
    { name: 'Execution', description: 'Migration execution with validation gates', defaultDuration: '4-12 weeks', deliverables: ['Migrated workloads', 'Validation test results', 'Performance baselines'], keyQuestions: ['Are SLAs met post-migration?', 'What is the cutover schedule?'] },
    { name: 'Optimization', description: 'Post-migration optimization and consumption tuning', defaultDuration: '2-4 weeks', deliverables: ['Cost optimization report', 'Right-sizing recommendations', 'Monitoring setup'], keyQuestions: ['What can be right-sized?', 'Are reserved instances applicable?'] },
  ],
  'partner-delivery': [
    { name: 'Scoping', description: 'Define scope, roles, and responsibilities with partner', defaultDuration: '1-2 weeks', deliverables: ['Statement of Work', 'Partner delivery plan', 'Microsoft support plan'], keyQuestions: ['What is Microsoft role vs. partner role?', 'What are the escalation paths?'] },
    { name: 'Delivery', description: 'Partner-led implementation with Microsoft oversight', defaultDuration: '4-12 weeks', deliverables: ['Solution implementation', 'Progress reports', 'Risk log'], keyQuestions: ['Is the partner on track?', 'Are there technical blockers?'] },
    { name: 'Handoff', description: 'Knowledge transfer and operational readiness', defaultDuration: '1-2 weeks', deliverables: ['Operational runbook', 'Knowledge transfer sessions', 'Support plan'], keyQuestions: ['Can the customer operate independently?', 'Is support in place?'] },
  ],
  'executive-briefing': [
    { name: 'Preparation', description: 'Research account context, build tailored content', defaultDuration: '1 week', deliverables: ['Custom presentation deck', 'Demo environment', 'Leave-behind materials'], keyQuestions: ['What are the CxO priorities?', 'What has resonated in past meetings?'] },
    { name: 'Briefing', description: 'Executive presentation with interactive discussion', defaultDuration: '2-4 hours', deliverables: ['Meeting notes', 'Action items', 'Follow-up plan'], keyQuestions: ['What commitment can we ask for?', 'Who is the champion?'] },
  ],
  'qbr': [
    { name: 'Data Collection', description: 'Gather consumption, adoption, and success metrics', defaultDuration: '1 week', deliverables: ['Consumption dashboard', 'Adoption metrics', 'Success scorecard'], keyQuestions: ['Is MACC on track?', 'What new workloads are planned?'] },
    { name: 'QBR Meeting', description: 'Present findings, discuss roadmap, align on next quarter', defaultDuration: '1-2 hours', deliverables: ['QBR presentation', 'Updated account technology plan', 'Next quarter action items'], keyQuestions: ['What went well?', 'What needs escalation?'] },
  ],
  'poc': [
    { name: 'Definition', description: 'Define success criteria, scope, and timeline', defaultDuration: '1 week', deliverables: ['POC scope document', 'Success criteria', 'Environment requirements'], keyQuestions: ['What needs to be proven?', 'What is the decision criteria?'] },
    { name: 'Build', description: 'Develop and configure the proof of concept', defaultDuration: '2-4 weeks', deliverables: ['Working POC', 'Technical documentation'], keyQuestions: ['Is the architecture repeatable?', 'What shortcuts are acceptable?'] },
    { name: 'Evaluate', description: 'Test against criteria and present results', defaultDuration: '1 week', deliverables: ['Results report', 'Go/No-Go recommendation', 'Production path estimate'], keyQuestions: ['Did we meet success criteria?', 'What is the path to production?'] },
  ],
  'workshop': [
    { name: 'Preparation', description: 'Define agenda, prepare lab environment', defaultDuration: '1 week', deliverables: ['Workshop agenda', 'Lab guide', 'Pre-requisites checklist'], keyQuestions: ['What is the skill level of attendees?', 'What tools do they need?'] },
    { name: 'Workshop Delivery', description: 'Hands-on session with exercises', defaultDuration: '1-2 days', deliverables: ['Completed exercises', 'Workshop feedback', 'Next steps'], keyQuestions: ['Can attendees execute independently?', 'What follow-up is needed?'] },
  ],
}

// ============================================================================
// APPS THAT MATTER (ATM) QUALIFICATION SCORING
// ============================================================================

/**
 * ATM Qualification Tier — maps to Microsoft's FY26 "Apps That Matter" initiative.
 * 
 * NOTE: This is ID-8's quantified interpretation of ATM's qualitative checklist.
 * The official ATM criteria are pass/fail; this model provides a numerical assessment 
 * to help systematically strengthen opportunities before tagging them as ATM in pipeline.
 */
export type ATMTier = 'platinum' | 'gold' | 'silver' | 'not-qualified' | 'insufficient-data'

/**
 * The three ATM pillars for multi-pillar assessment.
 * ATM defines qualifying opportunities should span AI + Apps + Data.
 */
export type ATMPillar = 'ai' | 'apps' | 'data'

export const ATM_PILLAR_LABELS: Record<ATMPillar, string> = {
  ai: 'AI',
  apps: 'Apps',
  data: 'Data',
}

export const ATM_TIER_CONFIG: Record<ATMTier, {
  label: string
  description: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
  minScore: number
}> = {
  'platinum': {
    label: 'Platinum',
    description: 'Fully ATM-qualified — ready for pipeline tagging',
    color: 'text-purple-300',
    bgColor: 'bg-purple-500/15',
    borderColor: 'border-purple-500/40',
    icon: '✦',
    minScore: 80,
  },
  'gold': {
    label: 'Gold',
    description: 'Strong ATM candidate — minor gaps to address',
    color: 'text-amber-300',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/40',
    icon: '◆',
    minScore: 60,
  },
  'silver': {
    label: 'Silver',
    description: 'Promising but needs development in 1-2 dimensions',
    color: 'text-slate-300',
    bgColor: 'bg-slate-400/15',
    borderColor: 'border-slate-400/40',
    icon: '●',
    minScore: 40,
  },
  'not-qualified': {
    label: 'Not Yet Qualified',
    description: 'Significant gaps — review recommendations to elevate',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-muted',
    icon: '○',
    minScore: 0,
  },
  'insufficient-data': {
    label: 'Insufficient Data',
    description: 'Complete more assessments to receive an ATM qualification',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/30',
    borderColor: 'border-muted',
    icon: '…',
    minScore: 0,
  },
}

/**
 * Status of a single scoring component — distinguishes "scored low" from "not assessed"
 */
export type ATMComponentStatus = 'scored' | 'partial' | 'not-assessed'

/**
 * A single component within a dimension's scoring breakdown
 */
export interface ATMComponentScore {
  name: string
  maxPoints: number
  earnedPoints: number
  status: ATMComponentStatus
  explanation: string           // Human-readable explanation of how points were earned
  sourceFields: string[]        // Which data fields contributed (for transparency)
  recommendation?: string       // If not full points, what to do (actionable)
}

/**
 * Score for a single ATM dimension (e.g., Business Impact)
 */
export interface ATMDimensionScore {
  dimension: ATMDimension
  label: string
  weight: number                // 0-1, sums to 1.0 across all dimensions
  rawScore: number              // 0-100 (normalised against assessed components)
  componentsAssessed: number
  componentsTotal: number
  components: ATMComponentScore[]
  topRecommendation?: string    // Single most impactful action for this dimension
}

export type ATMDimension = 
  | 'business-impact'
  | 'innovation-agentic'
  | 'enterprise-grade'
  | 'multi-pillar'
  | 'repeatability'

export const ATM_DIMENSION_LABELS: Record<ATMDimension, string> = {
  'business-impact': 'Business Impact',
  'innovation-agentic': 'Innovation & Agentic',
  'enterprise-grade': 'Enterprise-Grade',
  'multi-pillar': 'Multi-Pillar',
  'repeatability': 'Repeatability',
}

export const ATM_DIMENSION_DESCRIPTIONS: Record<ATMDimension, string> = {
  'business-impact': 'Solves real business problems with measurable value',
  'innovation-agentic': 'Leverages agentic AI — autonomous, reasoning, adaptive',
  'enterprise-grade': 'Production-ready with security, compliance, governance',
  'multi-pillar': 'Spans AI + Apps + Data pillars for bigger, stickier deals',
  'repeatability': 'Built on proven blueprints and solution patterns',
}

/**
 * Complete ATM qualification score for a use case
 */
export interface ATMScore {
  compositeScore: number        // 0-100 weighted average
  tier: ATMTier
  confidence: number            // 0-100% — how many components have data
  dimensions: ATMDimensionScore[]
  pillarsCovered: ATMPillar[]   // Which of the 3 pillars are present
  gapRecommendations: ATMGapRecommendation[]   // Ordered by impact
  calculatedAt: number          // Timestamp
}

/**
 * A single actionable recommendation to improve the ATM score
 */
export interface ATMGapRecommendation {
  dimension: ATMDimension
  action: string                // Human-readable action, e.g. "Complete the regulatory assessment"
  potentialPointsGain: number   // How many composite points this could add
  priority: 'high' | 'medium' | 'low'
}

// ============================================================================
// CUSTOMER JOURNEY / ENGAGEMENT ROADMAP TYPES (Innovation Hub)
// ============================================================================

/**
 * Innovation Hub engagement types representing the structured approach to
 * moving from discovery to implementation.
 */
export type InnovationHubEngagement =
  | 'business-envisioning'     // Discover prioritized use cases through design thinking
  | 'solution-envisioning'     // Agree on technical direction and goals alignment
  | 'architecture-design'      // Synthesize requirements and align to reference architectures
  | 'rapid-prototype'          // Validate capabilities and accelerate decision making

/**
 * Default deliverables for each Innovation Hub engagement type
 */
export const ENGAGEMENT_DEFAULTS: Record<InnovationHubEngagement, {
  title: string
  description: string
  defaultDuration: string
  defaultDeliverables: string[]
  insightPrompts: string[]
  keyQuestions: string[]
  successMetrics: string[]
}> = {
  'business-envisioning': {
    title: 'Business Envisioning',
    description: 'Discover prioritized use cases through human-centered design thinking. Explore opportunities, challenges, and define next steps.',
    defaultDuration: '1-2 weeks',
    defaultDeliverables: [
      'Use case prioritization matrix',
      'Stakeholder alignment document',
      'Design thinking workshop outputs',
      'Opportunity assessment'
    ],
    insightPrompts: [
      'What pain points were identified during discovery?',
      'Which stakeholders need to be involved?',
      'What are the primary business drivers?'
    ],
    keyQuestions: [
      'Who are the key decision makers and influencers?',
      'What does success look like for this initiative?',
      'What constraints or blockers exist?'
    ],
    successMetrics: [
      'Stakeholder alignment achieved',
      'Use cases prioritized with clear rationale',
      'Next steps agreed upon'
    ]
  },
  'solution-envisioning': {
    title: 'Solution Envisioning',
    description: 'A strategic business and technical discussion to understand goals, offer insights, and envision the solution with Microsoft and partner capabilities.',
    defaultDuration: '1-2 weeks',
    defaultDeliverables: [
      'Technical direction document',
      'Solution concept diagram',
      'Microsoft capabilities mapping',
      'Partner ecosystem assessment'
    ],
    insightPrompts: [
      'What current systems need to integrate?',
      'What technical debt or constraints exist?',
      'What is the current technology maturity level?'
    ],
    keyQuestions: [
      'What Microsoft technologies are already in use?',
      'Are there specific compliance or security requirements?',
      'What is the timeline expectation?'
    ],
    successMetrics: [
      'Technical feasibility validated',
      'Solution architecture agreed',
      'Microsoft capabilities mapped to requirements'
    ]
  },
  'architecture-design': {
    title: 'Architecture Design',
    description: 'Synthesize business and technical requirements for initial scope and alignment to reference architectures to drive next steps.',
    defaultDuration: '2-3 weeks',
    defaultDeliverables: [
      'Reference architecture alignment',
      'Scope definition document',
      'Integration requirements',
      'Technical feasibility assessment',
      'Cost estimation'
    ],
    insightPrompts: [
      'What are the integration points identified?',
      'What data flows need to be considered?',
      'What are the scalability requirements?'
    ],
    keyQuestions: [
      'What reference architectures apply?',
      'What is the expected load/scale?',
      'What are the DR/HA requirements?'
    ],
    successMetrics: [
      'Architecture aligned to reference patterns',
      'Scope clearly defined and agreed',
      'Cost estimation provided'
    ]
  },
  'rapid-prototype': {
    title: 'Rapid Prototype',
    description: 'Demonstrate key technical capabilities of a solution and address challenges to accelerate decision making.',
    defaultDuration: '2-4 weeks',
    defaultDeliverables: [
      'Proof of concept demo',
      'Technical validation report',
      'Performance benchmarks',
      'Risk assessment',
      'Go/No-Go recommendation'
    ],
    insightPrompts: [
      'What are the highest risk technical unknowns?',
      'What needs to be proven to stakeholders?',
      'What integration challenges were flagged?'
    ],
    keyQuestions: [
      'What are the POC success criteria?',
      'Who needs to see the demo?',
      'What is the go/no-go decision framework?'
    ],
    successMetrics: [
      'Technical capabilities validated',
      'Stakeholder demo completed',
      'Go/No-Go decision made'
    ]
  }
}

/**
 * A single milestone in the customer journey roadmap
 */
export interface CustomerJourneyMilestone {
  id: string
  order: number
  title: string
  description: string
  engagement: InnovationHubEngagement
  duration: string                        // e.g., "1-2 weeks"
  deliverables: string[]
  dependencies: string[]                  // IDs of prerequisite milestones
  isComplete: boolean
  completedAt?: number
  notes?: string
  discoveryContext?: string               // Context from discovery insights
}

/**
 * A next step action item for the journey
 */
export interface JourneyNextStep {
  id: string
  action: string
  owner?: string                          // Optional assignee
  targetDate?: string                     // Optional target date (ISO string)
  isComplete: boolean
  completedAt?: number
}

/**
 * Edit history entry for undo functionality
 */
export interface JourneyEdit {
  id: string
  timestamp: number
  action: 'reorder' | 'duration' | 'deliverables' | 'notes' | 'complete' | 'reset' | 'title' | 'journeyNotes' | 'nextSteps'
  previousState: CustomerJourneyMilestone[]
  previousJourneyState?: Partial<CustomerJourney>  // For title/notes/nextSteps undo
  description: string
}

/**
 * Complete customer journey / engagement roadmap for a use case
 */
export interface CustomerJourney {
  useCaseId: string
  title?: string                          // Journey title
  journeyNotes?: string                   // Overall journey notes/context
  nextSteps?: JourneyNextStep[]           // Action items with optional owner/date
  milestones: CustomerJourneyMilestone[]
  totalDuration: string                   // e.g., "6-11 weeks"
  createdAt: number
  updatedAt?: number
  generatedBy: 'ai' | 'manual'
  editHistory: JourneyEdit[]              // For undo capability
  discoveryInsights?: {                   // Context from discovery session
    painPoints?: string[]
    stakeholders?: string[]
    constraints?: string[]
    opportunities?: string[]
  }
}

// ============================================================================
// FRONTIER AI ACCOUNT JOURNEY
// ============================================================================

export type AccountJourneyRecommendationStatus =
  | 'start-now'
  | 'next'
  | 'later'
  | 'assumed-in-place'
  | 'revisit-gap'

export interface FrontierReadinessAssessment {
  ratings: FrontierReadinessRatings
  evidence: Partial<Record<FrontierPillarId, string>>
  assessedAt: number
  assessedBy?: string
}

export interface JourneySourceSelection {
  sessionIds: string[]
  useCaseIds: string[]
}

export interface AccountJourneyMaturity {
  stage: FrontierMaturityStage
  description: string
  pillarsAtThreshold: number
  aiPillarsAtThreshold: number
  trustedPillarsAtThreshold: number
  agentifyPillarsAtThreshold: number
}

export interface AccountJourneyStep {
  id: string
  offeringId: FrontierOfferingId
  order: number
  publicationStatus: 'published' | 'draft'
  deliveryStage: FrontierDeliveryStage
  title: string
  duration: string
  recommendationStatus: AccountJourneyRecommendationStatus
  weakPillarIds: FrontierPillarId[]
  customerValue: string
  customerContext: string
  whyNow: string
  linkedUseCaseIds: string[]
  sourceSessionIds: string[]
  prerequisites: string[]
  participants: string[]
  customerCommitments: string[]
  focusAreas: string[]
  deliverables: string[]
  outcomes: string[]
  successCriteria: string[]
  owner?: string
  targetTiming?: string
  notes?: string
  isComplete: boolean
  completedAt?: number
}

export interface AccountJourneyWorkstream {
  id: FrontierWorkstreamId
  label: string
  steps: AccountJourneyStep[]
}

export interface AccountJourneyWarning {
  id: string
  offeringId?: FrontierOfferingId
  message: string
}

export interface AccountJourneyNextStep {
  id: string
  action: string
  owner?: string
  targetDate?: string
  isComplete: boolean
  completedAt?: number
}

export interface AccountCustomerJourney {
  id: string
  customerId: string
  accountId?: string
  customerName: string
  title: string
  ambition: string
  readiness: FrontierReadinessAssessment
  maturity: AccountJourneyMaturity
  sources: JourneySourceSelection
  workstreams: AccountJourneyWorkstream[]
  warnings: AccountJourneyWarning[]
  nextSteps: AccountJourneyNextStep[]
  catalogVersion: string
  generatedBy: 'deterministic' | 'ai-assisted'
  revision: number
  createdAt: number
  updatedAt: number
}

/**
 * Helper to calculate total duration from milestones
 */
export function calculateJourneyDuration(milestones: CustomerJourneyMilestone[]): string {
  let minWeeks = 0
  let maxWeeks = 0

  for (const m of milestones) {
    const match = m.duration.match(/(\d+)(?:\s*-\s*(\d+))?\s*week/i)
    if (match) {
      minWeeks += parseInt(match[1], 10)
      maxWeeks += parseInt(match[2] || match[1], 10)
    }
  }

  if (minWeeks === maxWeeks) {
    return `${minWeeks} weeks`
  }
  return `${minWeeks}-${maxWeeks} weeks`
}

/**
 * Generate default journey milestones based on implementation complexity
 */
export function generateDefaultJourneyMilestones(
  useCaseId: string,
  complexity: 'low' | 'medium' | 'high' | 'very-high' = 'medium'
): CustomerJourneyMilestone[] {
  const milestones: CustomerJourneyMilestone[] = []
  let order = 1

  // All journeys start with Business Envisioning
  milestones.push({
    id: `${useCaseId}-m${order}`,
    order: order++,
    title: ENGAGEMENT_DEFAULTS['business-envisioning'].title,
    description: ENGAGEMENT_DEFAULTS['business-envisioning'].description,
    engagement: 'business-envisioning',
    duration: ENGAGEMENT_DEFAULTS['business-envisioning'].defaultDuration,
    deliverables: [...ENGAGEMENT_DEFAULTS['business-envisioning'].defaultDeliverables],
    dependencies: [],
    isComplete: false
  })

  // Solution Envisioning for medium+ complexity
  if (complexity !== 'low') {
    milestones.push({
      id: `${useCaseId}-m${order}`,
      order: order++,
      title: ENGAGEMENT_DEFAULTS['solution-envisioning'].title,
      description: ENGAGEMENT_DEFAULTS['solution-envisioning'].description,
      engagement: 'solution-envisioning',
      duration: ENGAGEMENT_DEFAULTS['solution-envisioning'].defaultDuration,
      deliverables: [...ENGAGEMENT_DEFAULTS['solution-envisioning'].defaultDeliverables],
      dependencies: [`${useCaseId}-m1`],
      isComplete: false
    })
  }

  // Architecture Design for high+ complexity
  if (complexity === 'high' || complexity === 'very-high') {
    milestones.push({
      id: `${useCaseId}-m${order}`,
      order: order++,
      title: ENGAGEMENT_DEFAULTS['architecture-design'].title,
      description: ENGAGEMENT_DEFAULTS['architecture-design'].description,
      engagement: 'architecture-design',
      duration: ENGAGEMENT_DEFAULTS['architecture-design'].defaultDuration,
      deliverables: [...ENGAGEMENT_DEFAULTS['architecture-design'].defaultDeliverables],
      dependencies: [milestones[milestones.length - 1].id],
      isComplete: false
    })
  }

  // Rapid Prototype for all
  milestones.push({
    id: `${useCaseId}-m${order}`,
    order: order++,
    title: ENGAGEMENT_DEFAULTS['rapid-prototype'].title,
    description: ENGAGEMENT_DEFAULTS['rapid-prototype'].description,
    engagement: 'rapid-prototype',
    duration: complexity === 'very-high' ? '3-6 weeks' : ENGAGEMENT_DEFAULTS['rapid-prototype'].defaultDuration,
    deliverables: [...ENGAGEMENT_DEFAULTS['rapid-prototype'].defaultDeliverables],
    dependencies: [milestones[milestones.length - 1].id],
    isComplete: false
  })

  return milestones
}

// ============================================================================
// BUSINESS ENVISIONING TYPES (Innovation Hub Methodology Phase 1)
// ============================================================================

export type StrategicPrioritySource = 
  | 'earnings-call'
  | 'annual-report'
  | 'press-release'
  | 'stakeholder-interview'
  | 'discovery-session'
  | 'industry-research'

export interface StrategicPriority {
  id: string
  priority: string                      // e.g., "Digital Transformation", "Cost Optimization"
  source: StrategicPrioritySource
  sourceDetail?: string                 // e.g., "Q3 2024 Earnings Call"
  relevanceScore?: number               // 1-10
  linkedOutcomes?: string[]             // IDs of linked business outcomes
}

export interface BusinessOutcome {
  id: string
  category: 'revenue' | 'cost' | 'risk' | 'experience' | 'compliance' | 'efficiency'
  outcome: string                       // e.g., "Increase customer retention by 15%"
  metric: string                        // e.g., "Customer retention rate"
  currentValue?: string                 // e.g., "72%"
  targetValue?: string                  // e.g., "83%"
  timeframe?: string                    // e.g., "12 months"
  owner?: string
}

export interface ProcessPainPoint {
  id: string
  description: string
  impact: 'high' | 'medium' | 'low'
  isAIOpportunity: boolean              // Can AI address this pain point?
  aiInterventionType?: string           // e.g., "Automation", "Prediction", "Generation"
}

export interface ProcessStep {
  id: string
  order: number
  name: string
  description?: string
  owner?: string
  systems?: string[]                    // Systems involved in this step
  inputs?: string[]
  outputs?: string[]
  duration?: string                     // e.g., "2-3 hours"
  painPoints?: ProcessPainPoint[]
  aiOpportunity?: {
    description: string
    interventionType: 'automate' | 'augment' | 'analyze' | 'generate'
    potentialImpact: 'high' | 'medium' | 'low'
  }
}

export interface BusinessProcess {
  id: string
  name: string                          // e.g., "Invoice Processing"
  category: 'core' | 'support' | 'management'
  steps: ProcessStep[]
  owner?: string
  frequency?: string                    // e.g., "Daily", "Weekly"
  volumePerPeriod?: number              // e.g., 500 invoices/month
  currentCycleTime?: string             // e.g., "3-5 days"
  targetCycleTime?: string              // e.g., "< 1 day"
  totalPainPoints?: number
  totalAIOpportunities?: number
}

export type TechStackMaturity = 'legacy' | 'modernizing' | 'modern' | 'cloud-native'
export type DataMaturity = 'siloed' | 'integrated' | 'governed' | 'ai-ready'
export type CloudReadiness = 'on-premises' | 'hybrid' | 'cloud-first' | 'cloud-native'

// ============================================================================
// ARCHITECTURE LAYERS & PRINCIPLES (Conceptual Reference Architecture)
// ============================================================================

/**
 * 5-layer AI conceptual architecture model.
 * Each layer represents a distinct responsibility zone in an enterprise AI deployment.
 * Derived from the AI Engagement → AI Landing Zone → LZ Capabilities stack.
 */
export type ArchitectureLayer =
  | 'engagement'              // User-facing interfaces — apps, dashboards, Copilot, Bot Service
  | 'enterprise-capabilities' // Orchestration — Conversational AI, AI Agents, Agent Protocols, Automation Workflows
  | 'foundry-ai-services'    // Core AI engine — models, tools, agents, AI pipelines
  | 'ai-landing-zone'        // Foundation — AI/Gen AI Landing Zone, R&D sandbox, analytics/viz
  | 'lz-capabilities'        // Cross-cutting — LLMOps, DevOps, Monitoring, Logging

export const ARCHITECTURE_LAYER_LABELS: Record<ArchitectureLayer, string> = {
  'engagement': 'AI Engagement Layer',
  'enterprise-capabilities': 'AI Enterprise Capabilities',
  'foundry-ai-services': 'Foundry Models & AI Services',
  'ai-landing-zone': 'AI Landing Zone',
  'lz-capabilities': 'Other Landing Zone Capabilities',
}

/**
 * 8 architectural principles for AI solutions.
 * Extends the standard WAF 5 pillars with AI-specific concerns.
 */
export type ArchitecturePrinciple =
  | 'availability'
  | 'data-resilience'
  | 'cloud-native'
  | 'scalability'
  | 'observability'
  | 'security-compliance'
  | 'interoperability'
  | 'cost-optimization'

/**
 * Cloud Adoption Framework (CAF) capability pillars.
 * 7 structured capability areas for secure and efficient cloud adoption.
 */
export type CAFCapability =
  | 'strategy'
  | 'plan'
  | 'ready'
  | 'adopt'
  | 'govern'
  | 'manage'
  | 'secure'

export type CAFLifecycleStage = 'define' | 'plan' | 'ready' | 'adopt' | 'govern-manage'

export type CAFMaturityLevel = 'initial' | 'developing' | 'defined' | 'managed' | 'optimizing'

/**
 * Well-Architected / Principle assessment score (1-5 per principle).
 */
export interface WAFPillarScore {
  pillar: ArchitecturePrinciple
  score: number               // 1–5
  notes?: string
}

/**
 * Landing Zone readiness — assesses the customer's foundational infrastructure.
 * Covers ESLZ compliance, network model, policy baseline, and subscription topology.
 */
export interface LandingZoneReadiness {
  hasAILandingZone: boolean
  networkModel: 'flat' | 'hub-spoke' | 'vwan' | 'unknown'
  privateEndpoints: boolean
  eslzCompliant: boolean
  subscriptionTopology?: string          // e.g., "Dedicated AI subscription under Corp MG"
  managementGroups: boolean
  policyBaseline?: 'none' | 'basic' | 'caf-baseline' | 'custom-strict'
  environmentSeparation?: boolean        // dev/test/staging/prod isolation
  drStrategy?: 'none' | 'backup' | 'active-passive' | 'active-active'
  sovereignCloudRequired?: boolean
  cloudEnvironment?: SovereignCloudEnvironment
}

/**
 * Interoperability protocols for agentic and modular AI systems.
 */
export type InteropProtocol = 'mcp' | 'a2a' | 'openapi' | 'graphql' | 'grpc'

/**
 * Deployment channels — how end-users interact with the AI solution.
 */
export type DeploymentChannel = 'copilot' | 'teams' | 'outlook' | 'app-service' | 'power-bi' | 'bot-service' | 'custom-app'

/**
 * A single component within an architecture topology.
 * Placed in a specific layer with data flow connections.
 */
export interface ArchitectureComponent {
  serviceId: string                       // References a service ID from the catalog
  layer: ArchitectureLayer
  role: 'primary' | 'supporting' | 'integration' | 'monitoring'
  dataFlows?: Array<{
    to: string                            // Target serviceId
    protocol: string                      // e.g., "REST", "gRPC", "Event", "SDK"
    description?: string
  }>
  securityBoundary?: 'public' | 'private-endpoint' | 'vnet-injected' | 'internal'
}

/**
 * Deployment model for a reference architecture.
 */
export interface DeploymentModelInfo {
  primaryRegion?: string                  // e.g., "South Africa North"
  drRegion?: string
  environments: string[]                  // e.g., ["dev", "staging", "prod"]
  scalingModel: 'manual' | 'autoscale' | 'serverless' | 'reserved'
  costPattern: 'pay-as-you-go' | 'reserved' | 'hybrid' | 'serverless-burst'
  cloudEnvironment?: SovereignCloudEnvironment  // Sovereign cloud determination
  sovereignRegion?: SovereignCloudRegion         // Specific sovereign region
}

export interface CurrentStateAssessment {
  // Technology landscape
  techStack: {
    maturity: TechStackMaturity
    keyPlatforms: string[]              // e.g., ["SAP", "Salesforce", "Custom ERP"]
    integrationChallenges?: string[]
  }
  
  // Data readiness
  data: {
    maturity: DataMaturity
    keyDataSources?: string[]
    dataQualityConcerns?: string[]
    governanceInPlace: boolean
  }
  
  // Cloud & infrastructure
  infrastructure: {
    cloudReadiness: CloudReadiness
    existingAzureServices?: string[]
    existingMicrosoftProducts?: string[]
  }
  
  // AI/ML maturity
  aiMaturity: {
    currentUsage: 'none' | 'experimental' | 'pilot' | 'production'
    existingAITools?: string[]
    aiGovernance: boolean
    aiSkillsGap?: 'significant' | 'moderate' | 'minimal'
  }

  // Landing Zone & ESLZ readiness
  landingZone?: LandingZoneReadiness

  // Well-Architected / Principle self-assessment (1-5 per principle)
  wafAssessment?: WAFPillarScore[]

  // Cloud Adoption Framework lifecycle position
  cafStage?: CAFLifecycleStage

  // CAF capability maturity per pillar
  cafCapabilityMaturity?: Partial<Record<CAFCapability, CAFMaturityLevel>>
}

// Strategic alignment info attached to use cases
export interface StrategicAlignmentInfo {
  primaryPriority?: string              // Main strategic priority this addresses
  linkedPriorities?: string[]           // Additional linked priorities
  alignmentScore?: number               // 1-10 how well it aligns
  alignmentRationale?: string           // Why this use case supports strategy
  source?: string                       // Origin of the alignment (e.g., discovery, workshop)
}

// Business process info attached to use cases
export interface UseCaseBusinessProcess {
  processId: string
  processName: string
  affectedSteps?: string[]              // Step IDs or names
  currentPainPoints?: string[]
  proposedImprovement: string
  expectedCycleTimeReduction?: string
}

// ============================================================================
// SOLUTION ENVISIONING TYPES (Innovation Hub Methodology Phase 2)
// ============================================================================

export type MicrosoftProductFamily = 
  | 'azure-ai'
  | 'azure-data'
  | 'azure-infrastructure'
  | 'power-platform'
  | 'microsoft-365'
  | 'dynamics-365'
  | 'microsoft-fabric'
  | 'microsoft-security'

export type SolutionRole = 'primary' | 'supporting' | 'integration'

export interface UseCaseMicrosoftSolution {
  productFamily: MicrosoftProductFamily
  services: string[]                    // e.g., ["azure-openai", "azure-ai-search"]
  role: SolutionRole
  justification?: string                // Why this solution is recommended
}

export type AgentCapability = 
  | 'reasoning'
  | 'planning'
  | 'tool-use'
  | 'memory'
  | 'multi-step-execution'
  | 'human-in-loop'
  | 'autonomous-decision'

export interface UseCaseAgenticOpportunity {
  id: string
  title: string
  description: string
  agentType: 'task-agent' | 'orchestrator-agent' | 'specialist-agent' | 'assistant-agent'
  capabilities: AgentCapability[]
  humanOversight: 'none' | 'approval' | 'review' | 'supervision'
  automationLevel: 'assisted' | 'semi-autonomous' | 'autonomous'
  tools?: string[]                      // Tools the agent would use
  orchestrationPattern?: 'single-agent' | 'multi-agent' | 'hierarchical'
  orchestrationFramework?: 'semantic-kernel' | 'langgraph' | 'autogen' | 'foundry-agents' | 'other'
  interopProtocols?: InteropProtocol[]
  hostingTarget?: 'container-apps' | 'aks' | 'app-service' | 'functions' | 'other'
}

export interface ImplementationComplexityInfo {
  level: 'low' | 'medium' | 'high' | 'very-high'
  factors: string[]                     // e.g., ["Multiple integrations", "Custom ML models"]
  estimatedDuration?: string            // e.g., "3-6 months"
  estimatedTeamSize?: string            // e.g., "5-8 people"
  keyRisks?: string[]
}

// ============================================================================
// EXTENDED DISCOVERY SESSION (with Business Envisioning)
// ============================================================================

export interface BusinessEnvisioningData {
  // Strategic context (the "Why")
  strategicPriorities: StrategicPriority[]
  businessOutcomes: BusinessOutcome[]
  
  // Process mapping (the "How")
  businessProcesses: BusinessProcess[]
  
  // Current state (Foundation)
  currentState?: CurrentStateAssessment
  
  // Completion tracking
  completedSections?: {
    strategicPriorities: boolean
    businessOutcomes: boolean
    businessProcesses: boolean
    currentState: boolean
  }
}

export type ScoringMethod = 'impact-feasibility' | 'rice' | 'financial-impact' | 'blended'

export interface RICEScore {
  score: number
  useCase: UseCase
}

export interface CustomerMetadata {
  customerName: string
  innovationHubSPOC?: string
  primaryStakeholder: string
  accountTeamRep: string
  innovationHubLocation: string
  solutionEngineer: string
  executiveSummary?: string
  userRole?: UserRole              // Persona using ID-8
}

// ============================================================================
// ENGAGEMENT TOOLKIT — in-app engagement artifacts (HubWorks-inspired)
// Agenda, follow-up email, task timeline, closeout, architecture diagram,
// journey. Self-contained (AI + localStorage + file exports); see
// src/lib/engagement/* and src/components/engagement/*.
//
// NOTE: distinct from the ATS `EngagementType` (account engagement motions:
// innovation-hub | ads | war | …) defined earlier in this file. This toolkit
// union classifies an in-app `Engagement` record.
// ============================================================================

export type EngagementToolkitType =
  | 'discovery'
  | 'architecture-review'
  | 'executive-briefing'
  | 'proof-of-concept'
  | 'deep-dive'
  | 'workshop'
  | 'other'

export type EngagementStatus = 'planned' | 'in-progress' | 'completed' | 'archived'

export type EngagementArtifactKind =
  | 'agenda'
  | 'email'
  | 'timeline'
  | 'closeout'
  | 'diagram'
  | 'journey'

/** A generated (or hand-authored) engagement artifact saved on an Engagement. */
export interface EngagementArtifact {
  id: string
  kind: EngagementArtifactKind
  title: string
  /** Human-editable markdown rendering of the artifact. */
  markdown: string
  /** Optional structured payload (agenda items, timeline tasks, mermaid source, …). */
  data?: unknown
  generatedAt: number
  updatedAt?: number
  /** Origin of the initial artifact draft. */
  source?: 'ai' | 'fallback' | 'manual'
}

/** A single task on an engagement timeline (business-day offset from the date). */
export interface EngagementTask {
  id: string
  title: string
  /** Business-day offset from the engagement date, e.g. -28, -14, 0, 3. */
  offsetDays: number
  /** Absolute due date (timestamp) once anchored to an engagement date. */
  dueDate?: number
  bucket?: string          // Planner bucket (e.g. "Preparation", "Delivery", "Follow-up")
  owner?: string
  notes?: string
  done?: boolean
}

/** A customer engagement (session/meeting) and its generated artifacts. */
export interface Engagement {
  id: string
  customerName: string
  customerId?: string             // links to an Account / customer
  sessionId?: string              // links to a DiscoverySession
  type: EngagementToolkitType
  status: EngagementStatus
  /** Primary engagement date (timestamp) — anchors the task timeline. */
  engagementDate?: number
  stakeholders?: string[]
  industry?: Industry
  notes?: string
  tasks?: EngagementTask[]
  artifacts?: EngagementArtifact[]
  createdAt: number
  updatedAt?: number
}

export type Industry = 
  | 'general'
  | 'healthcare'
  | 'financial-services'
  | 'manufacturing'
  | 'retail'
  | 'government'
  | 'education'
  | 'energy'
  | 'mining-resources'
  | 'telecommunications'
  | 'technology-software'

/**
 * Horizontal business-function / department groups. A second discovery
 * dimension alongside Industry: industry says WHAT the company does, business
 * function says WHICH part of the organisation a use case serves.
 */
export type BusinessFunctionGroup =
  | 'enterprise-wide'
  | 'finance-accounting'
  | 'people-hr'
  | 'risk-legal-governance'
  | 'sales-marketing-customer'
  | 'operations-supply-chain'
  | 'technology-data'
  | 'corporate-strategy'

/**
 * Cross-industry business functions / departments (e.g. Finance, HR, Risk
 * Assurance, Procurement). `cross-functional` is the explicit enterprise-wide
 * choice; leaving the field undefined also means enterprise-wide / unscoped.
 */
export type BusinessFunction =
  // Finance & Accounting
  | 'finance'
  | 'accounting-controllership'
  | 'fp-and-a'
  | 'treasury'
  | 'tax'
  | 'accounts-payable'
  | 'accounts-receivable'
  | 'investor-relations'
  // People & HR
  | 'human-resources'
  | 'talent-acquisition'
  | 'learning-development'
  | 'compensation-payroll'
  | 'hr-operations'
  // Risk, Audit, Legal & Governance
  | 'risk-management'
  | 'internal-audit'
  | 'legal'
  | 'compliance'
  | 'corporate-governance'
  | 'data-privacy'
  | 'fraud-financial-crime'
  // Sales, Marketing & Customer
  | 'sales'
  | 'sales-operations'
  | 'marketing'
  | 'customer-success'
  | 'customer-service'
  | 'product-management'
  // Operations & Supply Chain
  | 'operations'
  | 'supply-chain'
  | 'procurement'
  | 'manufacturing'
  | 'quality'
  | 'field-service'
  // Technology & Data
  | 'it'
  | 'software-engineering'
  | 'data-analytics'
  | 'information-security'
  | 'enterprise-architecture'
  | 'it-service-management'
  // Corporate & Strategy
  | 'executive-leadership'
  | 'corporate-strategy'
  | 'transformation-pmo'
  | 'corporate-communications'
  | 'facilities-realestate'
  | 'ehs-sustainability'
  | 'research-development'
  // Enterprise-wide / cross-functional
  | 'cross-functional'

export type DiscoverySessionCreationSource =
  | 'discovery'
  | 'skip-to-use-cases'
  | 'notes-analysis'
  | 'ai-assessment'

export interface DiscoveryQuestion {
  id: string
  question: string
  category: 'business' | 'technical' | 'users' | 'challenges'
  placeholder?: string
  industries?: Industry[]
  businessFunctions?: BusinessFunction[]  // Show only for these functions (mirrors `industries`)
  isFollowUp?: boolean
  parentQuestionId?: string
  inputType?: 'text' | 'ranking'
  rankingItems?: string[]
}

export interface DiscoveryResponse {
  questionId: string
  answer: string
  followUpQuestions?: DiscoveryQuestion[]
  ranking?: Record<string, number>
  comment?: string
}

export interface DiscoverySession {
  id: string
  customerId: string
  customerName: string
  innovationHubSPOC?: string
  name: string
  industry?: Industry
  businessFunctions?: BusinessFunction[] // Target departments/functions (empty = enterprise-wide)
  businessUnitLabel?: string             // Optional free-text division/BU (e.g. "Personal & Business Banking")
  targetKpis?: string[]                  // Desired business KPI outcomes (KPI ids) captured in Discovery
  desiredOutcomes?: string               // Freeform desired outcomes / target improvements
  innovationHubLocation: string
  solutionEngineer: string
  accountTeamRep: string
  primaryStakeholder: string
  stockTicker?: string // For public companies - enables earnings/financial analysis
  entityType?: EntityType // Type of organization (public, private, government, non-profit)
  accountSegment?: AccountSegment // Account segment — enterprise, majors-growth, smec
  complianceEnforcement?: ComplianceEnforcement // Strict or advisory gate mode
  manualFinancials?: ManualFinancialContext     // Manual financial data for non-public entities
  executiveSummary?: string
  creationSource?: DiscoverySessionCreationSource
  responses: DiscoveryResponse[]
  suggestedUseCases?: SuggestedUseCaseData[]
  useCaseGeneration?: UseCaseGenerationMetadata
  earningsInsights?: EarningsInsight[] // AI-extracted insights from earnings calls
  companyInsights?: CompanyInsight[] // AI-extracted insights from company research (news, docs, etc.)
  companyResearchSummary?: string // AI-generated summary of company research insights

  // Entity-aware account drivers (live-generated)
  pressureThemes?: PressureTheme[] // Company pressure/priority themes (earnings & financials driven)
  auditThemes?: AuditTheme[]       // Public-sector audit-failure themes (AGSA / Treasury driven)
  commitments?: Commitment[]       // Management commitments (company) OR remedial directives (public sector)
  briefingAgenda?: BriefingAgenda  // Generated half-day briefing agenda
  
  // ============================================================================
  // INNOVATION HUB METHODOLOGY: BUSINESS ENVISIONING DATA
  // ============================================================================
  businessEnvisioning?: BusinessEnvisioningData

  // AI Governance Assessment (populated by governance workflow step)
  aiGovernanceAssessment?: AIGovernanceAssessment

  // ATS Enablement
  userRole?: UserRole               // Persona that created this session
  accountId?: string                // Linked Account entity
  workloadIds?: string[]            // Workloads identified in this session
  fiscalYear?: string               // E.g., "FY26"
  fiscalQuarter?: FiscalQuarter
  engagementType?: EngagementType   // Type of engagement this session supports

  // Customer self-serve questionnaire linkage
  awaitingCustomerResponses?: boolean        // Gate auto use-case generation until responses imported
  customerEmail?: string                     // Captured from a linked questionnaire submission
  linkedQuestionnaireToken?: string          // adminToken of the linked questionnaire link
  importedQuestionnaireQuestions?: DiscoveryQuestion[] // Snapshot so imported responses resolve their question text

  createdAt: number
  completedAt?: number
  sessionDate?: number
}

// Earnings/Financial data insights
export interface EarningsInsight {
  id: string
  category: 'strategic-priority' | 'pain-point' | 'investment' | 'opportunity' | 'risk' | 'trend'
  title: string
  description: string
  quote?: string
  source: string
  relevanceScore: number
}

// ============================================================================
// ENTITY-AWARE THEMES & COMMITMENTS
// Companies -> PressureTheme (earnings/financials). Public sector -> AuditTheme (AGSA).
// Both map to an Azure SolutionArea + BriefingTrack and drive the Pipeline Plan.
// ============================================================================

/** Briefing-track identifier (A–E). Labels/mapping live in lib/briefing-tracks.ts. */
export type BriefingTrackId = 'A' | 'B' | 'C' | 'D' | 'E'

/** Category of a private-sector pressure/priority theme (earnings-driven). */
export type PressureThemeCategory =
  | 'growth'            // revenue growth / market expansion
  | 'margin-cost'       // margin pressure / cost efficiency
  | 'digital'           // digital transformation / modernisation
  | 'customer'          // customer experience / retention / churn
  | 'supply-chain'      // supply-chain resilience
  | 'data-analytics'    // data & analytics maturity
  | 'cyber-resilience'  // cybersecurity & operational resilience
  | 'workforce'         // talent / workforce productivity
  | 'regulatory-esg'    // regulatory / ESG / privacy
  | 'm-and-a'           // M&A / integration
  | 'competition'       // competitive / disruption threat
  | 'energy-security'   // SA-specific: load-shedding / energy continuity

export const PRESSURE_THEME_CATEGORY_LABELS: Record<PressureThemeCategory, string> = {
  'growth': 'Growth & Market Expansion',
  'margin-cost': 'Margin & Cost Pressure',
  'digital': 'Digital Transformation',
  'customer': 'Customer Experience & Retention',
  'supply-chain': 'Supply-Chain Resilience',
  'data-analytics': 'Data & Analytics Maturity',
  'cyber-resilience': 'Cybersecurity & Resilience',
  'workforce': 'Talent & Workforce Productivity',
  'regulatory-esg': 'Regulatory, ESG & Privacy',
  'm-and-a': 'M&A & Integration',
  'competition': 'Competitive & Disruption Threat',
  'energy-security': 'Energy Security & Continuity',
}

/** A live-extracted strategic/financial pressure theme for a company. */
export interface PressureTheme {
  id: string
  title: string
  category: PressureThemeCategory
  description: string
  /** Verbatim supporting evidence (quote / statistic) from a source. */
  evidence?: string
  source?: 'earnings-call' | '10-K' | '10-Q' | 'annual-report' | 'sens' | 'trading-statement' | 'news' | 'analyst' | 'financials' | 'manual'
  sourceDate?: string
  /** 1 (watch) – 5 (urgent). */
  severity?: number
  solutionArea?: SolutionArea
  briefingTrack?: BriefingTrackId
  linkedUseCaseIds?: string[]
  createdAt: number
}

/** AGSA audit-failure theme classification rubric (T1–T11). */
export type AuditThemeCategory =
  | 'T1-irregular-expenditure'
  | 'T2-consequence-mgmt'
  | 'T3-financial-misstatement'
  | 'T4-performance-reporting'
  | 'T5-it-controls'
  | 'T6-cybersecurity'
  | 'T7-backup-dr'
  | 'T8-legacy-infrastructure'
  | 'T9-failed-ict-projects'
  | 'T10-data-integrity'
  | 'T11-scm-case-backlog'

export const AUDIT_THEME_CATEGORY_LABELS: Record<AuditThemeCategory, string> = {
  'T1-irregular-expenditure': 'T1 – Irregular / Unauthorised & Fruitless Expenditure',
  'T2-consequence-mgmt': 'T2 – No Consequence Management / Weak Accountability',
  'T3-financial-misstatement': 'T3 – Material Financial Misstatements & Late Submission',
  'T4-performance-reporting': 'T4 – Unreliable Performance / Service-Delivery Reporting',
  'T5-it-controls': 'T5 – Weak IT General Controls / Security Management',
  'T6-cybersecurity': 'T6 – Cybersecurity Weaknesses & Breaches',
  'T7-backup-dr': 'T7 – Backup & Disaster Recovery Gaps',
  'T8-legacy-infrastructure': 'T8 – Ageing / Legacy Infrastructure',
  'T9-failed-ict-projects': 'T9 – Failed ICT Projects / Unused Licences',
  'T10-data-integrity': 'T10 – Data Integrity / Integration',
  'T11-scm-case-backlog': 'T11 – SCM / Case-Backlog Weaknesses',
}

/** A live-extracted audit-failure theme for a public-sector entity. */
export interface AuditTheme {
  id: string
  title: string
  category: AuditThemeCategory
  description: string
  /** Verbatim supporting evidence (finding / statistic) from a source. */
  evidence?: string
  source?: 'agsa-pfma' | 'agsa-mfma' | 'annual-report' | 'municipal-money' | 'vulekamali' | 'pmg' | 'news' | 'manual'
  sourceDate?: string
  /** 1 (watch) – 5 (urgent). */
  severity?: number
  /** Audit opinion, e.g. 'Unqualified', 'Qualified', 'Adverse', 'Disclaimer'. */
  auditOutcome?: string
  solutionArea?: SolutionArea
  briefingTrack?: BriefingTrackId
  linkedUseCaseIds?: string[]
  createdAt: number
}

/** A management commitment (company) or remedial directive (public sector). */
export interface Commitment {
  id: string
  kind: 'management-commitment' | 'remedial-directive'
  statement: string
  /** Who made/issued it: executive name/role, or issuing authority (AGSA, National Treasury). */
  source?: string
  sourceDate?: string
  /** Target date or timeframe, e.g. 'FY26', 'within 90 days'. */
  timeframe?: string
  status?: 'committed' | 'in-progress' | 'at-risk' | 'met' | 'unknown'
  /** How Microsoft/Azure helps deliver it. */
  howAzureHelps?: string
  linkedThemeIds?: string[]
  createdAt: number
}

/** A single session in a generated half-day briefing agenda. */
export interface BriefingAgendaSession {
  startTime: string   // e.g. '09:30'
  endTime: string     // e.g. '10:15'
  title: string
  focus: string
  solutionArea?: SolutionArea
  briefingTrack?: BriefingTrackId
  linkedThemeIds?: string[]
}

export interface BriefingAgenda {
  title: string
  generatedAt: number
  sessions: BriefingAgendaSession[]
}

export interface SourceTextHighlight {
  text: string
  startIndex: number
  endIndex: number
  confidence: number
}

export interface SuggestedUseCaseData {
  title: string
  description: string
  rationale: string
  kpis?: string[]
  sourceTexts?: SourceTextHighlight[]
  dataSources?: ('earnings' | 'financials' | 'news' | 'industry-research' | 'discovery' | 'ai-generated' | 'manual' | 'fallback')[]
  strategicAlignment?: StrategicAlignmentInfo
  businessProcesses?: UseCaseBusinessProcess[]
  microsoftSolutions?: UseCaseMicrosoftSolution[]
  solutionPlays?: string[]
  referenceArchitecture?: string
  agenticOpportunities?: UseCaseAgenticOpportunity[]
  implementationComplexity?: ImplementationComplexityInfo
  solutionMapping?: UseCase['solutionMapping']
  aiRegulations?: AIRegulationsInfo
  cybersecurity?: CybersecurityInfo
}

export interface UseCaseGenerationMetadata {
  mode: 'ai' | 'template'
  provider?: string
  model?: string
  deployment?: string
  correlationId?: string
  generatedAt: number
  fallbackReason?: string
  evidenceSources?: string[]
}

// ============================================================================
// ENTERPRISE DISCOVERY TYPES
// ============================================================================

export type DiscoveryType = 'new-opportunity' | 'expansion' | 'renewal' | 'macc'
export type StageStatus = 'not-started' | 'in-progress' | 'completed'
export type SCQStatus = 'confirmed' | 'adjusted' | 'rejected' | 'pending'

// Stage 1: Opportunity Types
export interface CostOfInaction {
  directCosts: {
    oneTime: number
    recurring: number // Per month
  }
  opportunityCosts: {
    oneTime: number
    recurring: number // Per month
  }
  riskCosts: {
    oneTime: number
    oneTimeProbability: number // 0-100
    recurring: number // Per month
    recurringProbability: number // 0-100
  }
  totalAnnual: number // Auto-calculated
}

export type ProblemCategory = 'efficiency' | 'growth' | 'risk' | 'compliance' | 'experience' | 'other'
export type AffectedArea = 'process' | 'team' | 'system' | 'customer' | 'multiple'
export type TimelineExpectation = '<3-months' | '3-6-months' | '6-12-months' | '12+-months'

export interface OpportunityStageData {
  // 1A: Current State
  problemStatement: string
  problemCategory: ProblemCategory
  affectedArea: AffectedArea
  
  // 1B: Desired State
  desiredOutcome: string
  successMetrics: string[]
  timelineExpectation: TimelineExpectation
  
  // 1C: Cost of Inaction
  coi: CostOfInaction
  
  // 1D: SCQ
  scq: {
    situation: string
    complication: string
    question: string
    status: SCQStatus
  }
}

// Stage 2: Resources Types
export type BudgetStatus = 'allocated' | 'accessible' | 'needs-case' | 'unknown'
export type BudgetRange = '<50k' | '50-150k' | '150-500k' | '500k-1m' | '>1m' | 'unknown'
export type CapacityLevel = 'high' | 'medium' | 'low' | 'unknown'
export type DataAvailability = 'ready' | 'needs-work' | 'unknown'

export interface ResourcesStageData {
  // 2A: Financial
  budgetStatus: BudgetStatus
  budgetRange: BudgetRange
  roiExpectation: string
  budgetOwner: string
  
  // 2B: Human
  executiveSponsor: string
  projectLead: string
  teamCapacity: CapacityLevel
  changeReadiness: CapacityLevel
  
  // 2C: Technical
  existingPlatforms: string[]
  dataAvailability: DataAvailability
  integrationRequirements: string[]
  technicalDebtConcerns: string
  
  // 2D: Temporal
  targetStart: number | null // timestamp
  targetCompletion: number | null // timestamp
  competingPriorities: string[]
  hardDependencies: string[]
  
  // SCQ
  scq: {
    situation: string
    complication: string
    question: string
    status: SCQStatus
  }
}

// Stage 3: Decision Process Types
export type StakeholderType = 'economic-buyer' | 'technical-evaluator' | 'user-buyer' | 'influencer' | 'blocker'
export type StakeholderDisposition = 'champion' | 'supportive' | 'neutral' | 'skeptical' | 'opposed' | 'unknown'
export type AccessLevel = 'direct' | 'indirect' | 'none'
export type DecisionStyle = 'single-decision-maker' | 'consensus' | 'committee' | 'procurement'
export type CompetitivePosition = 'preferred' | 'equal' | 'behind' | 'unknown'

export interface Stakeholder {
  id: string
  name: string
  role: string
  type: StakeholderType
  disposition: StakeholderDisposition
  accessLevel: AccessLevel
  keyConcern: string
}

export interface ApprovalStage {
  id: string
  stage: string
  approver: string
  expectedDate: number | null // timestamp
}

export interface DecisionProcessStageData {
  // 3A: Stakeholder Map
  stakeholders: Stakeholder[]
  
  // 3B: Evaluation Criteria
  formalCriteria: Array<{ criterion: string; weighting?: number }>
  informalCriteria: string[]
  competition: string
  competitivePosition: CompetitivePosition
  
  // 3C: Process Mechanics
  decisionStyle: DecisionStyle
  approvalStages: ApprovalStage[]
  decisionTimeline: number | null // timestamp
  procurementInvolvement: boolean | null
}

// Stage 4: RICE Prioritisation (reuses existing RICE from UseCase)
export interface PrioritisationStageData {
  opportunities: Array<{
    id: string
    title: string
    rice: {
      reach: number
      impact: number
      confidence: number
      effort: number
      score: number
    }
  }>
  recommendedOpportunityId?: string
}

// Stage 5: Solution Scope Types
export type ValueDriverCategory = 'revenue' | 'cost' | 'risk'

export interface ValueDriver {
  id: string
  category: ValueDriverCategory
  driver: string
  value: number
  period: 'one-time' | 'month' | 'quarter' | 'year'
  sourceStage?: string // e.g., 'Stage 1 COI' for auto-populated drivers
  isFromCOI?: boolean // Indicates if this driver was auto-populated from COI
}

export interface Phase {
  id: string
  name: string
  duration: string
}

export interface SuccessMetric {
  id: string
  type: 'leading' | 'lagging'
  metric: string
  baseline: string
  target: string
}

export type RiskCategory = 'technical' | 'adoption' | 'organisational' | 'commercial' | 'external'
export type RiskLevel = 'low' | 'medium' | 'high'

export interface Risk {
  id: string
  description: string
  category: RiskCategory
  likelihood: RiskLevel
  impact: RiskLevel
  mitigation: string
  owner: string
}

// ============================================================================
// DETAILED FINANCIAL IMPACT TYPES (Three-Statement Model)
// ============================================================================

// Revenue Impact Mapping - 5 drivers with metric chain inputs
export type RevenueDriverType = 'customer-acquisition' | 'margin-improvement' | 'sales-cycle' | 'churn-reduction' | 'upsell-crosssell'

export interface RevenueImpactDriver {
  id: string
  type: RevenueDriverType
  enabled: boolean
  
  // Metric chain inputs (vary by driver type)
  inputs: {
    // Customer Acquisition: Leads × Conversion × Deal Size
    leads?: number
    conversionRate?: number // percentage
    avgDealSize?: number
    
    // Margin Improvement: Price × Volume - Discount
    priceIncrease?: number // percentage
    volume?: number
    discountReduction?: number // percentage
    
    // Sales Cycle: Pipeline × Win Rate × (365 ÷ Cycle Days)
    pipelineValue?: number
    winRate?: number // percentage
    currentCycleDays?: number
    newCycleDays?: number
    
    // Churn Reduction: Customers × (1 - Churn) × LTV
    customerCount?: number
    currentChurnRate?: number // percentage
    newChurnRate?: number // percentage
    customerLTV?: number
    
    // Upsell/Cross-sell: Customers × Expansion Rate × ARPU
    existingCustomers?: number
    expansionRate?: number // percentage
    arpu?: number
  }
  
  // Auto-calculated output
  calculatedAnnualValue: number
  plLine: 'revenue' // Always maps to Revenue line
  notes?: string
}

// Cost Impact Mapping - 5 drivers with FTE tracking
export type CostDriverType = 'labour-efficiency' | 'error-reduction' | 'infrastructure' | 'vendor-consolidation' | 'automation'

export interface CostImpactDriver {
  id: string
  type: CostDriverType
  enabled: boolean
  
  // Metric chain inputs
  inputs: {
    // Labour Efficiency: Hours × Loaded Cost × Volume
    hoursSavedPerTask?: number
    fullyLoadedHourlyCost?: number
    tasksPerMonth?: number
    
    // Error Reduction: Error Rate × Volume × Cost per Error
    currentErrorRate?: number // percentage
    newErrorRate?: number // percentage
    transactionVolume?: number
    costPerError?: number
    
    // Infrastructure: Current - Future Spend
    currentMonthlySpend?: number
    futureMonthlySpend?: number
    
    // Vendor Consolidation: Current - Consolidated
    vendorCount?: number
    costPerVendor?: number
    consolidatedCost?: number
    
    // Automation: Manual Cost - Automated Cost
    manualCostPerProcess?: number
    automatedCostPerProcess?: number
    processVolume?: number
  }
  
  // Auto-calculated outputs
  calculatedAnnualValue: number
  fteEquivalent: number // Show FTE equivalent for transparency
  plLine: 'cogs' | 'opex' // Maps to COGS or OpEx
  notes?: string
}

// Balance Sheet & Cash Flow Impact
export type BalanceSheetDriverType = 'collections' | 'inventory' | 'capex-avoidance' | 'risk-provision'

export interface BalanceSheetCashFlowDriver {
  id: string
  type: BalanceSheetDriverType
  enabled: boolean
  
  inputs: {
    // Faster Collections (DSO Reduction)
    currentDSO?: number // Days Sales Outstanding
    newDSO?: number
    dailyRevenue?: number
    
    // Inventory Optimisation (DIO Reduction)
    currentDIO?: number // Days Inventory Outstanding
    newDIO?: number
    dailyCOGS?: number
    
    // CapEx Avoidance
    avoidedCapEx?: number
    alternativeOpEx?: number // If shifting to cloud/subscription
    
    // Risk Provision Release
    currentProvision?: number
    riskReductionPercent?: number // percentage
  }
  
  calculatedValue: number
  cashFlowImpact: number
  statementLine: 'working-capital' | 'cash-operating' | 'cash-investing' | 'balance-sheet'
  notes?: string
}

// Metric Hierarchy - Strategic → Financial → Operational → Activity
export type MetricLevel = 'strategic' | 'financial' | 'operational' | 'activity'

export interface MetricHierarchyItem {
  id: string
  level: MetricLevel
  name: string
  linkedToId?: string // Links to parent metric at higher level
}

export interface MetricHierarchy {
  strategicOutcome: string // e.g., "Shareholder Value", "Revenue Growth"
  financialMetrics: string[] // e.g., ["Revenue by Segment", "Gross Margin %"]
  operationalMetrics: string[] // e.g., ["Cycle Time", "Error Rate"]
  activityMetrics: string[] // e.g., ["Documents Processed", "Cases Resolved"]
}

// Extended Solution Scope Stage Data with sub-steps
export interface SolutionScopeStageData {
  // Current sub-step (5a, 5b, 5c, 5d)
  currentSubStep: 'overview' | 'revenue' | 'cost' | 'balance-sheet' | 'architecture' | 'summary'
  
  // 5A: Scope Definition (kept from original)
  inScope: string[]
  outOfScope: string[]
  mvpDefinition: string
  phases: Phase[]
  
  // 5B: Value Driver Tree (legacy - kept for compatibility)
  valueDrivers: ValueDriver[]
  
  // NEW: Detailed Revenue Impact (Stage 5a)
  revenueImpact: {
    drivers: RevenueImpactDriver[]
    totalAnnualRevenue: number
    sourceFromCOI: boolean // If opportunity costs were auto-populated
  }
  
  // NEW: Detailed Cost Impact (Stage 5b)
  costImpact: {
    drivers: CostImpactDriver[]
    totalAnnualSavings: number
    totalFTEEquivalent: number
    sourceFromCOI: boolean // If direct costs were auto-populated
  }
  
  // NEW: Balance Sheet & Cash Flow Impact (Stage 5c)
  balanceSheetCashFlow: {
    drivers: BalanceSheetCashFlowDriver[]
    totalWorkingCapitalImpact: number
    totalCashFlowImpact: number
  }
  
  // NEW: Metric Hierarchy
  metricHierarchy: MetricHierarchy
  
  // Aggregated values (auto-calculated)
  totalAnnualValue: number
  riskAdjustedValue: number
  paybackPeriod: number // Months
  
  // 5C: Success Metrics
  successMetrics: SuccessMetric[]
  
  // 5D: Risk Assessment
  risks: Risk[]
  
  // 5E: Solution Architecture (Stage 5d sub-step)
  solutionArchitecture?: {
    useCaseMappings: Array<{
      useCaseId: string
      useCaseTitle: string
      useCaseDescription: string
      referenceArchitecture?: string // ReferenceArchitecturePattern
      microsoftSolutions: Array<{
        productFamily: string
        services: string[]
        role: 'primary' | 'supporting' | 'integration'
        justification?: string
      }>
      businessProcesses: UseCaseBusinessProcess[]
      isManuallySelected: boolean
      aiGenerationFailed?: boolean
    }>
    completedAt?: number
  }
}

// Stage 6: Validation Types
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface Assumption {
  id: string
  assumption: string
  basis: string
  confidence: ConfidenceLevel
  validationPlan: string
}

export interface ValidateStageData {
  assumptions: Assumption[]
  
  // Value Capture Mechanism
  valueLocation: string // P&L line, balance sheet, capacity, risk avoided
  valueValidator: string // Name/role
  reviewFrequency: string
}

// Stage 7: Commit Types
export type YesNoPartially = 'yes' | 'partially' | 'no'
export type FitLevel = 'high' | 'medium' | 'low'
export type ViabilityLevel = 'good' | 'marginal' | 'poor'
export type YellowLightSeverity = 'minor' | 'moderate' | 'serious' | 'deal-breaker'
export type CommitDecision = 'proceed' | 'refine' | 'pause' | 'walk-away'

export interface YellowLight {
  id: string
  description: string
  stageIdentified: string
  severity: YellowLightSeverity
  resolutionPlan: string
  owner: string
  dueDate: number | null // timestamp
  resolved: boolean
}

export interface CommitStageData {
  // 7A: Relationship Assessment
  trustIndicators: {
    sharingRealNumbers: YesNoPartially
    sharingRealConcerns: YesNoPartially
    believeWeCanDeliver: YesNoPartially
  }
  engagementIndicators: {
    accessToDecisionMakers: 'full' | 'limited' | 'none'
    responsiveness: 'high' | 'medium' | 'low'
    clientInvestingResources: YesNoPartially
  }
  fitIndicators: {
    strategicFit: FitLevel
    canDeliver: YesNoPartially
    commercialViability: ViabilityLevel
  }
  
  // 7B: Yellow Lights
  yellowLights: YellowLight[]
  
  // 7C: Outcome Decision
  decision: CommitDecision
}

// Stage 8: Financial Outputs Types
export interface PLImpactSummary {
  year1: {
    revenueImpact: number
    cogsImpact: number
    grossMarginImpact: number
    opexImpact: number
    ebitImpact: number
  }
  year2: {
    revenueImpact: number
    cogsImpact: number
    grossMarginImpact: number
    opexImpact: number
    ebitImpact: number
  }
  year3: {
    revenueImpact: number
    cogsImpact: number
    grossMarginImpact: number
    opexImpact: number
    ebitImpact: number
  }
  total: {
    revenueImpact: number
    cogsImpact: number
    grossMarginImpact: number
    opexImpact: number
    ebitImpact: number
  }
}

export interface InvestmentAnalysis {
  totalInvestmentYear1: number
  totalAnnualBenefit: number
  simplePaybackMonths: number
  roi3Year: number // Percentage
  npv10Percent: number
  irr: number // Percentage
}

export interface SensitivityScenario {
  conservative: {
    annualBenefit: number
    paybackMonths: number
    roi3Year: number
    npv: number
  }
  base: {
    annualBenefit: number
    paybackMonths: number
    roi3Year: number
    npv: number
  }
  optimistic: {
    annualBenefit: number
    paybackMonths: number
    roi3Year: number
    npv: number
  }
}

export interface CommunicateStageData {
  plImpact: PLImpactSummary
  investmentAnalysis: InvestmentAnalysis
  sensitivityAnalysis: SensitivityScenario
  
  // NEW: Three-Statement Financial Model
  threeStatementModel: {
    incomeStatement: {
      revenue: { year1: number; year2: number; year3: number }
      cogs: { year1: number; year2: number; year3: number }
      grossProfit: { year1: number; year2: number; year3: number }
      opex: {
        salesMarketing: { year1: number; year2: number; year3: number }
        rAndD: { year1: number; year2: number; year3: number }
        gAndA: { year1: number; year2: number; year3: number }
        total: { year1: number; year2: number; year3: number }
      }
      ebit: { year1: number; year2: number; year3: number }
    }
    balanceSheet: {
      workingCapitalChange: number
      inventoryReduction: number
      receivablesReduction: number
      capexAvoided: number
    }
    cashFlow: {
      operatingCashFlow: { year1: number; year2: number; year3: number }
      investingCashFlow: { year1: number; year2: number; year3: number }
      netCashFlow: { year1: number; year2: number; year3: number }
    }
  }
  
  // NEW: Metric Hierarchy Summary (pulled from Stage 5)
  metricHierarchy: MetricHierarchy
  
  // NEW: Value Driver Summary by P&L Line
  valueDriversByPLLine: {
    revenue: Array<{ driver: string; annualValue: number }>
    cogs: Array<{ driver: string; annualValue: number }>
    opex: Array<{ driver: string; annualValue: number }>
    balanceSheet: Array<{ driver: string; value: number }>
  }
}

// ============================================================================
// MVP 5-STAGE ENTERPRISE DISCOVERY TYPES
// ============================================================================

export type TabCompletionStatus = 'complete' | 'pending' | 'skipped' | 'not-started'

// Merged Opportunity + Resources Stage Data (MVP Stage 1)
export interface OpportunityResourcesStageData {
  // From Stage 1: Opportunity
  opportunity: OpportunityStageData
  // From Stage 2: Resources
  resources: ResourcesStageData
  // Tab completion tracking
  tabCompletion: Record<string, TabCompletionStatus>
}

// Merged Commit + Communicate Stage Data (MVP Stage 4)
export interface CommitCommunicateStageData {
  // From Stage 7: Commit
  commit: CommitStageData
  // From Stage 8: Communicate
  communicate: CommunicateStageData
  // AI-generated executive summary
  executiveSummary: string
  // Tab completion tracking
  tabCompletion: Record<string, TabCompletionStatus>
}

// Progressive disclosure config per discovery type
export interface ProgressiveDisclosureConfig {
  showProblemStatement: boolean
  showFullCOI: boolean
  showBudgetDetails: boolean
  showCompetitiveAnalysis: boolean
  prefillFromExisting: boolean
  focusOnRelationship: boolean
  showMACCFields: boolean
}

export const PROGRESSIVE_DISCLOSURE: Record<DiscoveryType, ProgressiveDisclosureConfig> = {
  'new-opportunity': {
    showProblemStatement: true,
    showFullCOI: true,
    showBudgetDetails: true,
    showCompetitiveAnalysis: true,
    prefillFromExisting: false,
    focusOnRelationship: false,
    showMACCFields: false,
  },
  'expansion': {
    showProblemStatement: false,
    showFullCOI: true,
    showBudgetDetails: true,
    showCompetitiveAnalysis: false,
    prefillFromExisting: true,
    focusOnRelationship: false,
    showMACCFields: false,
  },
  'renewal': {
    showProblemStatement: false,
    showFullCOI: false,
    showBudgetDetails: false,
    showCompetitiveAnalysis: true,
    prefillFromExisting: true,
    focusOnRelationship: true,
    showMACCFields: false,
  },
  'macc': {
    showProblemStatement: true,
    showFullCOI: true,
    showBudgetDetails: true,
    showCompetitiveAnalysis: false,
    prefillFromExisting: false,
    focusOnRelationship: false,
    showMACCFields: true,
  },
}

// MVP 5-Stage Session (new format)
export interface EnterpriseDiscoverySessionMVP {
  id: string
  version: 'mvp-5-stage' // Identifies new format
  
  // Stage 0: START
  clientName: string
  industry?: string // For AI suggestions
  attendees: Array<{ name: string; role: string }>
  sessionDate: number
  discoveryType: DiscoveryType
  
  // Stage data (5 stages: 0-4)
  currentStageId: number // 0-4
  stages: {
    0: { status: StageStatus; completedAt?: number; data: null }
    1: { status: StageStatus; completedAt?: number; data: OpportunityResourcesStageData | null }
    2: { status: StageStatus; completedAt?: number; data: DecisionProcessStageData | null }
    3: { status: StageStatus; completedAt?: number; data: SolutionScopeStageData | null }
    4: { status: StageStatus; completedAt?: number; data: CommitCommunicateStageData | null }
  }
  
  // Global yellow lights (accessible from any stage)
  allYellowLights: YellowLight[]
  
  // Session state
  isLiveMode?: boolean
  isPaused?: boolean
  pausedAt?: number
  lastSavedAt?: number
  
  createdAt: number
  completedAt?: number
}

// Migration utility: Convert legacy 9-stage session to MVP 5-stage
export function migrateToMVPSession(legacy: EnterpriseDiscoverySession): EnterpriseDiscoverySessionMVP {
  // Map legacy stage IDs to MVP stage IDs
  const legacyToMVPStageMap: Record<number, number> = {
    0: 0, // START -> START
    1: 1, // OPPORTUNITY -> OPPORTUNITY+RESOURCES
    2: 1, // RESOURCES -> OPPORTUNITY+RESOURCES
    3: 2, // DECISION PROCESS -> DECISION PROCESS
    4: 2, // PRIORITISE -> (merged into DECISION PROCESS)
    5: 3, // SOLUTION SCOPE -> SOLUTION SCOPE
    6: 3, // VALIDATE -> (merged into SOLUTION SCOPE)
    7: 4, // COMMIT -> COMMIT+COMMUNICATE
    8: 4, // COMMUNICATE -> COMMIT+COMMUNICATE
  }
  
  const mvpCurrentStage = legacyToMVPStageMap[legacy.currentStageId] ?? 0
  
  // Merge opportunity + resources
  const opportunityResourcesData: OpportunityResourcesStageData | null = 
    (legacy.stages[1].data || legacy.stages[2].data) ? {
      opportunity: legacy.stages[1].data || {
        problemStatement: '',
        problemCategory: 'efficiency',
        affectedArea: 'process',
        desiredOutcome: '',
        successMetrics: [],
        timelineExpectation: '3-6-months',
        coi: { directCosts: { oneTime: 0, recurring: 0 }, opportunityCosts: { oneTime: 0, recurring: 0 }, riskCosts: { oneTime: 0, oneTimeProbability: 50, recurring: 0, recurringProbability: 50 }, totalAnnual: 0 },
        scq: { situation: '', complication: '', question: '', status: 'pending' },
      },
      resources: legacy.stages[2].data || {
        budgetStatus: 'unknown',
        budgetRange: 'unknown',
        roiExpectation: '',
        budgetOwner: '',
        executiveSponsor: '',
        projectLead: '',
        teamCapacity: 'unknown',
        changeReadiness: 'unknown',
        existingPlatforms: [],
        dataAvailability: 'unknown',
        integrationRequirements: [],
        technicalDebtConcerns: '',
        targetStart: null,
        targetCompletion: null,
        competingPriorities: [],
        hardDependencies: [],
        scq: { situation: '', complication: '', question: '', status: 'pending' },
      },
      tabCompletion: {},
    } : null
  
  // Merge commit + communicate
  const commitCommunicateData: CommitCommunicateStageData | null =
    (legacy.stages[7].data || legacy.stages[8].data) ? {
      commit: legacy.stages[7].data || {
        trustIndicators: { sharingRealNumbers: 'no', sharingRealConcerns: 'no', believeWeCanDeliver: 'no' },
        engagementIndicators: { accessToDecisionMakers: 'none', responsiveness: 'low', clientInvestingResources: 'no' },
        fitIndicators: { strategicFit: 'low', canDeliver: 'no', commercialViability: 'poor' },
        yellowLights: [],
        decision: 'pause',
      },
      communicate: legacy.stages[8].data || {
        plImpact: { year1: { revenueImpact: 0, cogsImpact: 0, grossMarginImpact: 0, opexImpact: 0, ebitImpact: 0 }, year2: { revenueImpact: 0, cogsImpact: 0, grossMarginImpact: 0, opexImpact: 0, ebitImpact: 0 }, year3: { revenueImpact: 0, cogsImpact: 0, grossMarginImpact: 0, opexImpact: 0, ebitImpact: 0 }, total: { revenueImpact: 0, cogsImpact: 0, grossMarginImpact: 0, opexImpact: 0, ebitImpact: 0 } },
        investmentAnalysis: { totalInvestmentYear1: 0, totalAnnualBenefit: 0, simplePaybackMonths: 0, roi3Year: 0, npv10Percent: 0, irr: 0 },
        sensitivityAnalysis: { conservative: { annualBenefit: 0, paybackMonths: 0, roi3Year: 0, npv: 0 }, base: { annualBenefit: 0, paybackMonths: 0, roi3Year: 0, npv: 0 }, optimistic: { annualBenefit: 0, paybackMonths: 0, roi3Year: 0, npv: 0 } },
        threeStatementModel: { incomeStatement: { revenue: { year1: 0, year2: 0, year3: 0 }, cogs: { year1: 0, year2: 0, year3: 0 }, grossProfit: { year1: 0, year2: 0, year3: 0 }, opex: { salesMarketing: { year1: 0, year2: 0, year3: 0 }, rAndD: { year1: 0, year2: 0, year3: 0 }, gAndA: { year1: 0, year2: 0, year3: 0 }, total: { year1: 0, year2: 0, year3: 0 } }, ebit: { year1: 0, year2: 0, year3: 0 } }, balanceSheet: { workingCapitalChange: 0, inventoryReduction: 0, receivablesReduction: 0, capexAvoided: 0 }, cashFlow: { operatingCashFlow: { year1: 0, year2: 0, year3: 0 }, investingCashFlow: { year1: 0, year2: 0, year3: 0 }, netCashFlow: { year1: 0, year2: 0, year3: 0 } } },
        metricHierarchy: { strategicOutcome: '', financialMetrics: [], operationalMetrics: [], activityMetrics: [] },
        valueDriversByPLLine: { revenue: [], cogs: [], opex: [], balanceSheet: [] },
      },
      executiveSummary: '',
      tabCompletion: {},
    } : null
  
  return {
    id: legacy.id,
    version: 'mvp-5-stage',
    clientName: legacy.clientName,
    industry: undefined,
    attendees: legacy.attendees,
    sessionDate: legacy.sessionDate,
    discoveryType: legacy.discoveryType,
    currentStageId: mvpCurrentStage,
    stages: {
      0: { status: legacy.stages[0].status, completedAt: legacy.stages[0].completedAt, data: null },
      1: { 
        status: legacy.stages[1].status === 'completed' && legacy.stages[2].status === 'completed' ? 'completed' : 
               legacy.stages[1].status === 'in-progress' || legacy.stages[2].status === 'in-progress' ? 'in-progress' : 'not-started',
        completedAt: legacy.stages[2].completedAt,
        data: opportunityResourcesData,
      },
      2: { status: legacy.stages[3].status, completedAt: legacy.stages[3].completedAt, data: legacy.stages[3].data },
      3: { status: legacy.stages[5].status, completedAt: legacy.stages[5].completedAt, data: legacy.stages[5].data },
      4: { 
        status: legacy.stages[7].status === 'completed' && legacy.stages[8].status === 'completed' ? 'completed' :
               legacy.stages[7].status === 'in-progress' || legacy.stages[8].status === 'in-progress' ? 'in-progress' : 'not-started',
        completedAt: legacy.stages[8].completedAt,
        data: commitCommunicateData,
      },
    },
    allYellowLights: legacy.allYellowLights,
    isLiveMode: legacy.isLiveMode,
    isPaused: legacy.isPaused,
    pausedAt: legacy.pausedAt,
    lastSavedAt: legacy.lastSavedAt,
    createdAt: legacy.createdAt,
    completedAt: legacy.completedAt,
  }
}

// Type guard to check if session is MVP format
export function isMVPSession(session: EnterpriseDiscoverySession | EnterpriseDiscoverySessionMVP): session is EnterpriseDiscoverySessionMVP {
  return 'version' in session && session.version === 'mvp-5-stage'
}

// ============================================================================
// LEGACY 9-STAGE ENTERPRISE DISCOVERY SESSION (DEPRECATED)
// ============================================================================

/**
 * @deprecated Use EnterpriseDiscoverySessionMVP instead. 
 * This interface is kept for backward compatibility and migration.
 */
export interface EnterpriseDiscoverySession {
  id: string
  
  // Stage 0: START
  clientName: string
  attendees: Array<{ name: string; role: string }>
  sessionDate: number
  discoveryType: DiscoveryType
  
  // Stage data
  currentStageId: number // 0-8
  stages: {
    0: { status: StageStatus; completedAt?: number; data: null }
    1: { status: StageStatus; completedAt?: number; data: OpportunityStageData | null }
    2: { status: StageStatus; completedAt?: number; data: ResourcesStageData | null }
    3: { status: StageStatus; completedAt?: number; data: DecisionProcessStageData | null }
    4: { status: StageStatus; completedAt?: number; data: PrioritisationStageData | null }
    5: { status: StageStatus; completedAt?: number; data: SolutionScopeStageData | null }
    6: { status: StageStatus; completedAt?: number; data: ValidateStageData | null }
    7: { status: StageStatus; completedAt?: number; data: CommitStageData | null }
    8: { status: StageStatus; completedAt?: number; data: CommunicateStageData | null }
  }
  
  // Global yellow lights (accessible from any stage)
  allYellowLights: YellowLight[]
  
  // Session state
  isLiveMode?: boolean // Voice input enabled
  isPaused?: boolean
  pausedAt?: number
  lastSavedAt?: number
  
  createdAt: number
  completedAt?: number
}
