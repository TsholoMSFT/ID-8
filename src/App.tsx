import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { buildSolutionPathsAnnex } from '@/lib/solution-blueprint/annex-builder'
import { useLocalStorage } from '@/hooks/use-local-storage'
import '@/lib/openai-service' // Initialize OpenAI service
import { UseCase, ScoringMethod, CustomerMetadata, DiscoverySession, Industry, DiscoveryResponse, EntityType, BusinessFunction } from '@/lib/types'
import type { CustomerJourney, EnterpriseDiscoverySession, EnterpriseDiscoverySessionMVP } from '@/lib/types'

// Union type: handlers accept both legacy and MVP sessions
type AnyEnterpriseSession = EnterpriseDiscoverySession | EnterpriseDiscoverySessionMVP
import type { SessionTemplate } from '@/lib/session-templates'
import type { DiscoveryDraft } from '@/components/DiscoveryNotesInput'
import { SessionMetadata } from '@/components/SessionMetadataForm'
import { getTopUseCases, getRankedUseCases } from '@/lib/scoring'
import { useDiscovery } from '@/hooks/use-discovery'
import { useCustomers } from '@/hooks/use-customers'
import { useAppNavigation } from '@/hooks/use-app-navigation'
import { suggestedWorkspaceStep, type AppView, type WorkspaceStep } from '@/lib/app-navigation'
import { WorkspaceNavigation, WorkspaceContinue } from '@/components/WorkspaceNavigation'
import { WorkspaceSetup, type WorkspaceSetupValues } from '@/components/WorkspaceSetup'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { CompanyInsight } from '@/lib/company-research-service'
import type { ResearchInsightChange } from '@/components/CompanyResearch'
import { LandingPage } from '@/components/LandingPage'
import { NavigationHeader } from '@/components/NavigationHeader'
import { EmptyState } from '@/components/EmptyState'
import { Disclaimer } from '@/components/Disclaimer'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, ChartScatter, ListNumbers, FileArrowDown, FileArrowUp, CaretDown, CaretUp, FolderOpen, Funnel, ShieldCheck, Scales } from '@phosphor-icons/react'
import { Toaster, toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Footer } from '@/components/ui/footer'
import { assessPortfolio, detectJurisdictions } from '@/lib/regulatory-engine'
import type { ExtractedUseCase } from '@/lib/use-case-extraction'
import type { DiscoveryTrack } from '@/lib/discovery-questions'

// ── Code-split heavy / dialog / secondary-view components ─────────────────
const UseCaseCard = lazy(() => import('@/components/UseCaseCard').then(m => ({ default: m.UseCaseCard })))
const UseCaseDialog = lazy(() => import('@/components/UseCaseDialog').then(m => ({ default: m.UseCaseDialog })))
const TableExportView = lazy(() => import('@/components/TableExportView').then(m => ({ default: m.TableExportView })))
const PrioritizationMatrix = lazy(() => import('@/components/PrioritizationMatrix').then(m => ({ default: m.PrioritizationMatrix })))
const TopRecommendations = lazy(() => import('@/components/TopRecommendations').then(m => ({ default: m.TopRecommendations })))
const MutualSuccessPlanDialog = lazy(() => import('@/components/MutualSuccessPlan').then(m => ({ default: m.MutualSuccessPlanDialog })))
const CustomerMetadataComponent = lazy(() => import('@/components/CustomerMetadata').then(m => ({ default: m.CustomerMetadata })))
const CustomerStakeholderMap = lazy(() => import('@/components/CustomerStakeholderMap').then(m => ({ default: m.CustomerStakeholderMap })))
const ExecutiveSummary = lazy(() => import('@/components/ExecutiveSummary').then(m => ({ default: m.ExecutiveSummary })))
const ExecutiveSummaryGeneratorDialog = lazy(() => import('@/components/ExecutiveSummaryGeneratorDialog').then(m => ({ default: m.ExecutiveSummaryGeneratorDialog })))
const DiscoveryLauncher = lazy(() => import('@/components/DiscoveryLauncher').then(m => ({ default: m.DiscoveryLauncher })))
const DiscoveryWizard = lazy(() => import('@/components/DiscoveryWizard').then(m => ({ default: m.DiscoveryWizard })))
const DiscoveryResults = lazy(() => import('@/components/DiscoveryResults').then(m => ({ default: m.DiscoveryResults })))
const DiscoveryNotesInput = lazy(() => import('@/components/DiscoveryNotesInput').then(m => ({ default: m.DiscoveryNotesInput })))
const SolutionBlueprintWorkspace = lazy(() => import('@/components/SolutionBlueprintWorkspace').then(m => ({ default: m.SolutionBlueprintWorkspace })))
const EnhancedDiscoveryWorkflow = lazy(() => import('@/components/EnhancedDiscoveryWorkflow').then(m => ({ default: m.EnhancedDiscoveryWorkflow })))
const LiveDiscoveryMode = lazy(() => import('@/components/LiveDiscoveryMode').then(m => ({ default: m.LiveDiscoveryMode })))
const LiveDiscoverySetup = lazy(() => import('@/components/LiveDiscoverySetup').then(m => ({ default: m.LiveDiscoverySetup })))
const SessionManager = lazy(() => import('@/components/SessionManager').then(m => ({ default: m.SessionManager })))
const SessionComparison = lazy(() => import('@/components/SessionComparison').then(m => ({ default: m.SessionComparison })))
const SessionMetadataForm = lazy(() => import('@/components/SessionMetadataForm').then(m => ({ default: m.SessionMetadataForm })))
const CsamCockpit = lazy(() => import('@/components/csam/CsamCockpit').then(m => ({ default: m.CsamCockpit })))
const PortfolioIntelligenceView = lazy(() => import('@/components/PortfolioIntelligenceView').then(m => ({ default: m.PortfolioIntelligenceView })))
const EnterpriseDiscoveryOrchestrator = lazy(() => import('@/components/enterprise-discovery/EnterpriseDiscoveryOrchestratorMVP').then(m => ({ default: m.EnterpriseDiscoveryOrchestratorMVP })))
const ImportUseCasesDialog = lazy(() => import('@/components/ImportUseCasesDialog').then(m => ({ default: m.ImportUseCasesDialog })))
const PipelineBoard = lazy(() => import('@/components/PipelineBoard').then(m => ({ default: m.PipelineBoard })))
const EngagementHub = lazy(() => import('@/components/EngagementHub').then(m => ({ default: m.EngagementHub })))
const QuestionnaireBuilder = lazy(() => import('@/components/QuestionnaireBuilder').then(m => ({ default: m.QuestionnaireBuilder })))
const Fy27AlignmentCockpit = lazy(() => import('@/components/fy27/Fy27AlignmentCockpit').then(m => ({ default: m.Fy27AlignmentCockpit })))
const AccountJourneyWorkspace = lazy(() => import('@/components/customer-journey/AccountJourneyWorkspace').then(m => ({ default: m.AccountJourneyWorkspace })))
const CompanyResearch = lazy(() => import('@/components/CompanyResearch').then(m => ({ default: m.CompanyResearch })))

/** Fallback spinner for lazy-loaded components */
function LazyFallback() {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
      <div aria-hidden="true" className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      Loading your workspace...
    </div>
  )
}

type SourceFilter = 'all' | 'ai-generated' | 'manual' | 'fallback'

interface SessionState {
  sessionName: string
  industry: Industry
  responses: DiscoveryResponse[]
  workspaceSessionId?: string | null
}

