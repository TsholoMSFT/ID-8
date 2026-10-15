import { useState, useMemo } from 'react'
import { UseCase, ScoringMethod } from '@/lib/types'
import { businessFunctionLabel } from '@/lib/business-functions'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { UseCaseSourceBadges } from '@/components/ui/use-case-source-badge'
import { REFERENCE_ARCHITECTURES, type ReferenceArchitecturePattern } from '@/lib/microsoft-solutions'
import { calculateATMScore } from '@/lib/atm-scoring'
import { summarizeBant } from '@/lib/qualification'
import { ATMBadge } from '@/components/ATMBadge'
import ArchitectureLayerDiagram from '@/components/ArchitectureLayerDiagram'
import { PencilSimple, Trash, Sparkle, Info, ShieldCheck, Scales, CaretDown, CaretUp, Calculator, TrendUp, CurrencyDollar, Target, TreeStructure, Cube, Robot, Gauge, Warning, Lightning, Clock, Users, ArrowRight, CheckCircle, Question, X, FileText } from '@phosphor-icons/react'
import { calculateRICEScore, getQuadrant } from '@/lib/scoring'
import { getKPIById, KPI_CATEGORIES } from '@/lib/kpis'
import { REGULATION_LABELS, RISK_LEVEL_LABELS, SECURITY_REQUIREMENT_LABELS, DATA_CLASSIFICATION_LABELS } from '@/lib/compliance-labels'
import { RISK_LEVEL_CONFIG } from '@/lib/regulatory-engine'
import { motion, AnimatePresence } from 'framer-motion'
import { getServiceLabel } from '@/lib/microsoft-solutions'
import { BusinessCase } from '@/components/BusinessCase'
import { UseCaseCostBreakdown } from '@/components/UseCaseCostBreakdown'

interface UseCaseCardProps {
  useCase: UseCase
  rank?: number
  isTopPick?: boolean
  scoringMethod: ScoringMethod
  onUpdate: (useCase: UseCase) => void
  onDelete: (id: string) => void
  onEdit: (useCase: UseCase) => void
  onGenerateBlueprint?: (useCase: UseCase) => void
}

export function UseCaseCard({
  useCase,
  rank,
  isTopPick,
  scoringMethod,
  onUpdate,
  onDelete,
  onEdit,
  onGenerateBlueprint,
}: UseCaseCardProps) {
  const [showCompliance, setShowCompliance] = useState(false)
  const [showCOI, setShowCOI] = useState(false)
  const [showInnovationHub, setShowInnovationHub] = useState(false)
  const [showProblemEditor, setShowProblemEditor] = useState(false)
  const [showBusinessCase, setShowBusinessCase] = useState(false)
  const [showCostBreakdown, setShowCostBreakdown] = useState(false)
  const [problemDraft, setProblemDraft] = useState(useCase.problemStatement ?? '')
  const [showQuestions, setShowQuestions] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const openQuestions = useCase.openQuestions ?? []
  const unansweredCount = openQuestions.filter(q => !q.answeredAt).length
  const addQuestion = () => {
    const q = newQuestion.trim()
    if (!q) return
    onUpdate({
      ...useCase,
      openQuestions: [
        ...openQuestions,
        { id: Math.random().toString(36).slice(2), question: q, askedAt: Date.now() },
      ],
    })
    setNewQuestion('')
  }
  const answerQuestion = (id: string, answer: string) => {
    onUpdate({
      ...useCase,
      openQuestions: openQuestions.map(q =>
        q.id === id ? { ...q, answer, answeredAt: Date.now() } : q,
      ),
    })
  }
  const removeQuestion = (id: string) => {
    onUpdate({ ...useCase, openQuestions: openQuestions.filter(q => q.id !== id) })
  }
  const disposition = useCase.disposition ?? 'pursue'
  const problemConfirmed = !!useCase.problemConfirmed
  const confirmProblem = () => {
    onUpdate({ ...useCase, problemStatement: problemDraft.trim(), problemConfirmed: true })
    setShowProblemEditor(false)
  }
  const riceScore = calculateRICEScore(useCase)
  const impactFeasScore = useCase.impact * useCase.feasibility
  const quadrant = getQuadrant(useCase.impact, useCase.feasibility)
  const atmScore = useMemo(() => calculateATMScore(useCase), [useCase])
  const bantSummary = useMemo(() => summarizeBant(useCase.bant), [useCase.bant])

  const hasComplianceInfo = useCase.aiRegulations || useCase.cybersecurity
  const hasCOIInfo = useCase.costOfInaction || useCase.expectedValue
  const valueBasis = useCase.expectedValue?.valueBasis ?? useCase.costOfInaction?.valueBasis
  
  // Check for Innovation Hub Methodology data
  const hasInnovationHubData = useCase.strategicAlignment || 
    (useCase.businessProcesses && useCase.businessProcesses.length > 0) ||
    (useCase.microsoftSolutions && useCase.microsoftSolutions.length > 0) ||
    useCase.referenceArchitecture ||
    (useCase.agenticOpportunities && useCase.agenticOpportunities.length > 0) ||
    useCase.implementationComplexity

  // Product family colors
  const getProductFamilyColor = (family: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      'azure-ai': { bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'border-purple-500/30' },
      'azure-data': { bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-500/30' },
      'azure-infrastructure': { bg: 'bg-slate-500/10', text: 'text-slate-600', border: 'border-slate-500/30' },
      'power-platform': { bg: 'bg-green-500/10', text: 'text-green-600', border: 'border-green-500/30' },
      'microsoft-365': { bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'border-orange-500/30' },
      'dynamics-365': { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/30' },
      'microsoft-fabric': { bg: 'bg-cyan-500/10', text: 'text-cyan-600', border: 'border-cyan-500/30' },
      'microsoft-security': { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/30' },
    }
    return colors[family] || { bg: 'bg-gray-500/10', text: 'text-gray-600', border: 'border-gray-500/30' }
  }

  // Complexity level colors
  const getComplexityColor = (level: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      'low': { bg: 'bg-green-500/10', text: 'text-green-600', border: 'border-green-500/30' },
      'medium': { bg: 'bg-yellow-500/10', text: 'text-yellow-600', border: 'border-yellow-500/30' },
      'high': { bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'border-orange-500/30' },
      'very-high': { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/30' },
    }
    return colors[level] || colors['medium']
  }

  // Format currency for display
  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }

  const impactLabels = [
    { value: 0.25, label: 'Minimal' },
    { value: 0.5, label: 'Low' },
    { value: 1, label: 'Medium' },
    { value: 2, label: 'High' },
    { value: 3, label: 'Massive' },
  ]

  const getCategoryColor = (category: string) => {
    const cat = KPI_CATEGORIES.find((c) => c.value === category)
    return cat?.color || 'oklch(0.5 0.1 240)'
  }

  return (
    <motion.div
      layout
      layoutId={useCase.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ 
        layout: { type: 'spring', stiffness: 350, damping: 35, mass: 0.8 },
        default: { type: 'spring', stiffness: 300, damping: 30 }
      }}
    >
      <motion.div
        key={`card-${useCase.id}-${rank}-${scoringMethod}`}
        animate={{
          borderColor: isTopPick ? 'oklch(0.70 0.22 330)' : 'oklch(0.40 0.02 240)',
          boxShadow: isTopPick 
            ? '0 10px 15px -3px oklch(0.70 0.22 330 / 0.1), 0 4px 6px -4px oklch(0.70 0.22 330 / 0.1)' 
            : '0 1px 2px 0 oklch(0 0 0 / 0.05)',
          scale: isTopPick ? 1.01 : 1,
        }}
        initial={false}
        transition={{ 
          duration: 0.5, 
          ease: 'easeInOut',
          scale: { type: 'spring', stiffness: 300, damping: 25 }
        }}
      >
        <motion.div
          initial={false}
          animate={{
            backgroundColor: isTopPick 
              ? 'oklch(0.70 0.22 330 / 0.03)' 
              : 'oklch(0.30 0.025 240)',
          }}
          transition={{ duration: 0.5 }}
        >
          <Card
            className={`p-6 transition-all hover:shadow-md ${
              isTopPick ? 'border-2' : ''
            }`}
            style={{ backgroundColor: 'transparent' }}
          >
        <div className="mb-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              {isTopPick && rank && (
                <motion.div
                  key={`rank-${rank}-${scoringMethod}`}
                  initial={{ scale: 0, rotate: -180, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 0, rotate: 180, opacity: 0 }}
                  transition={{ 
                    type: 'spring', 
                    stiffness: 300, 
                    damping: 20,
                    opacity: { duration: 0.2 }
                  }}
                >
                  <Badge variant="default" className="bg-accent text-accent-foreground font-semibold">
                    <Sparkle className="mr-1" weight="fill" size={14} />#{rank}
                  </Badge>
                </motion.div>
              )}
              <h3 className="break-words text-lg font-semibold text-foreground">{useCase.title}</h3>
            </div>
            {useCase.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{useCase.description}</p>
            )}
            {/* Data Source Badges */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {useCase.businessFunction && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {businessFunctionLabel(useCase.businessFunction)}
                </Badge>
              )}
              {hasCOIInfo && (
                <Badge
                  variant={valueBasis === 'customer-validated' ? 'default' : 'outline'}
                  className={`text-[10px] px-1.5 py-0 ${valueBasis === 'customer-validated' ? '' : 'border-amber-400 text-amber-700 dark:text-amber-300'}`}
                  title="Provenance of the financial estimate"
                >
                  {valueBasis === 'customer-validated' ? 'Validated' : valueBasis === 'benchmarked' ? 'Benchmarked' : 'Indicative'}
                </Badge>
              )}
              {useCase.dataSources && useCase.dataSources.length > 0 && (
                <UseCaseSourceBadges dataSources={useCase.dataSources as any} />
              )}
              {/* Regulatory Risk Badge */}
              {useCase.regulatoryAssessment && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 border ${RISK_LEVEL_CONFIG[useCase.regulatoryAssessment.overallRisk].borderColor} ${RISK_LEVEL_CONFIG[useCase.regulatoryAssessment.overallRisk].bgColor} ${RISK_LEVEL_CONFIG[useCase.regulatoryAssessment.overallRisk].color}`}
                >
                  {RISK_LEVEL_CONFIG[useCase.regulatoryAssessment.overallRisk].icon}{' '}
                  {RISK_LEVEL_CONFIG[useCase.regulatoryAssessment.overallRisk].label}
                </Badge>
              )}
              {/* ATM Qualification Badge */}
              {atmScore && <ATMBadge atmScore={atmScore} />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${
                      bantSummary.indication === 'ready'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                        : bantSummary.indication === 'attention'
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                          : 'text-muted-foreground'
                    }`}
                  >
                    BANT {bantSummary.confirmed}/4
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  {bantSummary.indication === 'ready'
                    ? 'Budget, Authority, Need, and Timeline are confirmed.'
                    : `${bantSummary.warnings.join(' ')} Advisory only.`}
                </TooltipContent>
              </Tooltip>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0" title="RACI assignments">
                RACI {useCase.raciAssignments?.length ?? 0}
              </Badge>
              {/* Architecture Layer Badge */}
              {useCase.referenceArchitecture && REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern]?.layers && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300">
                      {REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern].layers.length}L
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Spans {REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern].layers.length} architecture layers
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {useCase.kpis && useCase.kpis.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {useCase.kpis.map((kpiId) => {
                  const kpi = getKPIById(kpiId)
                  if (!kpi) return null
                  return (
                    <Badge
                      key={kpiId}
                      variant="secondary"
                      className="text-xs px-2 py-0.5"
                      style={{
                        backgroundColor: getCategoryColor(kpi.category),
                        color: 'oklch(0.98 0 0)',
                        borderColor: getCategoryColor(kpi.category),
                      }}
                    >
                      {kpi.name}
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">{disposition === 'no-go' ? 'No-go' : disposition}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label={`Actions for ${useCase.title}`}>Actions</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(useCase)}><PencilSimple size={16} />Edit use case</DropdownMenuItem>
                {onGenerateBlueprint && <DropdownMenuItem disabled={disposition === 'no-go'} onSelect={() => {
                  if (!problemConfirmed) setShowProblemEditor(true)
                  else onGenerateBlueprint(useCase)
                }}><TreeStructure size={16} />{problemConfirmed ? 'Draft solution blueprint' : 'Confirm problem and draft solution'}</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => setShowCostBreakdown((value) => !value)}><CurrencyDollar size={16} />{showCostBreakdown ? 'Hide run-cost estimate' : 'Show run-cost estimate'}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowBusinessCase((value) => !value)}><FileText size={16} />{showBusinessCase ? 'Hide business case' : 'View business case'}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Decision</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={disposition} onValueChange={(value) => {
                  if (value === 'pursue' || value === 'defer' || value === 'no-go') onUpdate({ ...useCase, disposition: value })
                }}>
                  <DropdownMenuRadioItem value="pursue">Pursue</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="defer">Defer</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="no-go">No-go</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(useCase.id)}><Trash size={16} />Delete use case</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {(showProblemEditor || (problemConfirmed && useCase.problemStatement)) && (
          <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <Question size={14} weight="bold" />
              <span className="font-medium">Problem statement (in the customer's words)</span>
              {problemConfirmed && (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                  Confirmed
                </Badge>
              )}
            </div>
            {showProblemEditor ? (
              <div className="space-y-2">
                <textarea
                  value={problemDraft}
                  onChange={(e) => setProblemDraft(e.target.value)}
                  placeholder="What outcome is the customer trying to achieve, in their words? (Khalsa: move off the solution.)"
                  className="w-full min-h-[72px] rounded border bg-background px-2 py-1.5 text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={confirmProblem} disabled={!problemDraft.trim()}>
                    <CheckCircle size={12} className="mr-1" /> Confirm & draft solution
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowProblemEditor(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs italic text-foreground/80 flex-1">“{useCase.problemStatement}”</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => {
                    setProblemDraft(useCase.problemStatement ?? '')
                    setShowProblemEditor(true)
                  }}
                >
                  Edit
                </Button>
              </div>
            )}
          </div>
        )}

        {/* LGROLNP: explicit ignorance — open questions */}
        <div className="mt-3">
          <button
            onClick={() => setShowQuestions(!showQuestions)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <Question size={14} weight="bold" />
            <span className="font-medium">Open questions</span>
            {openQuestions.length > 0 && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${unansweredCount > 0 ? 'bg-amber-500/10 text-amber-700 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'}`}>
                {unansweredCount > 0 ? `${unansweredCount} open` : `${openQuestions.length} resolved`}
              </Badge>
            )}
            {showQuestions ? <CaretUp size={12} className="ml-auto" /> : <CaretDown size={12} className="ml-auto" />}
          </button>
          <AnimatePresence>
            {showQuestions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-2 space-y-2">
                  {openQuestions.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">No open questions yet. Capturing what you don't know is as valuable as what you do.</p>
                  )}
                  {openQuestions.map(q => (
                    <div key={q.id} className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs flex-1 ${q.answeredAt ? 'text-muted-foreground line-through' : ''}`}>{q.question}</p>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeQuestion(q.id)}>
                          <X size={10} />
                        </Button>
                      </div>
                      {q.answer ? (
                        <p className="mt-1 text-[11px] text-emerald-700">→ {q.answer}</p>
                      ) : (
                        <input
                          type="text"
                          placeholder="Answer (Enter to save)"
                          className="mt-1 w-full rounded border bg-background px-2 py-1 text-[11px]"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.currentTarget.value || '').trim()) {
                              answerQuestion(q.id, e.currentTarget.value.trim())
                            }
                          }}
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addQuestion() }}
                      placeholder="What don't we know yet?"
                      className="h-7 text-xs"
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={addQuestion} disabled={!newQuestion.trim()}>
                      Add
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          key={scoringMethod}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {scoringMethod === 'impact-feasibility' ? (
            <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium uppercase tracking-wide">Impact</Label>
                <span className="text-sm font-semibold tabular-nums">{useCase.impact}</span>
              </div>
              <Slider
                value={[useCase.impact]}
                onValueChange={([value]) => onUpdate({ ...useCase, impact: value })}
                min={1}
                max={10}
                step={1}
                className="cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium uppercase tracking-wide">Feasibility</Label>
                <span className="text-sm font-semibold tabular-nums">{useCase.feasibility}</span>
              </div>
              <Slider
                value={[useCase.feasibility]}
                onValueChange={([value]) => onUpdate({ ...useCase, feasibility: value })}
                min={1}
                max={10}
                step={1}
                className="cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Quadrant
              </span>
              <Badge variant="outline" className="font-medium">
                {quadrant}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Score
              </span>
              <motion.span
                key={`if-score-${impactFeasScore}-${scoringMethod}`}
                initial={{ scale: 1.3, color: 'oklch(0.58 0.18 195)' }}
                animate={{ scale: 1, color: 'oklch(0.65 0.20 310)' }}
                transition={{ 
                  duration: 0.4,
                  scale: { type: 'spring', stiffness: 300, damping: 20 }
                }}
                className="text-xl font-bold tabular-nums"
              >
                {impactFeasScore.toFixed(1)}
              </motion.span>
            </div>
          </div>
        ) : (
          <TooltipProvider>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-xs font-medium uppercase tracking-wide">
                    Number of Users
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info size={14} className="text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">Number of Users</p>
                      <p className="text-xs">How many users will this feature impact? Enter the estimated number of people who will use or benefit from this use case.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  type="number"
                  value={useCase.rice.users || 0}
                  onChange={(e) => {
                    const users = Number(e.target.value) || 0
                    const reach = users
                    onUpdate({
                      ...useCase,
                      rice: { ...useCase.rice, users, reach },
                    })
                  }}
                  min={0}
                  className="tabular-nums"
                  placeholder="e.g., 1000"
                />
              </div>
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-xs font-medium uppercase tracking-wide">
                    Period
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info size={14} className="text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">Time Period</p>
                      <p className="text-xs">Over what time period will these users be reached? This helps contextualize the Reach metric.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={useCase.rice.period || 'quarter'}
                  onValueChange={(value) =>
                    onUpdate({
                      ...useCase,
                      rice: { ...useCase.rice, period: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Per Week</SelectItem>
                    <SelectItem value="month">Per Month</SelectItem>
                    <SelectItem value="quarter">Per Quarter</SelectItem>
                    <SelectItem value="year">Per Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-muted/50 rounded-md border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Calculated Reach
                  </span>
                  <span className="text-sm font-bold tabular-nums text-primary">
                    {useCase.rice.reach} users/{useCase.rice.period || 'quarter'}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-xs font-medium uppercase tracking-wide">
                    Impact Multiplier
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info size={14} className="text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">Impact Multiplier</p>
                      <p className="text-xs mb-2">How much will this feature impact each user?</p>
                      <ul className="text-xs space-y-1">
                        <li><strong>3x - Massive:</strong> Fundamental game-changer</li>
                        <li><strong>2x - High:</strong> Major improvement</li>
                        <li><strong>1x - Medium:</strong> Moderate improvement</li>
                        <li><strong>0.5x - Low:</strong> Small improvement</li>
                        <li><strong>0.25x - Minimal:</strong> Barely noticeable</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={String(useCase.rice.impact)}
                  onValueChange={(value) =>
                    onUpdate({
                      ...useCase,
                      rice: { ...useCase.rice, impact: Number(value) },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {impactLabels.map((item) => (
                      <SelectItem key={item.value} value={String(item.value)}>
                        {item.value}x - {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs font-medium uppercase tracking-wide">
                      Confidence
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={14} className="text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium mb-1">Confidence (%)</p>
                        <p className="text-xs">How confident are you in your estimates for Reach and Impact? Use this to account for uncertainty. 100% means very confident, 50% means moderate uncertainty.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{useCase.rice.confidence}%</span>
                </div>
                <Slider
                  value={[useCase.rice.confidence]}
                  onValueChange={([value]) =>
                    onUpdate({ ...useCase, rice: { ...useCase.rice, confidence: value } })
                  }
                  min={0}
                  max={100}
                  step={5}
                  className="cursor-pointer"
                />
              </div>
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-xs font-medium uppercase tracking-wide">
                    Effort (Person-Weeks)
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info size={14} className="text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">Effort (Person-Weeks)</p>
                      <p className="text-xs mb-2">Total <strong>development time</strong> to design, build, test, and deploy this solution. Sum the time across all team members.</p>
                      <p className="text-xs mb-2"><strong>Example:</strong> 2 developers × 3 weeks + 1 designer × 1 week = 7 person-weeks</p>
                      <p className="text-xs text-muted-foreground">Note: This measures implementation effort, not the time spent on the current process before the solution exists.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  type="number"
                  value={useCase.rice.effort}
                  onChange={(e) =>
                    onUpdate({
                      ...useCase,
                      rice: { ...useCase.rice, effort: Math.max(0.1, Number(e.target.value) || 0.1) },
                    })
                  }
                  min={0.1}
                  step={0.1}
                  className="tabular-nums"
                  placeholder="e.g., 7"
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  RICE Score
                </span>
                <motion.span
                  key={`rice-score-${riceScore}-${scoringMethod}`}
                  initial={{ scale: 1.3, color: 'oklch(0.58 0.18 195)' }}
                  animate={{ scale: 1, color: 'oklch(0.65 0.20 310)' }}
                  transition={{ 
                    duration: 0.4,
                    scale: { type: 'spring', stiffness: 300, damping: 20 }
                  }}
                  className="text-xl font-bold tabular-nums"
                >
                  {riceScore.toFixed(1)}
                </motion.span>
              </div>
            </div>
          </TooltipProvider>
        )}
        </motion.div>

        {/* Innovation Hub Methodology Section */}
        {hasInnovationHubData && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <button
              onClick={() => setShowInnovationHub(!showInnovationHub)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <Target size={14} weight="bold" />
              <TreeStructure size={14} />
              <span className="font-medium">Innovation Hub Methodology</span>
              {useCase.strategicAlignment && (
                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-4 bg-purple-500/10 text-purple-600 border-purple-500/30">
                  {useCase.strategicAlignment.alignmentScore}% aligned
                </Badge>
              )}
              {useCase.implementationComplexity && (
                <Badge 
                  variant="outline" 
                  className={`text-[10px] px-1.5 py-0 h-4 ${getComplexityColor(useCase.implementationComplexity.level).bg} ${getComplexityColor(useCase.implementationComplexity.level).text} ${getComplexityColor(useCase.implementationComplexity.level).border}`}
                >
                  {useCase.implementationComplexity.level} complexity
                </Badge>
              )}
              {showInnovationHub ? <CaretUp size={12} className="ml-auto" /> : <CaretDown size={12} className="ml-auto" />}
            </button>
            
            <AnimatePresence>
              {showInnovationHub && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 space-y-4 text-xs">
                    {/* Strategic Alignment */}
                    {useCase.strategicAlignment && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Target size={12} weight="bold" />
                          <span className="font-medium">Strategic Alignment</span>
                        </div>
                        <div className="p-2 bg-muted/30 rounded-md border border-border/50">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              {useCase.strategicAlignment.primaryPriority}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              from {useCase.strategicAlignment.source || 'Discovery'}
                            </span>
                          </div>
                          {useCase.strategicAlignment.linkedPriorities && useCase.strategicAlignment.linkedPriorities.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {useCase.strategicAlignment.linkedPriorities.map((priority, idx) => (
                                <Badge key={idx} variant="outline" className="text-[9px] px-1 py-0 h-3.5 opacity-70">
                                  {priority}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {useCase.strategicAlignment.alignmentRationale && (
                            <p className="text-muted-foreground mt-2 italic text-[10px]">
                              {useCase.strategicAlignment.alignmentRationale}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Business Process Flow */}
                    {useCase.businessProcesses && useCase.businessProcesses.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <TreeStructure size={12} weight="bold" />
                          <span className="font-medium">Business Process Impact</span>
                        </div>
                        {useCase.businessProcesses.map((bp, idx) => (
                          <div key={idx} className="p-2 bg-muted/30 rounded-md border border-border/50">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium text-foreground">{bp.processName}</span>
                              {bp.expectedCycleTimeReduction && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-green-500/10 text-green-600 border-green-500/30">
                                  -{bp.expectedCycleTimeReduction}% cycle time
                                </Badge>
                              )}
                            </div>
                            {bp.affectedSteps && bp.affectedSteps.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap mb-2">
                                <span className="text-[10px] text-muted-foreground">Steps:</span>
                                {bp.affectedSteps.map((step, stepIdx) => (
                                  <span key={stepIdx} className="flex items-center">
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                                      {step}
                                    </Badge>
                                    {stepIdx < (bp.affectedSteps?.length ?? 0) - 1 && (
                                      <ArrowRight size={8} className="mx-0.5 text-muted-foreground" />
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                            {bp.currentPainPoints && bp.currentPainPoints.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {bp.currentPainPoints.map((pain, painIdx) => (
                                  <Badge key={painIdx} variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-amber-500/10 text-amber-600 border-amber-500/30">
                                    <Warning size={8} className="mr-0.5" />
                                    {pain}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {bp.proposedImprovement && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                <Lightning size={10} className="inline mr-1 text-blue-500" />
                                {bp.proposedImprovement}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Microsoft Solutions */}
                    {useCase.microsoftSolutions && useCase.microsoftSolutions.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Cube size={12} weight="bold" />
                          <span className="font-medium">Microsoft Solutions</span>
                        </div>
                        <div className="space-y-2">
                          {useCase.microsoftSolutions.map((solution, idx) => {
                            const colors = getProductFamilyColor(solution.productFamily)
                            return (
                              <div key={idx} className={`p-2 rounded-md border ${colors.bg} ${colors.border}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge className={`text-[10px] px-1.5 py-0 h-4 ${colors.bg} ${colors.text} border ${colors.border}`}>
                                    {solution.productFamily.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  </Badge>
                                  <span className={`text-[10px] ${colors.text} font-medium`}>{solution.role}</span>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {solution.services.map((service, svcIdx) => (
                                    <Badge key={svcIdx} variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                                      {getServiceLabel(service)}
                                    </Badge>
                                  ))}
                                </div>
                                {solution.justification && (
                                  <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                                    {solution.justification}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {useCase.referenceArchitecture && (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">Reference Architecture:</span>
                              <Badge variant="outline" className="text-xs">
                                {REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern]?.label || useCase.referenceArchitecture}
                              </Badge>
                            </div>
                            {REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern]?.layers && (
                              <ArchitectureLayerDiagram
                                architecture={REFERENCE_ARCHITECTURES[useCase.referenceArchitecture as ReferenceArchitecturePattern]}
                                compact
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Agentic AI Opportunities */}
                    {useCase.agenticOpportunities && useCase.agenticOpportunities.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Robot size={12} weight="bold" />
                          <span className="font-medium">Agentic AI Opportunities</span>
                        </div>
                        {useCase.agenticOpportunities.map((agent, idx) => (
                          <div key={idx} className="p-2 bg-purple-500/5 rounded-md border border-purple-500/20">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-foreground text-[11px]">{agent.title}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-purple-500/10 text-purple-600 border-purple-500/30">
                                {agent.agentType}
                              </Badge>
                              {agent.automationLevel && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                                  {agent.automationLevel}% automated
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mb-1.5">{agent.description}</p>
                            {agent.capabilities && agent.capabilities.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {agent.capabilities.map((cap, capIdx) => (
                                  <Badge key={capIdx} variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                                    <Sparkle size={8} className="mr-0.5" />
                                    {cap}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {agent.humanOversight && (
                              <p className="text-[9px] text-amber-600 mt-1">
                                <Info size={8} className="inline mr-1" />
                                Human oversight: {agent.humanOversight}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Implementation Complexity */}
                    {useCase.implementationComplexity && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Gauge size={12} weight="bold" />
                          <span className="font-medium">Implementation Complexity</span>
                        </div>
                        <div className={`p-2 rounded-md border ${getComplexityColor(useCase.implementationComplexity.level).bg} ${getComplexityColor(useCase.implementationComplexity.level).border}`}>
                          <div className="flex items-center gap-3 mb-2">
                            <Badge className={`text-[10px] px-1.5 py-0.5 ${getComplexityColor(useCase.implementationComplexity.level).bg} ${getComplexityColor(useCase.implementationComplexity.level).text} border ${getComplexityColor(useCase.implementationComplexity.level).border}`}>
                              {useCase.implementationComplexity.level.toUpperCase()}
                            </Badge>
                            {useCase.implementationComplexity.estimatedDuration && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock size={10} />
                                {useCase.implementationComplexity.estimatedDuration}
                              </span>
                            )}
                            {useCase.implementationComplexity.estimatedTeamSize && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Users size={10} />
                                {useCase.implementationComplexity.estimatedTeamSize}
                              </span>
                            )}
                          </div>
                          {useCase.implementationComplexity.factors && useCase.implementationComplexity.factors.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {useCase.implementationComplexity.factors.map((factor, factorIdx) => (
                                <Badge key={factorIdx} variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                                  {factor}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {useCase.implementationComplexity.keyRisks && useCase.implementationComplexity.keyRisks.length > 0 && (
                            <div className="mt-2">
                              <span className="text-[9px] text-muted-foreground font-medium">Key Risks:</span>
                              <ul className="mt-1 space-y-0.5">
                                {useCase.implementationComplexity.keyRisks.map((risk, riskIdx) => (
                                  <li key={riskIdx} className="text-[9px] text-muted-foreground flex items-start gap-1">
                                    <Warning size={8} className="mt-0.5 text-amber-500 flex-shrink-0" />
                                    {risk}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Compliance & Security Footnote Section */}
        {hasComplianceInfo && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <button
              onClick={() => setShowCompliance(!showCompliance)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <Scales size={14} />
              <ShieldCheck size={14} />
              <span>Compliance & Security Notes</span>
              {showCompliance ? <CaretUp size={12} /> : <CaretDown size={12} />}
            </button>
            
            <AnimatePresence>
              {showCompliance && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 space-y-3 text-xs">
                    {/* AI Regulations */}
                    {useCase.aiRegulations && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Scales size={12} />
                          <span className="font-medium">AI Regulations</span>
                          {useCase.aiRegulations.riskClassification && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {RISK_LEVEL_LABELS[useCase.aiRegulations.riskClassification] || useCase.aiRegulations.riskClassification}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {useCase.aiRegulations.applicableFrameworks?.map((framework) => (
                            <Badge 
                              key={framework} 
                              variant="secondary" 
                              className="text-[10px] px-1.5 py-0 h-4 bg-muted/50"
                            >
                              {REGULATION_LABELS[framework] || framework}
                            </Badge>
                          ))}
                        </div>
                        {useCase.aiRegulations.jurisdictions && useCase.aiRegulations.jurisdictions.length > 0 && (
                          <div className="text-muted-foreground">
                            <span className="font-medium">Jurisdictions:</span> {useCase.aiRegulations.jurisdictions.join(', ')}
                          </div>
                        )}
                        {useCase.aiRegulations.complianceNotes && (
                          <p className="text-muted-foreground italic">{useCase.aiRegulations.complianceNotes}</p>
                        )}
                      </div>
                    )}

                    {/* Cybersecurity */}
                    {useCase.cybersecurity && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <ShieldCheck size={12} />
                          <span className="font-medium">Cybersecurity</span>
                          {useCase.cybersecurity.dataClassification && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {DATA_CLASSIFICATION_LABELS[useCase.cybersecurity.dataClassification] || useCase.cybersecurity.dataClassification}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {useCase.cybersecurity.securityRequirements?.map((req) => (
                            <Badge 
                              key={req} 
                              variant="secondary" 
                              className="text-[10px] px-1.5 py-0 h-4 bg-muted/50"
                            >
                              {SECURITY_REQUIREMENT_LABELS[req] || req}
                            </Badge>
                          ))}
                        </div>
                        {useCase.cybersecurity.securityNotes && (
                          <p className="text-muted-foreground italic">{useCase.cybersecurity.securityNotes}</p>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* COI & Expected Value Section */}
        <div className={`${hasComplianceInfo ? '' : 'mt-4 pt-4 border-t border-border/50'} ${hasCOIInfo ? '' : 'opacity-60'}`}>
          <button
            onClick={() => setShowCOI(!showCOI)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full mt-3"
          >
            <Calculator size={14} />
            <TrendUp size={14} />
            <span>Financial Impact {hasCOIInfo ? '' : '(Not calculated)'}</span>
            {hasCOIInfo && useCase.costOfInaction?.totalAnnualCOI && (
              <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 h-4 bg-red-500/10 text-red-600 border-red-500/30">
                COI: {formatCurrency(useCase.costOfInaction.totalAnnualCOI)}/yr
              </Badge>
            )}
            {hasCOIInfo && useCase.expectedValue?.totalAnnualValue && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-600 border-green-500/30">
                Value: {formatCurrency(useCase.expectedValue.totalAnnualValue)}/yr
              </Badge>
            )}
            {showCOI ? <CaretUp size={12} className="ml-auto" /> : <CaretDown size={12} className="ml-auto" />}
          </button>
          
          <AnimatePresence>
            {showCOI && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-4 text-xs">
                  {useCase.costOfInaction && useCase.costOfInaction.totalAnnualCOI > 0 && (
                    <div className="space-y-2 rounded border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CurrencyDollar size={12} weight="bold" />
                          <span className="font-medium">Historical Cost of Inaction</span>
                          <Badge variant="outline" className="text-[10px]">Read-only</Badge>
                        </div>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatCurrency(useCase.costOfInaction.totalAnnualCOI)}/year
                        </span>
                      </div>
                      {useCase.costOfInaction.notes && (
                        <p className="text-[11px] text-muted-foreground">{useCase.costOfInaction.notes}</p>
                      )}
                    </div>
                  )}

                  {/* Expected Value Section */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <TrendUp size={12} weight="bold" />
                      <span className="font-medium">Expected Value (Annual)</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Revenue Impact</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          className="h-7 text-xs tabular-nums"
                          value={useCase.expectedValue?.revenueImpact || ''}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 0
                            const ev = useCase.expectedValue || { totalAnnualValue: 0 }
                            const updated = { 
                              ...ev, 
                              revenueImpact: value,
                              totalAnnualValue: value + (ev.costSavings || 0) + (ev.riskMitigation || 0)
                            }
                            onUpdate({ ...useCase, expectedValue: updated })
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Cost Savings</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          className="h-7 text-xs tabular-nums"
                          value={useCase.expectedValue?.costSavings || ''}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 0
                            const ev = useCase.expectedValue || { totalAnnualValue: 0 }
                            const updated = { 
                              ...ev, 
                              costSavings: value,
                              totalAnnualValue: (ev.revenueImpact || 0) + value + (ev.riskMitigation || 0)
                            }
                            onUpdate({ ...useCase, expectedValue: updated })
                          }}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Implementation Cost</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          className="h-7 text-xs tabular-nums"
                          value={useCase.expectedValue?.implementationCost || ''}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 0
                            const ev = useCase.expectedValue || { totalAnnualValue: 0 }
                            const totalAnnualValue = (ev.revenueImpact || 0) + (ev.costSavings || 0) + (ev.riskMitigation || 0)
                            const paybackMonths = totalAnnualValue > 0 ? Math.ceil((value / totalAnnualValue) * 12) : undefined
                            const threeYearROI = value > 0 ? Math.round(((totalAnnualValue * 3 - value) / value) * 100) : undefined
                            const updated = { 
                              ...ev, 
                              implementationCost: value,
                              paybackMonths,
                              threeYearROI
                            }
                            onUpdate({ ...useCase, expectedValue: updated })
                          }}
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        {useCase.expectedValue?.paybackMonths && (
                          <div className="text-[10px] text-muted-foreground">
                            Payback: <span className="font-medium text-foreground">{useCase.expectedValue.paybackMonths} months</span>
                          </div>
                        )}
                        {useCase.expectedValue?.threeYearROI && (
                          <div className="text-[10px] text-muted-foreground">
                            3-Year ROI: <span className="font-medium text-green-600">{useCase.expectedValue.threeYearROI}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {useCase.expectedValue && useCase.expectedValue.totalAnnualValue > 0 && (
                      <div className="p-2 bg-green-500/10 rounded border border-green-500/20 flex items-center justify-between">
                        <span className="text-green-600 font-medium">Total Annual Value</span>
                        <span className="text-green-600 font-bold tabular-nums">
                          {formatCurrency(useCase.expectedValue.totalAnnualValue)}/year
                        </span>
                      </div>
                    )}
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {showCostBreakdown && (
            <div className="mt-3">
              <UseCaseCostBreakdown useCase={useCase} onUpdate={onUpdate} />
            </div>
          )}
          {showBusinessCase && (
            <div className="mt-3">
              <BusinessCase useCase={useCase} onUpdate={onUpdate} onClose={() => setShowBusinessCase(false)} />
            </div>
          )}
        </div>
        </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