function App() {
  const { sessions: discoverySessions, addSession, updateSession } = useDiscovery()
  const { customers, findOrCreateCustomer, updateCustomer } = useCustomers()
  const [useCases, setUseCases] = useLocalStorage<UseCase[]>('use-cases', [])
  const [rememberedSessionId, rememberSessionId] = useLocalStorage<string | null>('selected-session-id', null)
  const [rememberedCustomerId, rememberCustomerId] = useLocalStorage<string | null>('selected-customer-id', null)
  const { location, navigate } = useAppNavigation({ sessionId: rememberedSessionId, customerId: rememberedCustomerId })
  const { view: currentView, step: workspaceStep, sessionId: selectedSessionId, customerId: selectedCustomerId } = location
  const setCurrentView = useCallback((view: AppView) => navigate({ view }), [navigate])
  const setSelectedSessionId = useCallback((sessionId: string | null) => navigate({ sessionId }), [navigate])
  const setSelectedCustomerId = useCallback((customerId: string | null) => navigate({ customerId }), [navigate])
  const [workspaceSteps, setWorkspaceSteps] = useLocalStorage<Record<string, WorkspaceStep>>('workspace-steps', {})
  const [lastWorkspaceSessionId, setLastWorkspaceSessionId] = useLocalStorage<string | null>('last-workspace-session-id', null)
  useEffect(() => {
    // Other tabs may update the last-opened selection without changing this tab's route.
    rememberSessionId(selectedSessionId)
    rememberCustomerId(selectedCustomerId)
  }, [selectedSessionId, selectedCustomerId, rememberSessionId, rememberCustomerId])
  const [enterpriseSessions, setEnterpriseSessions] = useLocalStorage<AnyEnterpriseSession[]>('enterprise-sessions', [])
  const [currentEnterpriseSession, setCurrentEnterpriseSession] = useLocalStorage<AnyEnterpriseSession | null>('active-enterprise-session', null)

  // Per-customer Solution Blueprint state (read-only here \u2014 owned by SolutionBlueprintWorkspace).
  // We surface its signals (reuse %, gap count) on the prioritization matrix.
  const [blueprintEstatesByCustomer] = useLocalStorage<Record<string, import('@/lib/solution-blueprint/types').TechnologyEstate>>(
    'solution-blueprint-estates',
    {},
  )
  const [blueprintUseCasesByCustomer] = useLocalStorage<Record<string, Array<import('@/lib/solution-blueprint/types').UseCaseInput & { id: string; sourceUseCaseId?: string }>>>(
    'solution-blueprint-usecases',
    {},
  )

  // Phase 4 one-shot: mirror legacy blueprint-usecases drafts onto the canonical
  // `UseCase.solutionBlueprint` slot. Runs once per browser via a localStorage
  // sentinel; new draft mutations go through onLinkBlueprint and don't need this.
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (window.localStorage.getItem('solution-blueprint-migrated-v1')) return
      const draftsByCustomer = blueprintUseCasesByCustomer || {}
      const linkedDrafts = Object.values(draftsByCustomer)
        .flat()
        .filter((d) => d.sourceUseCaseId && d.archetypeId)
      if (linkedDrafts.length === 0) {
        window.localStorage.setItem('solution-blueprint-migrated-v1', '1')
        return
      }
      const slotById = new Map(
        linkedDrafts.map((d) => [
          d.sourceUseCaseId!,
          {
            archetypeId: d.archetypeId,
            sovereigntyRequired: d.sovereigntyRequired,
            extraCapabilities: d.extraCapabilities ?? [],
            draftId: d.id,
            linkedAt: Date.now(),
          },
        ]),
      )
      setUseCases((current) =>
        (current || []).map((uc) =>
          slotById.has(uc.id) && !uc.solutionBlueprint
            ? { ...uc, solutionBlueprint: slotById.get(uc.id)! }
            : uc,
        ),
      )
      window.localStorage.setItem('solution-blueprint-migrated-v1', '1')
    } catch {
      // best-effort; if it fails the workspace will still relink on next save.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  const [comparingSessions, setComparingSessions] = useLocalStorage<DiscoverySession[]>('comparing-discovery-sessions', [])
  const [sessionState, setSessionState] = useLocalStorage<SessionState | null>('active-discovery-state', null)
  const [pendingSessionMetadata, setPendingSessionMetadata] = useLocalStorage<SessionMetadata | null>('pending-session-metadata', null)
  const [pendingDiscoveryTrack, setPendingDiscoveryTrack] = useLocalStorage<DiscoveryTrack | null>('pending-discovery-track', null)
  const [discoveryMode, setDiscoveryMode] = useLocalStorage<'standard' | 'live'>('active-discovery-mode', 'standard')
  const [notesSession, setNotesSession] = useLocalStorage<{ sessionId: string; metadata: SessionMetadata; notes: string; extractedUseCases: ExtractedUseCase[] } | null>('active-notes-session', null)
  
  // Draft persistence for notes - prevents data loss when switching views
  const [draftDiscoveryNotes, setDraftDiscoveryNotes] = useLocalStorage<{
    notes: string
    customerName: string
    sessionName: string
    industry: Industry
    entityType?: EntityType
    location?: string
    stockTicker?: string
  } | null>('discovery-draft', null)
  const [workspaceNotesDrafts, setWorkspaceNotesDrafts] = useLocalStorage<Record<string, DiscoveryDraft>>('workspace-notes-drafts', {})
  
  const [scoringMethod, setScoringMethod] = useLocalStorage<ScoringMethod>('scoring-method', 'blended')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tableExportOpen, setTableExportOpen] = useState(false)
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const [editingUseCase, setEditingUseCase] = useState<UseCase | null>(null)
  const [selectedUseCaseId, setSelectedUseCaseId] = useState<string | undefined>()
  const [showConfetti, setShowConfetti] = useState(false)
  const [showImpactFeasibilityDesc, setShowImpactFeasibilityDesc] = useState(false)
  const [showRiceDesc, setShowRiceDesc] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [execSummaryGeneratorOpen, setExecSummaryGeneratorOpen] = useState(false)
  const [requestedEngagementTool, setRequestedEngagementTool] = useState<'agenda' | 'email' | undefined>()
  const [toolLibraryOpen, setToolLibraryOpen] = useState(false)
  const selectedSession = discoverySessions?.find((s) => s.id === selectedSessionId) || null
  const currentDiscoverySession = selectedSession
  const workspaceDiscovery = !!selectedSession
  const activeSessionState = sessionState && (sessionState.workspaceSessionId ?? null) === selectedSessionId ? sessionState : null
  const setCurrentDiscoverySession = (session: DiscoverySession | null) => {
    if (session) navigate({ customerId: session.customerId, sessionId: session.id })
  }
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) || null
  const filteredUseCases = useCases?.filter((uc) => uc.discoverySessionId === selectedSessionId) || []
  const customerSessionIds = new Set(discoverySessions.filter((session) => session.customerId === selectedCustomerId).map((session) => session.id))
  const hasCustomerUseCases = (useCases || []).some((useCase) => customerSessionIds.has(useCase.discoverySessionId ?? ''))
  useEffect(() => {
    setDialogOpen(false)
    setTableExportOpen(false)
    setSessionManagerOpen(false)
    setImportDialogOpen(false)
    setExecSummaryGeneratorOpen(false)
    setEditingUseCase(null)
  }, [currentView, workspaceStep, selectedCustomerId, selectedSessionId])
  
  const useCasesList = filteredUseCases
  const workspaceAvailable = !!selectedSession && selectedSession.customerId === selectedCustomerId
  useEffect(() => {
    if (currentView !== 'dashboard' || !workspaceAvailable || !selectedSessionId) return
    setWorkspaceSteps((current) => current[selectedSessionId] === workspaceStep ? current : { ...current, [selectedSessionId]: workspaceStep })
    setLastWorkspaceSessionId(selectedSessionId)
  }, [currentView, workspaceAvailable, selectedSessionId, workspaceStep, setWorkspaceSteps, setLastWorkspaceSessionId])
  const handleWorkspaceStepChange = useCallback((step: WorkspaceStep) => navigate({ view: 'dashboard', step }), [navigate])
  const handleResearchInsightsChange = useCallback((companyInsights: CompanyInsight[], change?: ResearchInsightChange) => {
    if (!selectedSessionId) return
    updateSession(selectedSessionId, (session) => {
      const existing = session.companyInsights ?? []
      if (change?.type === 'append') {
        const ids = new Set(existing.map((insight) => insight.id))
        return { companyInsights: [...existing, ...change.insights.filter((insight) => !ids.has(insight.id))], companyResearchSummary: '' }
      }
      if (change?.type === 'remove') return { companyInsights: existing.filter((insight) => insight.id !== change.id), companyResearchSummary: '' }
      return { companyInsights, companyResearchSummary: '' }
    })
  }, [selectedSessionId, updateSession])
  const handleResearchSummaryChange = useCallback((companyResearchSummary: string, sourceInsightIds?: readonly string[]) => {
    if (!selectedSessionId) return
    updateSession(selectedSessionId, (session) => {
      const insights = session.companyInsights ?? []
      if (sourceInsightIds && (sourceInsightIds.length !== insights.length || !insights.every((insight) => sourceInsightIds.includes(insight.id)))) {
        console.warn('Research changed while a summary was being generated; the stale summary was not saved.')
        toast.info('Research changed. Generate a new summary from the current insights.')
        return {}
      }
      return { companyResearchSummary }
    })
  }, [selectedSessionId, updateSession])
  const topUseCases = getTopUseCases(useCasesList, scoringMethod, 5)
  const topUseCaseIds = new Set(topUseCases.map((uc) => uc.id))

  // Compute Solution Blueprint signals (reuse %, gaps) for use cases that
  // have an associated blueprint draft. Lazy-loads the recommender to keep
  // the initial bundle small. Re-computes only when inputs change.
  // Phase 4: signals derive from the canonical `UseCase.solutionBlueprint` slot
  // (legacy `solution-blueprint-usecases` is read only for back-compat fallback).
  const [blueprintSignals, setBlueprintSignals] = useState<Map<string, import('@/components/PrioritizationMatrix').BlueprintSignal>>(new Map())
  useEffect(() => {
    if (!selectedCustomerId) { setBlueprintSignals(new Map()); return }
    const estate = blueprintEstatesByCustomer[selectedCustomerId]
    const linked = (useCases ?? [])
      .filter((uc) => uc.solutionBlueprint?.archetypeId)
      .map((uc) => ({
        id: uc.solutionBlueprint!.draftId ?? uc.id,
        sourceUseCaseId: uc.id,
        name: uc.title,
        description: uc.description,
        archetypeId: uc.solutionBlueprint!.archetypeId,
        extraCapabilities: (uc.solutionBlueprint!.extraCapabilities ?? []) as import('@/lib/solution-blueprint/types').CapabilityId[],
        sovereigntyRequired: uc.solutionBlueprint!.sovereigntyRequired,
      }))
    if (!estate || linked.length === 0) { setBlueprintSignals(new Map()); return }

    let cancelled = false
    import('@/lib/solution-blueprint/recommender').then(({ generateBlueprints }) => {
      if (cancelled) return
      const next = new Map<string, import('@/components/PrioritizationMatrix').BlueprintSignal>()
      for (const draft of linked) {
        try {
          const result = generateBlueprints(draft, estate)
          next.set(draft.sourceUseCaseId, {
            reuseRatio: result.estateOptimized.reuseRatio,
            gapCount: result.estateOptimized.gapCount,
          })
        } catch {
          // Skip drafts that fail to generate (e.g., missing capabilities).
        }
      }
      setBlueprintSignals(next)
    })
    return () => { cancelled = true }
  }, [selectedCustomerId, blueprintEstatesByCustomer, useCases])

  // Deterministic Markdown annex appended to executive summary exports.
  const execSummaryBlueprintAnnex = useMemo(() => {
    if (!selectedCustomerId) return ''
    const estate = blueprintEstatesByCustomer[selectedCustomerId]
    const drafts = filteredUseCases
      .filter((uc) => uc.solutionBlueprint?.archetypeId)
      .map((uc) => ({
        id: uc.solutionBlueprint!.draftId ?? uc.id,
        sourceUseCaseId: uc.id,
        name: uc.title,
        description: uc.description,
        archetypeId: uc.solutionBlueprint!.archetypeId,
        extraCapabilities: (uc.solutionBlueprint!.extraCapabilities ?? []) as import('@/lib/solution-blueprint/types').CapabilityId[],
        sovereigntyRequired: uc.solutionBlueprint!.sovereigntyRequired,
      }))
    if (!estate || drafts.length === 0 || filteredUseCases.length === 0) return ''
    try {
      return buildSolutionPathsAnnex(filteredUseCases, drafts, estate)
    } catch {
      return ''
    }
  }, [selectedCustomerId, blueprintEstatesByCustomer, filteredUseCases])

  
  const customerMetadata: CustomerMetadata | null = selectedSession ? {
    customerName: selectedSession.customerName,
    innovationHubSPOC: selectedSession.innovationHubSPOC,
    primaryStakeholder: selectedSession.primaryStakeholder,
    accountTeamRep: selectedSession.accountTeamRep,
    innovationHubLocation: selectedSession.innovationHubLocation,
    solutionEngineer: selectedSession.solutionEngineer,
    executiveSummary: selectedSession.executiveSummary,
  } : null

  const shouldOfferExecutiveSummaryGeneration =
    !!selectedSession &&
    selectedSession.creationSource === 'skip-to-use-cases' &&
    !(customerMetadata?.executiveSummary || '').trim()

  useEffect(() => {
    if (useCasesList.length === 1 && !showConfetti) {
      setShowConfetti(true)
      toast.success('Great start! Add more use cases to compare and prioritize.', {
        duration: 3000,
      })
    }
  }, [useCasesList.length])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      // Ctrl/Cmd + N: New session
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        handleBackToLanding()
      }
      // Ctrl/Cmd + S: Save (prevent default browser save)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        toast.info('Sessions auto-save to browser storage')
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleAddUseCase = (data: Partial<UseCase>) => {
    if (!selectedSessionId) {
      toast.error('Please select a discovery session first')
      return
    }
    const defaultRice = {
      reach: 100,
      users: 100,
      period: 'quarter' as const,
      impact: 1,
      confidence: 50,
      effort: 1,
    }
    const newUseCase: UseCase = {
      id: `uc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      discoverySessionId: selectedSessionId,
      title: data.title || '',
      description: data.description || '',
      impact: data.impact ?? 5,
      feasibility: data.feasibility ?? 5,
      rice: data.rice ?? defaultRice,
      kpis: data.kpis || [],
      customerAccountable: data.customerAccountable,
      microsoftAccountable: data.microsoftAccountable,
      bant: data.bant,
      raciAssignments: data.raciAssignments,
      aiRegulations: data.aiRegulations,
      cybersecurity: data.cybersecurity,
      dataSources: data.dataSources,
      aiEffortEstimate: data.aiEffortEstimate,
      costOfInaction: data.costOfInaction,
      expectedValue: data.expectedValue,
      strategicAlignment: data.strategicAlignment,
      businessProcesses: data.businessProcesses,
      microsoftSolutions: data.microsoftSolutions,
      referenceArchitecture: data.referenceArchitecture,
      earningsContext: data.earningsContext,
      industryContext: data.industryContext,
      createdAt: Date.now(),
    }
    setUseCases((current) => [...(current || []), newUseCase])
    toast.success('Use case added successfully!')
  }

  const handleUpdateUseCase = (updatedUseCase: UseCase) => {
    setUseCases((current) =>
      (current || []).map((uc) => (uc.id === updatedUseCase.id ? updatedUseCase : uc))
    )
  }

  const handleJourneyUpdate = (useCaseId: string, journey: CustomerJourney) => {
    setUseCases((current) => (current || []).map((useCase) => (
      useCase.id === useCaseId ? { ...useCase, customerJourney: journey } : useCase
    )))
  }

  const handleEditUseCase = (useCase: UseCase) => {
    setEditingUseCase(useCase)
    setDialogOpen(true)
  }

  const handleSaveEdit = (data: Partial<UseCase>) => {
    if (editingUseCase) {
      const updated: UseCase = {
        ...editingUseCase,
        ...data,
        title: data.title || editingUseCase.title,
        description: data.description || editingUseCase.description,
        kpis: data.kpis || editingUseCase.kpis || [],
      }
      handleUpdateUseCase(updated)
      toast.success('Use case updated!')
    } else {
      handleAddUseCase(data)
    }
    setEditingUseCase(null)
  }

  const handleImportUseCases = (importedUseCases: Partial<UseCase>[]) => {
    if (!selectedSessionId) {
      toast.error('Please select a discovery session first')
      return
    }
    const newUseCases: UseCase[] = importedUseCases.map(data => ({
      id: `uc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      discoverySessionId: selectedSessionId,
      title: data.title || '',
      description: data.description || '',
      impact: 5,
      feasibility: 5,
      rice: {
        reach: 100,
        users: 100,
        period: 'quarter',
        impact: 1,
        confidence: 50,
        effort: 1,
      },
      kpis: data.kpis || [],
      customerAccountable: data.customerAccountable,
      microsoftAccountable: data.microsoftAccountable,
      dataSources: data.dataSources || ['manual'],
      aiRegulations: data.aiRegulations,
      cybersecurity: data.cybersecurity,
      aiEffortEstimate: data.aiEffortEstimate,
      costOfInaction: data.costOfInaction,
      expectedValue: data.expectedValue,
      strategicAlignment: data.strategicAlignment,
      businessProcesses: data.businessProcesses,
      microsoftSolutions: data.microsoftSolutions,
      referenceArchitecture: data.referenceArchitecture,
      earningsContext: data.earningsContext,
      industryContext: data.industryContext,
      createdAt: Date.now(),
    }))
    setUseCases((current) => [...(current || []), ...newUseCases])
    toast.success(`Imported ${newUseCases.length} use case${newUseCases.length !== 1 ? 's' : ''} successfully!`)
  }

  const handleDeleteUseCase = (id: string) => {
    setUseCases((current) => (current || []).filter((uc) => uc.id !== id))
    toast.success('Use case deleted')
  }

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditingUseCase(null)
    }
  }

  const handleOpenAddDialog = () => {
    setEditingUseCase(null)
    setDialogOpen(true)
  }

  const handleOpenTableExport = () => {
    setTableExportOpen(true)
  }

  /** Re-assess all use cases in the current session against regulatory frameworks */
  const handleReassessCompliance = () => {
    if (!selectedSession || useCasesList.length === 0) return
    const jurisdictions = detectJurisdictions(selectedSession.innovationHubLocation || '')
    if (jurisdictions.length === 0) {
      toast.warning('No jurisdiction detected from session location — cannot assess')
      return
    }
    const enforcement = (selectedSession as any).complianceEnforcement || 'advisory'
    const assessed = assessPortfolio(useCasesList, jurisdictions, selectedSession.industry, enforcement)
    
    // Update all assessed use cases
    setUseCases((current) =>
      (current || []).map((uc) => {
        const updated = assessed.find((a) => a.id === uc.id)
        return updated || uc
      })
    )
    toast.success(`Re-assessed ${assessed.length} use cases against ${jurisdictions.join(', ')} frameworks`)
  }

  const resetPendingDiscoveryDraft = () => {
    setSessionState(null)
    setPendingSessionMetadata(null)
    setPendingDiscoveryTrack(null)
  }

  const handleOpenWorkspace = (session: DiscoverySession) => {
    navigate({
      view: 'dashboard',
      customerId: session.customerId,
      sessionId: session.id,
      step: workspaceSteps[session.id] ?? suggestedWorkspaceStep(session, useCases || []),
    })
  }

  const handleCreateWorkspace = (values: WorkspaceSetupValues) => {
    const existingCustomer = customers.find((customer) => customer.name.trim().toLowerCase() === values.customerName.toLowerCase())
    const existingSession = existingCustomer && [...discoverySessions].filter((session) => session.customerId === existingCustomer.id).sort((a, b) => b.createdAt - a.createdAt)[0]
    if (existingSession) {
      handleOpenWorkspace(existingSession)
      return
    }
    const customer = existingCustomer ?? findOrCreateCustomer(values.customerName, '')
    const session: DiscoverySession = {
      id: `workspace-${crypto.randomUUID()}`,
      customerId: customer.id,
      customerName: customer.name,
      name: `${customer.name} workspace`,
      innovationHubSPOC: customer.innovationHubSPOC,
      stockTicker: customer.stockTicker,
      industry: values.industry,
      entityType: values.entityType,
      primaryStakeholder: '',
      accountTeamRep: '',
      innovationHubLocation: '',
      solutionEngineer: '',
      responses: [],
      creationSource: 'workspace',
      createdAt: Date.now(),
    }
    addSession(session)
    navigate({ view: 'dashboard', customerId: customer.id, sessionId: session.id, step: 'research' })
  }

  const handleWorkspaceCustomerChange = (customerId: string) => {
    const session = [...discoverySessions].filter((item) => item.customerId === customerId).sort((a, b) => b.createdAt - a.createdAt)[0]
    if (session) {
      handleOpenWorkspace(session)
      return
    }
    const customer = customers.find((item) => item.id === customerId)
    if (customer) handleCreateWorkspace({ customerName: customer.name, industry: 'general', entityType: 'public-company' })
  }

  const workspaceMetadata: SessionMetadata | null = selectedSession ? {
    customerName: selectedSession.customerName,
    innovationHubSPOC: selectedSession.innovationHubSPOC ?? '',
    primaryStakeholder: selectedSession.primaryStakeholder,
    accountTeamRep: selectedSession.accountTeamRep,
    innovationHubLocation: selectedSession.innovationHubLocation,
    solutionEngineer: selectedSession.solutionEngineer,
    stockTicker: selectedSession.stockTicker,
    entityType: selectedSession.entityType,
    accountSegment: selectedSession.accountSegment,
    complianceEnforcement: selectedSession.complianceEnforcement,
    manualFinancials: selectedSession.manualFinancials,
    userRole: selectedSession.userRole,
  } : null
  const discoveryMetadata = workspaceMetadata ?? pendingSessionMetadata
  const handleNotesDraftChange = useCallback((draft: DiscoveryDraft) => {
    if (selectedSessionId) setWorkspaceNotesDrafts((current) => ({ ...current, [selectedSessionId]: draft }))
    else setDraftDiscoveryNotes(draft)
  }, [selectedSessionId, setWorkspaceNotesDrafts, setDraftDiscoveryNotes])
  const handleNotesDraftClear = useCallback(() => {
    if (selectedSessionId) setWorkspaceNotesDrafts((current) => {
      const next = { ...current }
      delete next[selectedSessionId]
      return next
    })
    else setDraftDiscoveryNotes(null)
  }, [selectedSessionId, setWorkspaceNotesDrafts, setDraftDiscoveryNotes])

  const handleStartDiscovery = () => {
    resetPendingDiscoveryDraft()
    setDiscoveryMode('standard')
    setPendingDiscoveryTrack('use-case')
    const reuseWorkspace = currentView === 'dashboard' && !!workspaceMetadata
    if (reuseWorkspace) {
      setPendingSessionMetadata(workspaceMetadata)
      setCurrentView('discovery-wizard')
    } else navigate({ view: 'session-metadata', customerId: null, sessionId: null })
  }

  const [pendingBlueprintSeed, setPendingBlueprintSeed] = useLocalStorage<{
    customerId: string | null
    name: string
    description?: string
    archetypeId?: string
    sovereigntyRequired?: boolean
    sourceUseCaseId?: string
  } | null>('pending-blueprint-seed', null)

  const handleStartSolutionBlueprint = (opts?: { fromUseCase?: UseCase }) => {
    if (opts?.fromUseCase) {
      const uc = opts.fromUseCase
      // Lazy-load to keep landing bundle small.
      import('@/lib/solution-blueprint/archetype-inference').then(m => {
        const inferred = m.inferArchetype(uc)
        setPendingBlueprintSeed({
          customerId: selectedCustomerId,
          name: uc.title,
          description: uc.description,
          archetypeId: inferred?.archetype.id,
          sourceUseCaseId: uc.id,
        })
        setCurrentView('solution-blueprint')
        if (inferred) {
          toast.success(inferred.rationale, { duration: 5000 })
        } else {
          toast.message('Pre-filled blueprint — pick an archetype to continue.', { duration: 4000 })
        }
      })
      return
    }
    setPendingBlueprintSeed(null)
    setCurrentView('solution-blueprint')
  }

  const handleStartLiveDiscovery = () => {
    resetPendingDiscoveryDraft()
    setDiscoveryMode('live')
    setPendingDiscoveryTrack('use-case')
    const reuseWorkspace = currentView === 'dashboard' && !!workspaceMetadata
    if (reuseWorkspace) {
      setPendingSessionMetadata(workspaceMetadata)
      setCurrentView('live-discovery')
    } else navigate({ view: 'session-metadata', customerId: null, sessionId: null })
  }

  const handleStartNotesAnalysis = () => {
    resetPendingDiscoveryDraft()
    setNotesSession(null)
    if (currentView === 'dashboard') setCurrentView('notes-input')
    else navigate({ view: 'notes-input', customerId: null, sessionId: null })
  }

  const handleStartEnterpriseDiscovery = () => {
    setCurrentEnterpriseSession(null)
    setCurrentView('enterprise-discovery')
  }

  const handleStartEngagementHub = (tool?: 'agenda' | 'email') => {
    setRequestedEngagementTool(tool)
    setCurrentView('engagement-hub')
  }

  const handleResumeEnterpriseDiscovery = (session: AnyEnterpriseSession) => {
    setCurrentEnterpriseSession(session)
    setCurrentView('enterprise-discovery')
  }

  const handleEnterpriseSessionPause = (session: AnyEnterpriseSession) => {
    handleEnterpriseSessionSave(session)
    toast.info('Discovery session paused', {
      description: 'You can resume from the Strategic Assessment tab.',
    })
    setCurrentView('dashboard')
    setCurrentEnterpriseSession(null)
  }

  const handleEnterpriseSessionSave = (session: AnyEnterpriseSession) => {
    const updated = enterpriseSessions || []
    const index = updated.findIndex(s => s.id === session.id)
    if (index >= 0) {
      updated[index] = session
    } else {
      updated.push(session)
    }
    setEnterpriseSessions(updated)
  }

  const handleEnterpriseSessionComplete = (session: AnyEnterpriseSession) => {
    handleEnterpriseSessionSave(session)
    toast.success('Strategic Assessment completed successfully!')
    setCurrentView('dashboard')
    setCurrentEnterpriseSession(null)
  }

  const handleEnterpriseDiscoveryCancel = () => {
    setCurrentView('dashboard')
    setCurrentEnterpriseSession(null)
  }

  const handleBackToLanding = () => {
    setToolLibraryOpen(false)
    setCurrentView('landing')
  }
  
  const handleSessionMetadataSubmit = (metadata: SessionMetadata) => {
    setPendingSessionMetadata(metadata)
    if (discoveryMode === 'live') {
      setCurrentView('live-discovery')
    } else {
      setCurrentView('discovery-wizard')
    }
  }

  const handleSwitchToLive = (sessionName: string, industry: Industry, responses: DiscoveryResponse[]) => {
    setSessionState({ sessionName, industry, responses, workspaceSessionId: selectedSessionId })
    setCurrentView('live-discovery')
  }

  const handleSwitchToStandard = (sessionName: string, industry: Industry, responses: DiscoveryResponse[]) => {
    setSessionState({ sessionName, industry, responses, workspaceSessionId: selectedSessionId })
    setCurrentView('discovery-wizard')
  }

  const handleDiscoveryComplete = (session: DiscoverySession) => {
    const customer = findOrCreateCustomer(session.customerName, session.innovationHubSPOC || '', session.stockTicker)
    const sessionWithCustomer: DiscoverySession = {
      ...session,
      customerId: customer.id,
      companyInsights: session.companyInsights ?? (selectedSession?.customerId === customer.id ? selectedSession.companyInsights : undefined),
      companyResearchSummary: session.companyResearchSummary ?? (selectedSession?.customerId === customer.id ? selectedSession.companyResearchSummary : undefined),
      entityType: session.entityType ?? discoveryMetadata?.entityType,
      accountSegment: session.accountSegment ?? discoveryMetadata?.accountSegment,
      complianceEnforcement: session.complianceEnforcement ?? discoveryMetadata?.complianceEnforcement,
      manualFinancials: session.manualFinancials ?? discoveryMetadata?.manualFinancials,
      userRole: session.userRole ?? discoveryMetadata?.userRole,
    }
    addSession(sessionWithCustomer)
    setCurrentDiscoverySession(sessionWithCustomer)
    setSelectedCustomerId(customer.id)
    setSelectedSessionId(session.id)
    setPendingSessionMetadata(null)
    setPendingDiscoveryTrack(null)
    setCurrentView('discovery-results')
  }

  const handleDiscoveryCancel = () => {
    setCurrentView('dashboard')
    setCurrentDiscoverySession(null)
    resetPendingDiscoveryDraft()
  }

  const handleNotesAnalyze = (notes: string, metadata: SessionMetadata, extractedUseCases: ExtractedUseCase[], sessionName: string, industry: Industry, entityType?: EntityType, businessFunctions?: BusinessFunction[]) => {
    // Create discovery session from notes
    const session: DiscoverySession = {
      id: `notes-${Date.now()}`,
      customerId: '', // Will be filled after customer creation
      customerName: metadata.customerName,
      innovationHubSPOC: metadata.innovationHubSPOC,
      primaryStakeholder: metadata.primaryStakeholder,
      accountTeamRep: metadata.accountTeamRep,
      innovationHubLocation: metadata.innovationHubLocation,
      solutionEngineer: metadata.solutionEngineer,
      stockTicker: metadata.stockTicker,
      accountSegment: metadata.accountSegment,
      name: sessionName,
      industry: industry,
      businessFunctions: businessFunctions,
      entityType: entityType,
      responses: [
        {
          questionId: 'notes-input',
          answer: notes,
        }
      ],
      createdAt: Date.now(),
      completedAt: Date.now(),
    }

    // Create customer and link to session
    const customer = findOrCreateCustomer(session.customerName, session.innovationHubSPOC || '', session.stockTicker)
    session.customerId = customer.id
    if (selectedSession?.customerId === customer.id) {
      session.companyInsights = selectedSession.companyInsights
      session.companyResearchSummary = selectedSession.companyResearchSummary
    }
    
    // Add session
    addSession(session)
    setSelectedCustomerId(customer.id)
    setSelectedSessionId(session.id)
    
    // Store notes session data for workflow
    setNotesSession({ sessionId: session.id, metadata, notes, extractedUseCases })
    setCurrentDiscoverySession(session)
    setCurrentView('notes-workflow')
  }

  const handleNotesCancel = () => {
    setCurrentView('landing')
    setNotesSession(null)
  }

  // Handle template selection from industry templates
  const handleSelectTemplate = (template: SessionTemplate) => {
    setDraftDiscoveryNotes({
      notes: template.discoveryPrompts.join('\n\n'),
      customerName: '',
      sessionName: `${template.name} Discovery`,
      industry: template.industry,
      entityType: template.entityType
    })
    navigate({ view: 'notes-input', customerId: null, sessionId: null })
  }

  const handleCreateUseCasesFromDiscovery = (newUseCases: Partial<UseCase>[], executiveSummary: string, nextAction: 'dashboard' | 'solution-design' = 'dashboard') => {
    if (!currentDiscoverySession) return
    
    const createdUseCases: UseCase[] = newUseCases.map((data) => ({
      id: `uc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      discoverySessionId: currentDiscoverySession.id,
      title: data.title || '',
      description: data.description || '',
      impact: data.impact || 5,
      feasibility: data.feasibility || 5,
      rice: data.rice || {
        reach: 100,
        users: 100,
        period: 'quarter',
        impact: 1,
        confidence: 50,
        effort: 1,
      },
      kpis: data.kpis?.length ? data.kpis : (currentDiscoverySession.targetKpis ?? []),
      businessFunction: data.businessFunction ?? currentDiscoverySession.businessFunctions?.[0],
      dataSources: data.dataSources,
      aiEffortEstimate: data.aiEffortEstimate,
      costOfInaction: data.costOfInaction,
      expectedValue: data.expectedValue,
      strategicAlignment: data.strategicAlignment,
      businessProcesses: data.businessProcesses,
      microsoftSolutions: data.microsoftSolutions,
      solutionPlays: data.solutionPlays,
      referenceArchitecture: data.referenceArchitecture,
      agenticOpportunities: data.agenticOpportunities,
      implementationComplexity: data.implementationComplexity,
      solutionMapping: data.solutionMapping,
      aiRegulations: data.aiRegulations,
      cybersecurity: data.cybersecurity,
      createdAt: Date.now(),
    }))

    setUseCases((current) => [...(current || []), ...createdUseCases])
    
    updateSession(currentDiscoverySession.id, {
      executiveSummary,
      completedAt: Date.now()
    })
    
    setSelectedCustomerId(currentDiscoverySession.customerId)
    setSelectedSessionId(currentDiscoverySession.id)
    setCurrentDiscoverySession(null)
    setSessionState(null)
    toast.success(`Session saved! Added ${createdUseCases.length} use case${createdUseCases.length !== 1 ? 's' : ''} successfully!`)

    if (nextAction === 'solution-design') {
      // The workflow emits ranked order, so seed Solution Envisioning with #1.
      handleStartSolutionBlueprint({ fromUseCase: createdUseCases[0] })
    } else {
      navigate({ view: 'dashboard', step: 'prioritize' })
    }
  }

  const handleViewSession = (session: DiscoverySession) => {
    setCurrentDiscoverySession(session)
    setSelectedCustomerId(session.customerId)
    setSelectedSessionId(session.id)
    setCurrentView('discovery-results')
  }

  const handleCompareSessions = (sessions: DiscoverySession[]) => {
    setComparingSessions(sessions)
    setCurrentView('session-comparison')
  }

  const workspaceTools = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" className="shrink-0 gap-2">Advanced<CaretDown size={14} /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Customer tools</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setSessionManagerOpen(true)}>Manage and compare sessions</DropdownMenuItem>
        <DropdownMenuItem onSelect={handleStartEnterpriseDiscovery}>Strategic assessment</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleStartSolutionBlueprint()}>Solution blueprints</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleStartEngagementHub()}>Engagement hub</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setCurrentView('questionnaire-builder')}>Customer questionnaires</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setCurrentView('pipeline')} disabled={!selectedSession}>Use-case pipeline</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Specialist workspaces</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setCurrentView('portfolio')}>Portfolio intelligence</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setCurrentView('csam-cockpit')}>Delivery cockpit</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setCurrentView('fy27-cockpit')}>FY27 alignment</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCurrentView('workspace-setup')}>Start another workspace</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { setToolLibraryOpen(true); setCurrentView('landing') }}>All tools and templates</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      <Toaster position="top-right" />
      
      <SectionErrorBoundary section="Application">
      <Suspense fallback={<LazyFallback />}>
      <div>
      
      {currentView === 'landing' && (
        <LandingPage
          customers={customers}
          onStartNew={() => {
            handleStartDiscovery()
          }}
          onStartSolutionBlueprint={handleStartSolutionBlueprint}
          onStartEnterpriseDiscovery={handleStartEnterpriseDiscovery}
          onStartNotesAnalysis={handleStartNotesAnalysis}
          onViewExisting={() => {
            const recent = [...discoverySessions].sort((a, b) => b.createdAt - a.createdAt)[0]
            if (recent) handleOpenWorkspace(recent)
            else setCurrentView('workspace-setup')
          }}
          onOpenPortfolio={() => setCurrentView('portfolio')}
          onOpenCsamCockpit={() => setCurrentView('csam-cockpit')}
          onOpenCustomerQuestionnaire={() => setCurrentView('questionnaire-builder')}
          onOpenAgenda={() => handleStartEngagementHub('agenda')}
          onOpenFollowupEmail={() => handleStartEngagementHub('email')}
          onSelectTemplate={handleSelectTemplate}
          onStartWorkspace={() => setCurrentView('workspace-setup')}
          onOpenWorkspace={(customer, session) => {
            if (session) handleOpenWorkspace(session)
            else handleCreateWorkspace({ customerName: customer.name, industry: 'general', entityType: 'public-company' })
          }}
          sessions={discoverySessions}
          useCases={useCases || []}
          workspaceSteps={workspaceSteps}
          lastWorkspaceSessionId={lastWorkspaceSessionId}
          toolLibraryOpen={toolLibraryOpen}
          onToolLibraryOpenChange={setToolLibraryOpen}
        />
      )}

      {currentView === 'workspace-setup' && <WorkspaceSetup customers={customers} onCreate={handleCreateWorkspace} onCancel={handleBackToLanding} />}

      {((currentView === 'discovery-wizard' && !discoveryMetadata) ||
        (currentView === 'discovery-results' && !currentDiscoverySession) ||
        (currentView === 'notes-workflow' && (!currentDiscoverySession || notesSession?.sessionId !== selectedSessionId))) && (
        <div className="mx-auto max-w-xl px-4 py-12">
          <Card><CardHeader><CardTitle>Return to your workspace</CardTitle><CardDescription>This activity is no longer open. Your saved sessions and research are still available.</CardDescription></CardHeader>
            <CardContent><Button onClick={() => navigate({ view: 'dashboard', step: 'discover' })}>Open workspace</Button></CardContent>
          </Card>
        </div>
      )}

      {currentView === 'portfolio' && (
        <>
          <NavigationHeader
            onBackToLanding={handleBackToLanding}
            onBack={handleBackToLanding}
            backLabel="Back"
            title="Portfolio Intelligence"
            subtitle="Pipeline plan across companies and public sector"
          />
          <div className="container mx-auto px-4 md:px-6 py-8 max-w-[1400px]">
            <SectionErrorBoundary>
              <PortfolioIntelligenceView />
            </SectionErrorBoundary>
          </div>
        </>
      )}

      {currentView === 'pipeline' && (
        <>
          <NavigationHeader
            onBackToLanding={handleBackToLanding}
            onBack={() => setCurrentView('dashboard')}
            backLabel="Back to dashboard"
            title="Use-case pipeline"
            subtitle="Validate use cases and progress opportunities through MCEM"
          />
          <div className="container mx-auto px-4 md:px-6 py-8 max-w-[1400px]">
            <SectionErrorBoundary>
              <Suspense fallback={<LazyFallback />}>
                {selectedCustomerId ? (
                  <PipelineBoard
                    useCases={filteredUseCases}
                    customerId={selectedCustomerId}
                    discoverySessionId={selectedSessionId ?? undefined}
                    onUpdateUseCase={handleUpdateUseCase}
                    actorName={selectedSession?.accountTeamRep}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Select a customer to view its pipeline.</p>
                )}
              </Suspense>
            </SectionErrorBoundary>
          </div>
        </>
      )}

      {currentView === 'customer-journey' && (
        <>
          <NavigationHeader
            onBackToLanding={handleBackToLanding}
            onBack={() => setCurrentView('dashboard')}
            backLabel="Back to dashboard"
            title="Frontier AI Account Journey"
            subtitle="Customer readiness, engagement value, and full maturity roadmap"
          />
          <div className="container mx-auto max-w-[1600px] px-4 py-8 md:px-6">
            <SectionErrorBoundary>
              <Suspense fallback={<LazyFallback />}>
                {selectedCustomer ? (
                  <AccountJourneyWorkspace
                    customer={selectedCustomer}
                    sessions={discoverySessions || []}
                    useCases={useCases || []}
                  />
                ) : (
                  <div className="border-y border-border py-16 text-center">
                    <h2 className="text-xl font-semibold">Select a customer first</h2>
                    <p className="mt-1 text-sm text-muted-foreground">An account journey is stored against the active customer.</p>
                    <Button variant="outline" className="mt-4" onClick={() => setCurrentView('dashboard')}>Back to dashboard</Button>
                  </div>
                )}
              </Suspense>
            </SectionErrorBoundary>
          </div>
        </>
      )}

      {currentView === 'engagement-hub' && (
        <Suspense fallback={<LazyFallback />}>
          <EngagementHub
            customerId={selectedCustomerId ?? undefined}
            customerName={selectedSession?.customerName}
            industry={selectedSession?.industry}
            sessionId={selectedSessionId ?? undefined}
            useCases={filteredUseCases}
            customerStakeholders={selectedCustomer?.stakeholders}
            initialTool={requestedEngagementTool}
            onOpenAccountJourney={() => setCurrentView('customer-journey')}
            onBack={() => {
              setRequestedEngagementTool(undefined)
              setCurrentView(selectedSessionId ? 'dashboard' : 'landing')
            }}
          />
        </Suspense>
      )}

      {currentView === 'fy27-cockpit' && (
        <>
          <NavigationHeader
            onBackToLanding={handleBackToLanding}
            onBack={() => setCurrentView('dashboard')}
            backLabel="Back to dashboard"
            title="ATS FY27 alignment cockpit"
            subtitle="Secure AI Assessment, relationships, roadmap, consumption & blockers"
          />
          <div className="container mx-auto px-4 md:px-6 py-8 max-w-[1400px]">
            <SectionErrorBoundary>
              <Suspense fallback={<LazyFallback />}>
                <Fy27AlignmentCockpit
                  customerId={selectedCustomerId ?? undefined}
                  customerName={selectedSession?.customerName}
                  session={selectedSession ?? null}
                  useCases={filteredUseCases.length ? filteredUseCases : (useCases ?? [])}
                  actorName={selectedSession?.accountTeamRep}
                />
              </Suspense>
            </SectionErrorBoundary>
          </div>
        </>
      )}

      {currentView === 'questionnaire-builder' && (
        <Suspense fallback={<LazyFallback />}>
          <QuestionnaireBuilder
            initialCustomerName={selectedSession?.customerName}
            initialIndustry={selectedSession?.industry}
            onBack={() => setCurrentView(selectedSessionId ? 'dashboard' : 'landing')}
            onBackToLanding={handleBackToLanding}
          />
        </Suspense>
      )}

      {currentView === 'csam-cockpit' && (
        <>
          <NavigationHeader
            onBackToLanding={handleBackToLanding}
            onBack={handleBackToLanding}
            backLabel="Back"
            title="Customer Value Realisation & Health Cockpit"
            subtitle="CSAM lens — value realisation, health, adoption, and CSDR guidance"
          />
          <div className="container mx-auto px-4 md:px-6 py-8 max-w-[1400px]">
            <SectionErrorBoundary>
              <Suspense fallback={<LazyFallback />}>
                <CsamCockpit />
              </Suspense>
            </SectionErrorBoundary>
          </div>
        </>
      )}

      {currentView === 'enterprise-discovery' && (
        <>
          <NavigationHeader 
            onBackToLanding={handleBackToLanding}
            onBack={handleEnterpriseDiscoveryCancel}
            backLabel="Exit Assessment"
            title="Strategic Assessment"
            subtitle="Comprehensive opportunity assessment"
          />
          <div className="container mx-auto px-4 md:px-6 py-8 max-w-7xl">
            <EnterpriseDiscoveryOrchestrator
            initialSession={currentEnterpriseSession || undefined}
            initialCustomerName={selectedCustomerId ? customers.find(c => c.id === selectedCustomerId)?.name : undefined}
            onSave={handleEnterpriseSessionSave}
            onComplete={handleEnterpriseSessionComplete}
            onCancel={handleEnterpriseDiscoveryCancel}
            onPause={handleEnterpriseSessionPause}
            />
          </div>
        </>
      )}

      {currentView === 'solution-blueprint' && (
        <>
          <NavigationHeader
            onBackToLanding={handleBackToLanding}
            onBack={handleBackToLanding}
            backLabel="Back"
            title="Solution Blueprint"
            subtitle="Use-case led envisioning \u2014 best-fit vs estate-optimized"
          />
          <div className="container mx-auto px-4 md:px-6 py-8 max-w-7xl">
            {pendingBlueprintSeed && pendingBlueprintSeed.customerId !== selectedCustomerId && <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">This blueprint draft belongs to another customer. Open the original workspace or choose a use case for this customer.</p>}
            <SolutionBlueprintWorkspace
              customers={customers}
              initialCustomerId={selectedCustomerId}
              initialUseCase={pendingBlueprintSeed?.customerId === selectedCustomerId ? pendingBlueprintSeed : null}
              onLinkBlueprint={(sourceUseCaseId, slot) => {
                setUseCases((current) =>
                  (current || []).map((uc) =>
                    uc.id === sourceUseCaseId
                      ? { ...uc, solutionBlueprint: slot }
                      : uc,
                  ),
                )
              }}
            />
          </div>
        </>
      )}

      {currentView === 'session-comparison' && (
        <SessionComparison 
          sessions={comparingSessions} 
          onBack={() => {
            navigate({ view: 'dashboard', step: 'prioritize' })
            setComparingSessions([])
          }} 
        />
      )}

      {currentView === 'session-metadata' && (
        <SessionMetadataForm
          onSubmit={handleSessionMetadataSubmit}
          onCancel={handleDiscoveryCancel}
          onBackToLanding={handleBackToLanding}
          initialMetadata={selectedCustomerId ? { customerName: customers.find(c => c.id === selectedCustomerId)?.name || '' } : undefined}
        />
      )}

      {currentView === 'notes-input' && (
        <DiscoveryNotesInput
          key={selectedSessionId ?? 'standalone-notes'}
          sessionMetadata={workspaceMetadata ?? undefined}
          onAnalyze={handleNotesAnalyze}
          onCancel={handleNotesCancel}
          onBackToLanding={handleBackToLanding}
          initialDraft={selectedSession ? workspaceNotesDrafts[selectedSession.id] ?? {
            notes: '', sessionName: `${selectedSession.customerName} notes`, customerName: selectedSession.customerName,
            industry: selectedSession.industry ?? 'general', entityType: selectedSession.entityType,
            location: selectedSession.innovationHubLocation, stockTicker: selectedSession.stockTicker,
            businessFunctions: selectedSession.businessFunctions,
          } : draftDiscoveryNotes}
          onDraftChange={handleNotesDraftChange}
          onDraftClear={handleNotesDraftClear}
        />
      )}

      {currentView === 'notes-workflow' && currentDiscoverySession && notesSession?.sessionId === selectedSessionId && (
        <EnhancedDiscoveryWorkflow
          session={currentDiscoverySession}
          initialUseCases={notesSession.extractedUseCases.map(uc => ({
            title: uc.title,
            description: uc.description,
            rationale: uc.rationale,
            businessFunction: uc.businessFunction,
            sourceTexts: uc.sourceTexts,
            dataSources: ['ai-generated', 'discovery'],
            strategicAlignment: uc.strategicAlignment,
            businessProcesses: uc.businessProcess ? [{
              processId: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              processName: uc.businessProcess.processName,
              affectedSteps: [],
              currentPainPoints: uc.businessProcess.currentPainPoints,
              proposedImprovement: uc.businessProcess.expectedImprovement,
            }] : undefined,
            microsoftSolutions: uc.microsoftSolutions,
            referenceArchitecture: uc.referenceArchitecture,
            agenticOpportunities: uc.agenticOpportunity?.hasOpportunity ? [{
              id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              title: uc.agenticOpportunity.title || '',
              description: uc.agenticOpportunity.title || 'AI-assisted workflow opportunity',
              agentType: uc.agenticOpportunity.agentType || 'task-agent',
              capabilities: uc.agenticOpportunity.capabilities || [],
              humanOversight: uc.agenticOpportunity.humanOversight || 'review',
              automationLevel: uc.agenticOpportunity.automationLevel || 'assisted',
              tools: [],
            }] : undefined,
            implementationComplexity: uc.implementationComplexity,
            aiRegulations: uc.aiRegulations,
            cybersecurity: uc.cybersecurity,
          }))}
          onComplete={(useCases, executiveSummary) => {
            // Save use cases
            const newUseCases: UseCase[] = useCases.map(uc => ({
              id: `uc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              discoverySessionId: currentDiscoverySession.id,
              title: uc.title || '',
              description: uc.description || '',
              impact: uc.impact || 5,
              feasibility: uc.feasibility || 5,
              rice: uc.rice || {
                reach: 100,
                users: 100,
                period: 'quarter',
                impact: 1,
                confidence: 50,
                effort: 1,
              },
              kpis: uc.kpis || [],
              dataSources: ['ai-generated', 'discovery'],
              strategicAlignment: uc.strategicAlignment,
              businessProcesses: uc.businessProcesses,
              microsoftSolutions: uc.microsoftSolutions,
              referenceArchitecture: uc.referenceArchitecture,
              agenticOpportunities: uc.agenticOpportunities,
              implementationComplexity: uc.implementationComplexity,
              aiRegulations: uc.aiRegulations,
              cybersecurity: uc.cybersecurity,
              costOfInaction: uc.costOfInaction,
              expectedValue: uc.expectedValue,
              aiEffortEstimate: uc.aiEffortEstimate,
              createdAt: Date.now(),
            }))
            setUseCases(current => [...(current || []), ...newUseCases])
            
            // Update session with summary
            updateSession(currentDiscoverySession.id, {
              executiveSummary,
            })
            
            // Select this session and customer
            setSelectedSessionId(currentDiscoverySession.id)
            setSelectedCustomerId(currentDiscoverySession.customerId)
            
            toast.success('Discovery complete!', {
              description: `${newUseCases.length} use cases created and prioritized`
            })
            
            navigate({ view: 'dashboard', step: 'prioritize' })
            setCurrentDiscoverySession(null)
            setNotesSession(null)

          }}
          onCancel={() => {
            setCurrentView('dashboard')
            setCurrentDiscoverySession(null)
            setNotesSession(null)
          }}
        />
      )}

      {currentView === 'discovery-wizard' && discoveryMetadata && (
        <DiscoveryWizard 
          key={selectedSessionId ?? discoveryMetadata.customerName}
          sessionMetadata={discoveryMetadata}
          onComplete={handleDiscoveryComplete} 
          onCancel={handleDiscoveryCancel}
          onBackToLanding={handleBackToLanding}
          onSwitchToLive={handleSwitchToLive}
          initialSessionName={activeSessionState?.sessionName ?? (workspaceDiscovery ? selectedSession?.name : undefined)}
          initialIndustry={activeSessionState?.industry ?? (workspaceDiscovery ? selectedSession?.industry : undefined)}
          initialResponses={activeSessionState?.responses}
          initialDiscoveryTrack={workspaceDiscovery ? 'use-case' : pendingDiscoveryTrack || undefined}
          initialCompanyInsights={workspaceDiscovery ? selectedSession?.companyInsights : undefined}
          initialCompanyResearchSummary={workspaceDiscovery ? selectedSession?.companyResearchSummary : undefined}
          skipNaming={workspaceDiscovery}
          researchPersistenceKey={workspaceDiscovery ? selectedSessionId ?? undefined : undefined}
        />
      )}

      {currentView === 'discovery-results' && currentDiscoverySession && (
        <DiscoveryResults
          session={currentDiscoverySession}
          onCreateUseCases={handleCreateUseCasesFromDiscovery}
          onBack={() => setCurrentView('dashboard')}
        />
      )}

      {currentView === 'live-discovery' && !activeSessionState && discoveryMetadata && (
        <LiveDiscoverySetup
          onStart={(sessionName, industry) => {
            setSessionState({ sessionName, industry, responses: [], workspaceSessionId: selectedSessionId })
          }}
          onCancel={handleDiscoveryCancel}
          onBackToLanding={() => setCurrentView('landing')}
        />
      )}

      {currentView === 'live-discovery' && activeSessionState && discoveryMetadata && (
        <LiveDiscoveryMode
          sessionMetadata={discoveryMetadata}
          sessionName={activeSessionState.sessionName}
          selectedIndustry={activeSessionState.industry}
          initialResponses={activeSessionState.responses}
          onComplete={handleDiscoveryComplete}
          onCancel={handleDiscoveryCancel}
          onBackToLanding={() => setCurrentView('landing')}
          onSwitchToStandard={handleSwitchToStandard}
        />
      )}

      {/* Fallback when live-discovery view is active but conditions not met */}
      {currentView === 'live-discovery' && !discoveryMetadata && (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-2 border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <span>Session Error</span>
              </CardTitle>
              <CardDescription>
                Unable to start Live Discovery. Session metadata is missing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This can happen if the page was refreshed or the session timed out. 
                Please start a new discovery session.
              </p>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('dashboard')}
                className="flex-1"
              >
                Go to Dashboard
              </Button>
              <Button 
                onClick={() => {
                  setDiscoveryMode('live')
                  setCurrentView('session-metadata')
                }}
                className="flex-1"
              >
                Start New Session
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {currentView === 'dashboard' && (
        <motion.div
          className="min-h-screen bg-background"
        >
          <NavigationHeader 
            onBackToLanding={handleBackToLanding}
            title="Customer workspace"
            subtitle={selectedCustomer?.name}
            hasPageHeading
          />
          <div className="container mx-auto px-4 md:px-6 py-8 max-w-7xl">
            {!selectedSession || !selectedCustomer || selectedSession.customerId !== selectedCustomer.id ? (
              <Card>
                <CardHeader><CardTitle>Choose a customer workspace</CardTitle><CardDescription>This workspace is not available in this browser. Your other saved work has not been changed.</CardDescription></CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button onClick={handleBackToLanding}>Choose a saved customer</Button>
                  <Button variant="outline" onClick={() => setCurrentView('workspace-setup')}>Start a workspace</Button>
                  {workspaceTools}
                </CardContent>
              </Card>
            ) : (
              <>
                <WorkspaceNavigation
                    customers={customers}
                    sessions={discoverySessions}
                    customer={selectedCustomer}
                    session={selectedSession}
                    step={workspaceStep}
                    onSelectCustomer={handleWorkspaceCustomerChange}
                    onSelectSession={handleOpenWorkspace}
                    onStepChange={handleWorkspaceStepChange}
                    actions={workspaceTools}
                />
                {workspaceStep === 'research' && (
                  <CompanyResearch
                    key={selectedSession.id}
                    companyName={selectedSession.customerName}
                    entityType={selectedSession.entityType}
                    initialInsights={selectedSession.companyInsights}
                    initialSummary={selectedSession.companyResearchSummary}
                    onInsightsChange={handleResearchInsightsChange}
                    onSummaryChange={handleResearchSummaryChange}
                    persistenceKey={selectedSession.id}
                  />
                )}
                {workspaceStep === 'discover' && <details className="mb-6 rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">Customer details and stakeholders</summary>
                  <div className="mt-4">
                <CustomerMetadataComponent
                  metadata={customerMetadata || {
                    customerName: '',
                    primaryStakeholder: '',
                    accountTeamRep: '',
                    innovationHubLocation: '',
                    solutionEngineer: '',
                    executiveSummary: '',
                  }}
                  onChange={(metadata) => {
                    if (selectedSessionId) {
                      updateSession(selectedSessionId, {
                        customerName: metadata.customerName,
                        innovationHubSPOC: metadata.innovationHubSPOC,
                        primaryStakeholder: metadata.primaryStakeholder,
                        accountTeamRep: metadata.accountTeamRep,
                        innovationHubLocation: metadata.innovationHubLocation,
                        solutionEngineer: metadata.solutionEngineer,
                      })
                    }
                  }}
                />

                {selectedCustomer && (
                  <CustomerStakeholderMap
                    customer={selectedCustomer}
                    onChange={(stakeholders) => updateCustomer(selectedCustomer.id, { stakeholders })}
                  />
                )}
                  </div>
                </details>}
                {workspaceStep === 'export' && <>
                {(customerMetadata?.executiveSummary || '').trim() ? (
                  <ExecutiveSummary
                    summary={customerMetadata?.executiveSummary || ''}
                    customerName={customerMetadata?.customerName}
                    industry={selectedSession?.industry}
                  />
                ) : shouldOfferExecutiveSummaryGeneration ? (
                  <Card className="border-2 bg-card mb-6">
                    <CardHeader className="pb-3">
                      <CardTitle>Executive Summary</CardTitle>
                      <CardDescription>
                        This session was created by skipping discovery. Generate an executive-ready summary from notes and attachments.
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="flex justify-end">
                      <Button onClick={() => setExecSummaryGeneratorOpen(true)} className="gap-2">
                        Generate Executive Summary
                      </Button>
                    </CardFooter>
                  </Card>
                ) : null}
                  <Card>
                    <CardHeader><CardTitle>Share your work</CardTitle><CardDescription>Review your assessment and download a customer-ready PDF report.</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">{useCasesList.length} use case{useCasesList.length === 1 ? '' : 's'} in this session. Reports use the selected customer and ranking method.</p>
                      {useCasesList.length > 0 ? <Button onClick={handleOpenTableExport} className="gap-2"><FileArrowDown size={18} />Review and export report</Button>
                        : <Button variant="outline" onClick={() => handleWorkspaceStepChange('discover')}>Discover use cases first</Button>}
                      <p className="text-xs text-muted-foreground">Downloads do not send an email or publish customer data. Customer-journey Word and PowerPoint exports are available in Plan.</p>
                    </CardContent>
                  </Card>
                </>}
                {workspaceStep === 'plan' && (hasCustomerUseCases ? <>
                  <AccountJourneyWorkspace key={selectedCustomer.id} customer={selectedCustomer} sessions={discoverySessions} useCases={useCases || []} />
                  <details className="mt-6 rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm font-medium">More planning tools</summary>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <MutualSuccessPlanDialog customerId={selectedCustomer.id} customerName={selectedCustomer.name} />
                      <Button variant="outline" onClick={() => handleStartSolutionBlueprint()}>Build a solution blueprint</Button>
                      <Button variant="outline" onClick={() => handleStartEngagementHub()}>Prepare an engagement</Button>
                    </div>
                  </details>
                </> : <Card>
                  <CardHeader><CardTitle>Build a plan around your priorities</CardTitle><CardDescription>Add or discover a use case before creating the customer journey.</CardDescription></CardHeader>
                  <CardContent><Button variant="outline" onClick={() => handleWorkspaceStepChange('prioritize')}>Go to Prioritize</Button></CardContent>
                </Card>)}
                {workspaceStep === 'discover' && <>
                  <Card className="mb-6">
                    <CardHeader><CardTitle>Turn customer needs into opportunities</CardTitle><CardDescription>Answer guided questions using the customer context you already collected.</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">{selectedSession.companyInsights?.length
                        ? `${selectedSession.companyInsights.length} research insight${selectedSession.companyInsights.length === 1 ? '' : 's'} will be carried into discovery.`
                        : 'You can begin without research, or return to Research to collect more context.'}</p>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button onClick={handleStartDiscovery}>Start guided questions</Button>
                        <Button variant="outline" onClick={handleStartNotesAnalysis}>Use meeting notes instead</Button>
                      </div>
                    </CardContent>
                  </Card>
                  <details className="mb-6 rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm font-medium">Advanced discovery options and saved sessions</summary>
                    <div className="mt-4">
                <Disclaimer variant="compact" className="mb-6" />

                <DiscoveryLauncher 
                  onStartDiscovery={handleStartDiscovery} 
                  onStartLiveDiscovery={handleStartLiveDiscovery} 
                  onStartEnterpriseDiscovery={handleStartEnterpriseDiscovery}
                  onResumeEnterpriseDiscovery={handleResumeEnterpriseDiscovery}
                  onOpenSessionComparison={() => setSessionManagerOpen(true)}
                  onOpenExport={() => handleOpenTableExport()}
                  onOpenEngagementHub={handleStartEngagementHub}
                  onOpenAccountJourney={() => setCurrentView('customer-journey')}
                  currentSession={selectedSession}
                  useCases={filteredUseCases}
                  onJourneyUpdate={handleJourneyUpdate}
                  accountSegment={selectedSession?.accountSegment}
                />

                <Card className="border-2 bg-card mb-8">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <FolderOpen size={24} weight="duotone" className="text-primary" />
                          Discovery Sessions
                        </CardTitle>
                        <CardDescription>
                          View and compare your saved discovery sessions
                        </CardDescription>
                      </div>
                      <Button onClick={() => setSessionManagerOpen(true)} variant="outline" className="gap-2">
                        <FolderOpen size={18} />
                        Manage Sessions
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
                    </div>
                  </details>
                </>}
                {workspaceStep === 'prioritize' && (useCasesList.length === 0 ? (
                  <EmptyState onAddFirst={handleOpenAddDialog} onImport={() => setImportDialogOpen(true)} />
                ) : (
                  <div className="space-y-6">
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">Scoring and data tools</summary>
                <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <motion.div
                    key={scoringMethod}
                    initial={{ scale: 0.98 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <Tabs
                      value={scoringMethod}
                      onValueChange={(value) => setScoringMethod(value as ScoringMethod)}
                      className="w-full sm:w-auto"
                    >
                      <TabsList className="grid w-full sm:w-auto grid-cols-3">
                        <TabsTrigger value="blended" className="gap-2">
                          <Scales size={18} />
                          <span className="hidden sm:inline">Balanced</span>
                          <span className="sm:hidden">Bal</span>
                        </TabsTrigger>
                        <TabsTrigger value="impact-feasibility" className="gap-2">
                          <ChartScatter size={18} />
                          <span className="hidden sm:inline">Impact/Feasibility</span>
                          <span className="sm:hidden">I/F</span>
                        </TabsTrigger>
                        <TabsTrigger value="rice" className="gap-2">
                          <ListNumbers size={18} />
                          RICE
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </motion.div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <Button 
                      onClick={handleOpenTableExport} 
                      variant="outline" 
                      className="gap-2 flex-1 sm:flex-initial"
                    >
                      <FileArrowDown size={20} weight="bold" />
                      Export
                    </Button>
                    <Button 
                      onClick={() => setImportDialogOpen(true)} 
                      variant="outline" 
                      className="gap-2 flex-1 sm:flex-initial"
                    >
                      <FileArrowUp size={20} weight="bold" />
                      Import
                    </Button>
                    <Button
                      onClick={handleReassessCompliance}
                      variant="outline"
                      className="gap-2 flex-1 sm:flex-initial"
                      disabled={useCasesList.length === 0}
                      title="Re-assess all use cases against regulatory frameworks"
                    >
                      <ShieldCheck size={20} weight="bold" />
                      Re-assess
                    </Button>
                    <Button variant="outline" onClick={handleOpenAddDialog} className="gap-2 flex-1 sm:flex-initial">
                      <Plus size={20} weight="bold" />
                      Add Use Case
                    </Button>
                    <MutualSuccessPlanDialog
                      customerId={selectedCustomerId}
                      customerName={selectedCustomerId ? customers.find(c => c.id === selectedCustomerId)?.name : undefined}
                    />
                  </div>
                </div>
                </details>

                <TopRecommendations
                  topUseCases={topUseCases}
                  scoringMethod={scoringMethod}
                  onSelectUseCase={setSelectedUseCaseId}
                  onGenerateBlueprint={(uc) => handleStartSolutionBlueprint({ fromUseCase: uc })}
                />

                <AnimatePresence mode="wait">
                  {scoringMethod === 'blended' && (
                    <motion.div
                      key="blended"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.4, ease: 'easeInOut' }}
                    >
                      <div className="bg-muted/30 rounded-lg border border-border p-5">
                        <div className="flex items-start gap-3">
                          <Scales size={22} className="text-primary mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">Balanced ranking</h3>
                            <p className="text-sm text-muted-foreground">
                              Use cases are ordered by strategic merit (impact, feasibility, alignment, and KPI coverage)
                              plus a risk-adjusted, log-scaled financial nudge. Large or hard-to-verify dollar figures can’t
                              dominate, so a strong use case is never dropped just because its numbers are difficult to prove.
                              See the full order in <span className="font-medium text-foreground">All Use Cases</span> below.
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {scoringMethod === 'impact-feasibility' && (
                    <motion.div
                      key="impact-feasibility"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.4, ease: 'easeInOut' }}
                    >
                      <PrioritizationMatrix
                        useCases={useCasesList}
                        selectedId={selectedUseCaseId}
                        onSelectUseCase={setSelectedUseCaseId}
                        showDescription={showImpactFeasibilityDesc}
                        onToggleDescription={() => setShowImpactFeasibilityDesc(!showImpactFeasibilityDesc)}
                        blueprintSignals={blueprintSignals}
                      />
                    </motion.div>
                  )}

                  {scoringMethod === 'rice' && (
                    <motion.div
                      key="rice"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.4, ease: 'easeInOut' }}
                    >
                    <div className="bg-muted/30 rounded-lg border border-border overflow-hidden">
                      <button
                        onClick={() => setShowRiceDesc(!showRiceDesc)}
                        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-foreground">About RICE Scoring</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {showRiceDesc ? 'Click to hide details' : 'Click to learn how RICE prioritization works'}
                          </p>
                        </div>
                        {showRiceDesc ? (
                          <CaretUp size={24} className="text-foreground flex-shrink-0" />
                        ) : (
                          <CaretDown size={24} className="text-foreground flex-shrink-0" />
                        )}
                      </button>
                      
                      <AnimatePresence>
                        {showRiceDesc && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden"
                          >
                            <div className="px-6 pb-6">
                              <p className="text-sm text-muted-foreground mb-4">
                                RICE helps you prioritize initiatives using four key factors. Higher scores indicate better opportunities:
                              </p>
                              <div className="grid grid-cols-1 gap-4 text-sm">
                                <div>
                                  <h4 className="font-semibold text-foreground mb-1">Reach (Users/Period)</h4>
                                  <p className="text-muted-foreground">
                                    How many unique users will benefit from this use case within a specific time period? 
                                    This is calculated as <span className="font-medium text-foreground">Number of Users ÷ Time Period</span>.
                                  </p>
                                  <p className="text-muted-foreground mt-1 text-xs">
                                    Example: If 1,000 users benefit per quarter, enter 1000 users and "quarter" as the period.
                                  </p>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-foreground mb-1">Impact Multiplier</h4>
                                  <p className="text-muted-foreground">
                                    How significantly will this affect each user's experience or outcomes? Use the scale:
                                  </p>
                                  <ul className="text-muted-foreground mt-1 text-xs space-y-0.5 ml-4">
                                    <li><span className="font-medium text-foreground">3x = Massive</span> - Game-changing impact</li>
                                    <li><span className="font-medium text-foreground">2x = High</span> - Significant improvement</li>
                                    <li><span className="font-medium text-foreground">1x = Medium</span> - Noticeable benefit</li>
                                    <li><span className="font-medium text-foreground">0.5x = Low</span> - Minor improvement</li>
                                    <li><span className="font-medium text-foreground">0.25x = Minimal</span> - Small tweak</li>
                                  </ul>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-foreground mb-1">Confidence (%)</h4>
                                  <p className="text-muted-foreground">
                                    How certain are you about your Reach, Impact, and Effort estimates? Lower confidence reduces the final score.
                                  </p>
                                  <p className="text-muted-foreground mt-1 text-xs">
                                    Example: 100% = completely confident, 80% = pretty sure, 50% = rough guess
                                  </p>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-foreground mb-1">Effort (Person-Weeks)</h4>
                                  <p className="text-muted-foreground">
                                    <span className="font-medium text-foreground">Total development time</span> required to design, build, test, and deploy this solution.
                                    Sum the time across all team members who will work on implementation.
                                  </p>
                                  <p className="text-muted-foreground mt-1 text-xs">
                                    Example: If 2 developers work for 3 weeks each, and 1 designer works for 1 week = 7 person-weeks total. 
                                    This measures the cost to <span className="font-medium text-foreground">implement the new solution</span>, not the time spent on the current process.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 p-3 bg-background rounded border border-border">
                                <p className="text-sm font-mono text-foreground">
                                  RICE Score = (Reach × Impact × Confidence) ÷ Effort
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  Higher scores = greater impact per unit of effort invested
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <motion.h2 
                      className="text-xl font-semibold text-foreground"
                      key={`header-${scoringMethod}`}
                      initial={{ opacity: 0.7 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      All Use Cases ({
                        sourceFilter === 'all' 
                          ? useCasesList.length 
                          : useCasesList.filter(uc => uc.dataSources?.includes(sourceFilter as any)).length
                      })
                    </motion.h2>
                    <div className="flex items-center gap-2">
                      <Funnel size={16} className="text-muted-foreground" />
                      <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
                        <SelectTrigger className="w-[160px] h-8 text-xs">
                          <SelectValue placeholder="Filter by source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sources</SelectItem>
                          <SelectItem value="ai-generated">AI Generated</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="fallback">Industry Template</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {getRankedUseCases(
                        sourceFilter === 'all' 
                          ? useCasesList 
                          : useCasesList.filter(uc => uc.dataSources?.includes(sourceFilter as any)),
                        scoringMethod
                      ).map((useCase) => (
                        <UseCaseCard
                          key={useCase.id}
                          useCase={useCase}
                          rank={topUseCaseIds.has(useCase.id) ? topUseCases.findIndex((uc) => uc.id === useCase.id) + 1 : undefined}
                          isTopPick={topUseCaseIds.has(useCase.id)}
                          scoringMethod={scoringMethod}
                          onUpdate={handleUpdateUseCase}
                          onDelete={handleDeleteUseCase}
                          onEdit={handleEditUseCase}
                          onGenerateBlueprint={(uc) => handleStartSolutionBlueprint({ fromUseCase: uc })}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            ))}
                <WorkspaceContinue step={workspaceStep} onStepChange={handleWorkspaceStepChange} />
              </>
            )}
          </div>

          <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-6 backdrop-blur-sm"><LazyFallback /></div>}>
          {dialogOpen && <UseCaseDialog
            open={dialogOpen}
            onOpenChange={handleDialogOpenChange}
            onSave={handleSaveEdit}
            editingUseCase={editingUseCase}
            sessionLocation={selectedSession?.innovationHubLocation}
            sessionIndustry={selectedSession?.industry}
            complianceEnforcement={(selectedSession as any)?.complianceEnforcement || 'advisory'}
            customerStakeholders={selectedCustomer?.stakeholders}
          />}

          {tableExportOpen && <TableExportView
            open={tableExportOpen}
            onOpenChange={setTableExportOpen}
            useCases={getRankedUseCases(useCasesList, scoringMethod)}
            topUseCases={topUseCases}
            scoringMethod={scoringMethod}
            customerMetadata={customerMetadata || undefined}
            suggestedUseCases={selectedSession?.suggestedUseCases}
          />}

          {sessionManagerOpen && <SessionManager
            open={sessionManagerOpen}
            onOpenChange={setSessionManagerOpen}
            onViewSession={handleViewSession}
            onCompareSessions={handleCompareSessions}
            onResumeEnterpriseSession={handleResumeEnterpriseDiscovery}
          />}

          {importDialogOpen && <ImportUseCasesDialog
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
            onImport={handleImportUseCases}
            discoverySessionId={selectedSessionId || undefined}
            sessionLocation={selectedSession?.innovationHubLocation}
            sessionIndustry={selectedSession?.industry}
            complianceEnforcement={(selectedSession as any)?.complianceEnforcement || 'advisory'}
          />}

          {selectedSession && execSummaryGeneratorOpen && (
            <ExecutiveSummaryGeneratorDialog
              open={execSummaryGeneratorOpen}
              onOpenChange={setExecSummaryGeneratorOpen}
              session={selectedSession}
              useCases={filteredUseCases}
              blueprintAnnex={execSummaryBlueprintAnnex}
              onSaveSummary={(summary) => {
                if (!selectedSessionId) return
                updateSession(selectedSessionId, { executiveSummary: summary })
              }}
            />
          )}
          </Suspense>
        </motion.div>
      )}

      </div>

      </Suspense>
      </SectionErrorBoundary>
      <Footer />
    </>
  )
}

export default App