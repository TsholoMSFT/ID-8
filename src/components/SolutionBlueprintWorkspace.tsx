/**
 * SolutionBlueprintWorkspace
 * ----------------------------------------------------------------------------
 * Innovation-Hub workflow for customers who arrive with one or more identified
 * use cases. Captures the customer's existing technology estate, then for
 * each use case generates two side-by-side blueprints:
 *
 *   • Best-fit             — optimal stack ignoring incumbency
 *   • Estate-optimized     — maximizes reuse of what the customer already owns
 *
 * Deterministic v1 (no AI calls); state persisted to localStorage so an
 * architect can iterate within the hub session.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { Customer } from '@/lib/types'
import {
  ARCHETYPES,
  ARCHETYPE_BY_ID,
  BLUEPRINT_LAYER_LABELS,
  CAPABILITIES,
  CAPABILITY_BY_ID,
  EMPTY_ESTATE,
  SERVICE_CATALOG,
  SERVICE_BY_ID,
  generateBlueprints,
  type ArchetypeDef,
  type Blueprint,
  type BlueprintLayer,
  type BlueprintResult,
  type CapabilityId,
  type TechnologyEstate,
  type UseCaseInput,
} from '@/lib/solution-blueprint'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  ArrowRight,
  Buildings,
  CheckCircle,
  CloudArrowUp,
  Database,
  Lightning,
  Lightbulb,
  Plugs,
  Plus,
  ShieldCheck,
  Sparkle,
  TreeStructure,
  Trash,
  Warning,
  Handshake,
  X,
} from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { EstateBanner } from './solution-blueprint/EstateBanner'
import { LearnMorePopover } from './solution-blueprint/LearnMorePopover'
import { IQConnectionsPanel, type IQInsightHint } from './solution-blueprint/IQConnectionsPanel'
import { InternalSalesUpload } from './InternalSalesUpload'
import { ESTATE_TEMPLATES, applyEstateTemplate } from '@/lib/solution-blueprint/estate-templates'
import { BlueprintCopilotRail } from './solution-blueprint/BlueprintCopilotRail'
import { BlueprintAgentRunner } from './solution-blueprint/BlueprintAgentRunner'
import {
  runIQDiscovery,
  generateStarterUseCases,
  recommendArchetype,
  generateExecBrief,
  type BlueprintAIMode,
  type CopilotState,
  type CopilotSuggestion,
} from '@/lib/blueprint-copilot-service'
import { lazy, Suspense } from 'react'

const BlueprintDiagram = lazy(() =>
  import('@/components/diagrams').then(m => ({ default: m.BlueprintDiagram })),
)

interface SolutionBlueprintWorkspaceProps {
  /** All known customers — used to scope the estate per customer. */
  customers: Customer[]
  /** Optional initially-selected customer id. */
  initialCustomerId?: string | null
  /** Optional pre-filled use case (typically from a discovered UseCase). */
  initialUseCase?: {
    name: string
    description?: string
    archetypeId?: string
    sovereigntyRequired?: boolean
    /** Back-link to the originating UseCase.id, if any. */
    sourceUseCaseId?: string
  } | null
  /**
   * Phase 4: mirror selected blueprint metadata back onto the canonical
   * UseCase. Called whenever a draft with a `sourceUseCaseId` is created or
   * mutated so the prioritization matrix and exec-summary annex can derive
   * signals from `useCases` directly.
   */
  onLinkBlueprint?: (
    sourceUseCaseId: string,
    payload: {
      archetypeId?: string
      sovereigntyRequired?: boolean
      extraCapabilities?: string[]
      draftId?: string
      linkedAt: number
    },
  ) => void
}

const LAYER_ICONS: Record<BlueprintLayer, React.ReactNode> = {
  'app-ai': <Sparkle size={16} weight="duotone" />,
  data: <Database size={16} weight="duotone" />,
  infrastructure: <CloudArrowUp size={16} weight="duotone" />,
  identity: <ShieldCheck size={16} weight="duotone" />,
  security: <ShieldCheck size={16} weight="duotone" />,
  operations: <Lightning size={16} weight="duotone" />,
}

const LAYER_ORDER: BlueprintLayer[] = ['app-ai', 'data', 'infrastructure', 'identity', 'security', 'operations']

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function SolutionBlueprintWorkspace({ customers, initialCustomerId, initialUseCase, onLinkBlueprint }: SolutionBlueprintWorkspaceProps) {
  // ── Customer + estate selection ─────────────────────────────
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    initialCustomerId ?? customers[0]?.id ?? null,
  )
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null

  const [estatesByCustomer, setEstatesByCustomer] = useLocalStorage<Record<string, TechnologyEstate>>(
    'solution-blueprint-estates',
    {},
  )

  const estate: TechnologyEstate | null = useMemo(() => {
    if (!selectedCustomer) return null
    const existing = estatesByCustomer[selectedCustomer.id]
    if (existing) return existing
    return {
      id: makeId(),
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      updatedAt: Date.now(),
      ...EMPTY_ESTATE,
    }
  }, [selectedCustomer, estatesByCustomer])

  const updateEstate = (patch: Partial<TechnologyEstate>) => {
    if (!estate || !selectedCustomer) return
    const next: TechnologyEstate = { ...estate, ...patch, updatedAt: Date.now() }
    setEstatesByCustomer({ ...estatesByCustomer, [selectedCustomer.id]: next })
  }

  // ── Use cases (per customer, persisted) ─────────────────────
  type StoredUseCase = UseCaseInput & { id: string; sourceUseCaseId?: string }
  const [useCasesByCustomer, setUseCasesByCustomer] = useLocalStorage<Record<string, StoredUseCase[]>>(
    'solution-blueprint-usecases',
    {},
  )
  const useCases = selectedCustomer ? useCasesByCustomer[selectedCustomer.id] ?? [] : []

  const setUseCases = (next: StoredUseCase[]) => {
    if (!selectedCustomer) return
    setUseCasesByCustomer({ ...useCasesByCustomer, [selectedCustomer.id]: next })
  }

  const [activeUseCaseId, setActiveUseCaseId] = useState<string | null>(null)
  const activeUseCase = useCases.find((u) => u.id === activeUseCaseId) ?? null

  // ── Blueprint Copilot (AI rail) ───────────────────────────
  const [aiMode, setAiMode] = useLocalStorage<BlueprintAIMode>('id8-blueprint-ai-mode', 'suggest')
  const [activeTab, setActiveTab] = useState<string>('estate')
  const [copilotRunning, setCopilotRunning] = useState(false)
  const [copilotActivity, setCopilotActivity] = useState<string | null>(null)
  const [iqAutoPulled, setIqAutoPulled] = useLocalStorage<Record<string, number>>('id8-iq-autopulled', {})
  const [iqGroundingByCustomer, setIqGroundingByCustomer] = useState<Record<string, string>>({})

  // ── Seed from incoming initialUseCase (e.g., from a discovered UseCase) ──
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    if (!initialUseCase || !selectedCustomer) return
    seededRef.current = true
    const existing = useCases.find(u => u.sourceUseCaseId && initialUseCase.sourceUseCaseId && u.sourceUseCaseId === initialUseCase.sourceUseCaseId)
    if (existing) {
      setActiveUseCaseId(existing.id)
      return
    }
    const next: StoredUseCase = {
      id: makeId(),
      name: initialUseCase.name,
      description: initialUseCase.description ?? '',
      archetypeId: initialUseCase.archetypeId,
      extraCapabilities: [],
      sovereigntyRequired: initialUseCase.sovereigntyRequired,
      sourceUseCaseId: initialUseCase.sourceUseCaseId,
    }
    setUseCases([...useCases, next])
    setActiveUseCaseId(next.id)
    if (next.sourceUseCaseId && onLinkBlueprint) {
      onLinkBlueprint(next.sourceUseCaseId, {
        archetypeId: next.archetypeId,
        sovereigntyRequired: next.sovereigntyRequired,
        extraCapabilities: next.extraCapabilities,
        draftId: next.id,
        linkedAt: Date.now(),
      })
    }
    toast.success(`Pre-filled blueprint from “${initialUseCase.name}”`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUseCase, selectedCustomer])

  // ── Generated blueprints (in-memory; cheap to recompute) ────
  const blueprintResult: BlueprintResult | null = useMemo(() => {
    if (!estate || !activeUseCase) return null
    if (!activeUseCase.archetypeId && (activeUseCase.extraCapabilities?.length ?? 0) === 0) {
      return null
    }
    return generateBlueprints(activeUseCase, estate)
  }, [estate, activeUseCase])

  // ── Handlers ────────────────────────────────────────────────
  const addUseCase = () => {
    if (!selectedCustomer) {
      toast.error('Select a customer first')
      return
    }
    const next: StoredUseCase = {
      id: makeId(),
      name: 'New use case',
      description: '',
      archetypeId: undefined,
      extraCapabilities: [],
    }
    setUseCases([...useCases, next])
    setActiveUseCaseId(next.id)
  }

  const updateUseCase = (id: string, patch: Partial<UseCaseInput>) => {
    const nextList = useCases.map((u) => (u.id === id ? { ...u, ...patch } : u))
    setUseCases(nextList)
    const updated = nextList.find((u) => u.id === id)
    if (updated?.sourceUseCaseId && onLinkBlueprint) {
      onLinkBlueprint(updated.sourceUseCaseId, {
        archetypeId: updated.archetypeId,
        sovereigntyRequired: updated.sovereigntyRequired,
        extraCapabilities: updated.extraCapabilities,
        draftId: updated.id,
        linkedAt: Date.now(),
      })
    }
  }

  const removeUseCase = (id: string) => {
    setUseCases(useCases.filter((u) => u.id !== id))
    if (activeUseCaseId === id) setActiveUseCaseId(null)
  }

  // ── Copilot dispatcher ──────────────────────────────────────
  const copilotState: CopilotState = useMemo(
    () => ({
      customerId: selectedCustomer?.id ?? null,
      customerName: selectedCustomer?.name ?? null,
      hasEstate: !!estate,
      iqPulledAt: selectedCustomer ? iqAutoPulled[selectedCustomer.id] ?? null : null,
      useCaseCount: useCases.length,
      hasActiveUseCase: !!activeUseCase,
      activeUseCaseHasArchetype: !!activeUseCase?.archetypeId,
      hasBlueprint: !!blueprintResult,
    }),
    [selectedCustomer, estate, iqAutoPulled, useCases.length, activeUseCase, blueprintResult],
  )

  const applyIQHits = (hits: IQInsightHint[]) => {
    if (!estate || !hits.length) return
    const stamp = new Date().toISOString().slice(0, 10)
    const lines = hits.map((h) => `- [${h.source.toUpperCase()}] ${h.label}${h.detail ? ` — ${h.detail}` : ''}`)
    const block = `\n\n## IQ insights (${stamp})\n${lines.join('\n')}`
    updateEstate({ notes: `${estate.notes || ''}${block}`.trim() })
  }

  const runIQAndApply = async () => {
    if (!selectedCustomer || !estate) return 0
    const result = await runIQDiscovery(selectedCustomer.name)
    setIqGroundingByCustomer((prev) => ({ ...prev, [selectedCustomer.id]: result.groundingNote }))
    setIqAutoPulled({ ...iqAutoPulled, [selectedCustomer.id]: Date.now() })
    const hits: IQInsightHint[] = result.hits.slice(0, 8).map((h, i) => ({
      source: 'graph',
      kind: 'context-note',
      id: `iq:${h.id || i}`,
      label: h.title || h.snippet || `Insight ${i + 1}`,
      detail: h.snippet || h.url,
    }))
    applyIQHits(hits)
    return result.hits.length
  }

  const handleCopilotAction = async (s: CopilotSuggestion) => {
    if (!selectedCustomer || !estate) return
    setCopilotRunning(true)
    setCopilotActivity(null)
    try {
      const grounding = iqGroundingByCustomer[selectedCustomer.id] || ''
      switch (s.action) {
        case 'pull-iq': {
          const n = await runIQAndApply()
          setCopilotActivity(`Pulled ${n} insight${n === 1 ? '' : 's'} from IQ connectors.`)
          setActiveTab('connect-data')
          break
        }
        case 'generate-use-cases': {
          const generated = await generateStarterUseCases({
            customerId: selectedCustomer.id,
            customerName: selectedCustomer.name,
            estate,
            groundingNote: grounding,
          })
          if (generated.length) {
            const next: StoredUseCase[] = [
              ...useCases,
              ...generated.map((g) => ({
                id: makeId(),
                name: g.name,
                description: g.description,
                archetypeId: g.archetypeId,
                extraCapabilities: [],
              })),
            ]
            setUseCases(next)
            setActiveUseCaseId(next[useCases.length]?.id ?? null)
            setCopilotActivity(`Generated ${generated.length} starter use case${generated.length === 1 ? '' : 's'}.`)
            setActiveTab('use-cases')
          } else {
            setCopilotActivity('No use cases generated — try refining the estate notes.')
          }
          break
        }
        case 'recommend-archetype': {
          if (!activeUseCase) break
          const rec = await recommendArchetype({
            customerId: selectedCustomer.id,
            useCase: activeUseCase,
            estate,
            groundingNote: grounding,
          })
          if (rec) {
            updateUseCase(activeUseCase.id, { archetypeId: rec.archetypeId })
            setCopilotActivity(`Recommended archetype: ${rec.archetype.name}. ${rec.rationale}`)
            setActiveTab('use-cases')
          } else {
            setCopilotActivity('Could not pick an archetype confidently.')
          }
          break
        }
        case 'generate-business-case': {
          if (!activeUseCase) break
          setCopilotActivity('Open the active use case card and click "Business case" to generate the markdown.')
          setActiveTab('use-cases')
          break
        }
        case 'generate-exec-brief': {
          const brief = await generateExecBrief({
            customerId: selectedCustomer.id,
            customerName: selectedCustomer.name,
            estate,
            useCases: useCases.map((u) => ({
              name: u.name,
              description: u.description,
              archetypeName: u.archetypeId ? ARCHETYPE_BY_ID[u.archetypeId]?.name : undefined,
            })),
            groundingNote: grounding,
          })
          if (brief) {
            const stamp = new Date().toISOString().slice(0, 10)
            updateEstate({ notes: `${estate.notes || ''}\n\n## Executive brief (${stamp})\n${brief}`.trim() })
            setCopilotActivity('Executive brief generated and appended to estate notes.')
            setActiveTab('commitments')
          }
          break
        }
        case 'open-tab': {
          setActiveTab(s.tab)
          break
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Copilot action failed')
      setCopilotActivity(`Failed: ${err?.message || 'unknown error'}`)
    } finally {
      setCopilotRunning(false)
    }
  }

  // ── Auto-pull IQ when a new customer is selected (B-slice) ──
  useEffect(() => {
    if (!selectedCustomer || !estate) return
    if (aiMode === 'off') return
    if (iqAutoPulled[selectedCustomer.id]) return
    void runIQAndApply().catch(() => {/* swallow — connectors may not be configured */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id, aiMode])

  // ── Render ──────────────────────────────────────────────────
  if (customers.length === 0) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle>No customer selected</CardTitle>
          <CardDescription>
            Create a customer first — the technology estate is captured per customer and reused across all use cases.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Customer selector */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Buildings size={22} weight="duotone" className="text-primary" />
                Solution Blueprint
              </CardTitle>
              <CardDescription>
                Customer-led envisioning. Capture the estate once, then generate two paths per use case:
                <strong> Best-fit</strong> vs <strong>Estate-optimized</strong>.
              </CardDescription>
              <div className="mt-3">
                <EstateBanner estate={estate} />
              </div>
            </div>
            <div className="min-w-64">
              <Label className="text-xs text-muted-foreground mb-1 block">Customer</Label>
              <Select
                value={selectedCustomerId ?? undefined}
                onValueChange={(v) => {
                  setSelectedCustomerId(v)
                  setActiveUseCaseId(null)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {estate && selectedCustomer && (
        <div className={aiMode !== 'off' ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start' : ''}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="estate" className="gap-2">
              <Buildings size={16} weight="duotone" /> Technology estate
            </TabsTrigger>
            <TabsTrigger value="connect-data" className="gap-2">
              <Plugs size={16} weight="duotone" /> Connect data
            </TabsTrigger>
            <TabsTrigger value="use-cases" className="gap-2">
              <Lightbulb size={16} weight="duotone" /> Use cases ({useCases.length})
            </TabsTrigger>
            <TabsTrigger value="blueprints" className="gap-2" disabled={!activeUseCase}>
              <Sparkle size={16} weight="duotone" /> Blueprints
            </TabsTrigger>
            <TabsTrigger value="diagrams" className="gap-2" disabled={!blueprintResult}>
              <TreeStructure size={16} weight="duotone" /> Diagrams
            </TabsTrigger>
            <TabsTrigger value="commitments" className="gap-2" disabled={!activeUseCase}>
              <Handshake size={16} weight="duotone" /> Mutual commitments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="estate">
            <EstatePanel estate={estate} onChange={updateEstate} />
          </TabsContent>

          <TabsContent value="connect-data">
            <div className="space-y-4">
              <IQConnectionsPanel
                customerName={selectedCustomer.name}
                onApplyHints={(hints: IQInsightHint[]) => {
                  if (!hints.length) return
                  const stamp = new Date().toISOString().slice(0, 10)
                  const lines = hints.map(
                    (h) => `- [${h.source.toUpperCase()}] ${h.label}${h.detail ? ` — ${h.detail}` : ''}`,
                  )
                  const block = `\n\n## IQ insights (${stamp})\n${lines.join('\n')}`
                  updateEstate({ notes: `${estate.notes || ''}${block}`.trim() })
                  toast.success('Insights appended to estate notes — they will ground the blueprint generator.')
                }}
              />
              <InternalSalesUpload
                customerId={selectedCustomer.id}
                customerName={selectedCustomer.name}
              />
            </div>
          </TabsContent>

          <TabsContent value="use-cases">
            <UseCasesPanel
              useCases={useCases}
              activeUseCaseId={activeUseCaseId}
              onSelect={setActiveUseCaseId}
              onAdd={addUseCase}
              onUpdate={updateUseCase}
              onRemove={removeUseCase}
            />
          </TabsContent>

          <TabsContent value="blueprints">
            {blueprintResult ? (
              <BlueprintsPanel result={blueprintResult} estate={estate} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No blueprint yet</CardTitle>
                  <CardDescription>
                    Pick a use case in the Use cases tab and select an archetype (or add at least one capability) to
                    generate dual blueprints.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="diagrams">
            {blueprintResult ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TreeStructure size={18} weight="duotone" /> Architecture diagrams
                  </CardTitle>
                  <CardDescription>
                    Auto-generated from the active blueprint. Reused services are green, net-new are blue, gaps are
                    dashed red.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Suspense fallback={<div className="h-72 animate-pulse rounded-md bg-muted" />}>
                    <BlueprintDiagram
                      result={blueprintResult}
                      useCaseId={activeUseCase?.sourceUseCaseId ?? activeUseCaseId ?? undefined}
                    />
                  </Suspense>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No diagram yet</CardTitle>
                  <CardDescription>Generate a blueprint first to render its architecture diagram.</CardDescription>
                </CardHeader>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="commitments">
            {activeUseCase ? (
              <CommitmentsPanel
                useCase={activeUseCase}
                onUpdate={(patch) => updateUseCase(activeUseCase.id, patch)}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No use case selected</CardTitle>
                  <CardDescription>Pick a use case in the Use cases tab to capture mutual commitments.</CardDescription>
                </CardHeader>
              </Card>
            )}
          </TabsContent>
        </Tabs>
        {aiMode !== 'off' && (
          <div className="lg:sticky lg:top-4 space-y-3">
            {aiMode === 'autopilot' && selectedCustomer && (
              <BlueprintAgentRunner
                customerId={selectedCustomer.id}
                customerName={selectedCustomer.name}
                estateNotes={estate?.notes}
                groundingNote={iqGroundingByCustomer[selectedCustomer.id]}
              />
            )}
            <BlueprintCopilotRail
              state={copilotState}
              mode={aiMode}
              onModeChange={setAiMode}
              isRunning={copilotRunning}
              lastActivity={copilotActivity}
              onAction={handleCopilotAction}
            />
          </div>
        )}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Estate panel
// ───────────────────────────────────────────────────────────────────────────

function EstatePanel({
  estate,
  onChange,
}: {
  estate: TechnologyEstate
  onChange: (patch: Partial<TechnologyEstate>) => void
}) {
  const ownedSet = new Set(estate.ownedServiceIds)
  const toggleOwned = (id: string) => {
    const next = new Set(ownedSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange({ ownedServiceIds: Array.from(next) })
  }

  const grouped = useMemo(() => {
    const map: Record<BlueprintLayer, typeof SERVICE_CATALOG> = {
      'app-ai': [],
      data: [],
      infrastructure: [],
      identity: [],
      security: [],
      operations: [],
    }
    SERVICE_CATALOG.forEach((s) => map[s.layer].push(s))
    return map
  }, [])

  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quick start: estate templates</CardTitle>
          <CardDescription className="text-xs">
            One-click presets for common starting postures. They merge with what you've already set —
            owned services are added (not replaced); other fields adopt the template.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ESTATE_TEMPLATES.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant="outline"
              className="h-auto py-1.5 px-2 text-[11px]"
              title={t.description}
              onClick={() => {
                onChange(applyEstateTemplate(estate, t.id))
                toast.success(`Applied estate template: ${t.label}`)
              }}
            >
              {t.label}
            </Button>
          ))}
        </CardContent>
      </Card>

    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Cloud footprint &amp; posture</CardTitle>
          <CardDescription>Coarse signals that drive blueprint constraints.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Primary cloud</Label>
              <Select
                value={estate.primaryCloud}
                onValueChange={(v) => onChange({ primaryCloud: v as TechnologyEstate['primaryCloud'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="azure">Azure</SelectItem>
                  <SelectItem value="aws">AWS</SelectItem>
                  <SelectItem value="gcp">GCP</SelectItem>
                  <SelectItem value="multi">Multi-cloud</SelectItem>
                  <SelectItem value="on-prem">On-prem only</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Identity provider</Label>
              <Select
                value={estate.identityProvider}
                onValueChange={(v) => onChange({ identityProvider: v as TechnologyEstate['identityProvider'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entra-id">Microsoft Entra ID</SelectItem>
                  <SelectItem value="okta">Okta</SelectItem>
                  <SelectItem value="ping">Ping</SelectItem>
                  <SelectItem value="ad-fs">AD FS</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">CI/CD platform</Label>
              <Select
                value={estate.cicdPlatform}
                onValueChange={(v) => onChange({ cicdPlatform: v as TechnologyEstate['cicdPlatform'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="github-actions">GitHub Actions</SelectItem>
                  <SelectItem value="azure-devops">Azure DevOps</SelectItem>
                  <SelectItem value="gitlab">GitLab</SelectItem>
                  <SelectItem value="jenkins">Jenkins</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">IaC platform</Label>
              <Select
                value={estate.iacPlatform}
                onValueChange={(v) => onChange({ iacPlatform: v as TechnologyEstate['iacPlatform'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bicep">Bicep</SelectItem>
                  <SelectItem value="terraform">Terraform</SelectItem>
                  <SelectItem value="arm">ARM</SelectItem>
                  <SelectItem value="pulumi">Pulumi</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <PostureToggle
              label="Sovereignty required"
              checked={estate.sovereigntyRequired}
              onChange={(b) => onChange({ sovereigntyRequired: b })}
            />
            <PostureToggle
              label="Has Azure"
              checked={estate.hasAzure}
              onChange={(b) => onChange({ hasAzure: b })}
            />
            <PostureToggle
              label="Has AWS"
              checked={estate.hasAws}
              onChange={(b) => onChange({ hasAws: b })}
            />
            <PostureToggle
              label="Has GCP"
              checked={estate.hasGcp}
              onChange={(b) => onChange({ hasGcp: b })}
            />
            <PostureToggle
              label="On-prem"
              checked={estate.hasOnPrem}
              onChange={(b) => onChange({ hasOnPrem: b })}
            />
            <PostureToggle
              label="Managed identity in use"
              checked={estate.hasManagedIdentity}
              onChange={(b) => onChange({ hasManagedIdentity: b })}
            />
            <PostureToggle
              label="Defender for Cloud"
              checked={estate.hasDefenderForCloud}
              onChange={(b) => onChange({ hasDefenderForCloud: b })}
            />
            <PostureToggle
              label="Sentinel"
              checked={estate.hasSentinel}
              onChange={(b) => onChange({ hasSentinel: b })}
            />
            <PostureToggle
              label="Purview"
              checked={estate.hasPurview}
              onChange={(b) => onChange({ hasPurview: b })}
            />
            <PostureToggle
              label="Key Vault"
              checked={estate.hasKeyVault}
              onChange={(b) => onChange({ hasKeyVault: b })}
            />
            <PostureToggle
              label="Private endpoints"
              checked={estate.hasPrivateEndpoints}
              onChange={(b) => onChange({ hasPrivateEndpoints: b })}
            />
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={estate.notes ?? ''}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Approved-vendor list, no-go services, regulated data classes, etc."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service inventory</CardTitle>
          <CardDescription>
            Tick what the customer already owns or runs. Reused services drive the Estate-optimized path.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[520px] pr-3">
            <div className="space-y-4">
              {LAYER_ORDER.map((layer) => (
                <div key={layer}>
                  <div className="flex items-center gap-2 mb-2">
                    {LAYER_ICONS[layer]}
                    <h4 className="font-semibold text-sm">{BLUEPRINT_LAYER_LABELS[layer]}</h4>
                  </div>
                  <div className="space-y-1.5">
                    {grouped[layer].map((s) => (
                      <label
                        key={s.id}
                        className="flex items-start gap-2 text-sm hover:bg-muted/40 rounded px-2 py-1 cursor-pointer"
                      >
                        <Checkbox
                          checked={ownedSet.has(s.id)}
                          onCheckedChange={() => toggleOwned(s.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.name}</span>
                            <Badge variant="outline" className="text-[10px] py-0">
                              {s.vendor}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {s.capabilities.slice(0, 4).map((c) => CAPABILITY_BY_ID[c]?.name ?? c).join(' · ')}
                            {s.capabilities.length > 4 ? ' · …' : ''}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <Separator className="mt-3" />
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          {estate.ownedServiceIds.length} service{estate.ownedServiceIds.length === 1 ? '' : 's'} marked as owned.
        </CardFooter>
      </Card>
    </div>
    </div>
  )
}

function PostureToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (b: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border bg-card">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Use cases panel
// ───────────────────────────────────────────────────────────────────────────

function CommitmentsPanel({
  useCase,
  onUpdate,
}: {
  useCase: UseCaseInput
  onUpdate: (patch: Partial<UseCaseInput>) => void
}) {
  const cust = useCase.customerCommitment ?? {}
  const ms = useCase.microsoftCommitment ?? {}
  const setCust = (patch: Partial<NonNullable<UseCaseInput['customerCommitment']>>) =>
    onUpdate({ customerCommitment: { ...cust, ...patch } })
  const setMs = (patch: Partial<NonNullable<UseCaseInput['microsoftCommitment']>>) =>
    onUpdate({ microsoftCommitment: { ...ms, ...patch } })

  const dms = cust.decisionMakers ?? []
  const team = ms.team ?? []

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Buildings size={18} weight="duotone" /> Customer commitment
          </CardTitle>
          <CardDescription>What the customer puts in. Without this, the blueprint is hypothetical.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Decision makers &amp; sponsors</Label>
            <div className="space-y-1 mt-1">
              {dms.map((dm, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    value={dm.name}
                    placeholder="Name"
                    className="h-8 text-xs"
                    onChange={(e) =>
                      setCust({ decisionMakers: dms.map((d, j) => (j === i ? { ...d, name: e.target.value } : d)) })
                    }
                  />
                  <Input
                    value={dm.role}
                    placeholder="Role"
                    className="h-8 text-xs"
                    onChange={(e) =>
                      setCust({ decisionMakers: dms.map((d, j) => (j === i ? { ...d, role: e.target.value } : d)) })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setCust({ decisionMakers: dms.filter((_, j) => j !== i) })}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setCust({ decisionMakers: [...dms, { name: '', role: '' }] })}
              >
                <Plus size={12} className="mr-1" /> Add decision maker
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Hours / week</Label>
              <Input
                type="number"
                min={0}
                value={cust.hoursPerWeek ?? ''}
                onChange={(e) => setCust({ hoursPerWeek: e.target.value === '' ? undefined : Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Change-mgmt budget ($)</Label>
              <Input
                type="number"
                min={0}
                value={cust.changeManagementBudget ?? ''}
                onChange={(e) =>
                  setCust({ changeManagementBudget: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Data access required</Label>
            <textarea
              value={cust.dataAccess ?? ''}
              onChange={(e) => setCust({ dataAccess: e.target.value })}
              placeholder="e.g. read-only access to production CRM by Mar 1"
              className="w-full min-h-[60px] rounded border bg-background px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <textarea
              value={cust.notes ?? ''}
              onChange={(e) => setCust({ notes: e.target.value })}
              placeholder="Customer-side notes"
              className="w-full min-h-[40px] rounded border bg-background px-2 py-1.5 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkle size={18} weight="duotone" /> Microsoft commitment
          </CardTitle>
          <CardDescription>What we put in. Symmetric accountability — Khalsa's mutual agenda.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Team</Label>
            <div className="space-y-1 mt-1">
              {team.map((t, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    value={t.name}
                    placeholder="Name"
                    className="h-8 text-xs"
                    onChange={(e) =>
                      setMs({ team: team.map((m, j) => (j === i ? { ...m, name: e.target.value } : m)) })
                    }
                  />
                  <Input
                    value={t.role}
                    placeholder="Role"
                    className="h-8 text-xs"
                    onChange={(e) =>
                      setMs({ team: team.map((m, j) => (j === i ? { ...m, role: e.target.value } : m)) })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setMs({ team: team.filter((_, j) => j !== i) })}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setMs({ team: [...team, { name: '', role: '' }] })}
              >
                <Plus size={12} className="mr-1" /> Add team member
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Hours / week</Label>
            <Input
              type="number"
              min={0}
              value={ms.hoursPerWeek ?? ''}
              onChange={(e) => setMs({ hoursPerWeek: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <textarea
              value={ms.notes ?? ''}
              onChange={(e) => setMs({ notes: e.target.value })}
              placeholder="Microsoft-side notes"
              className="w-full min-h-[40px] rounded border bg-background px-2 py-1.5 text-xs"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function UseCasesPanel({
  useCases,
  activeUseCaseId,
  onSelect,
  onAdd,
  onUpdate,
  onRemove,
}: {
  useCases: Array<UseCaseInput & { id: string }>
  activeUseCaseId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<UseCaseInput>) => void
  onRemove: (id: string) => void
}) {
  const active = useCases.find((u) => u.id === activeUseCaseId) ?? null

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Identified use cases</CardTitle>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onAdd}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {useCases.length === 0 && (
            <p className="text-sm text-muted-foreground">No use cases yet. Add the ones the customer brought to the hub.</p>
          )}
          {useCases.map((u) => (
            <button
              key={u.id}
              onClick={() => onSelect(u.id)}
              className={`w-full text-left rounded border px-3 py-2 text-sm transition-colors ${
                activeUseCaseId === u.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              }`}
            >
              <div className="font-medium truncate">{u.name || 'Untitled'}</div>
              {u.archetypeId && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {ARCHETYPE_BY_ID[u.archetypeId]?.name ?? u.archetypeId}
                </div>
              )}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        {active ? (
          <UseCaseEditor
            useCase={active}
            onUpdate={(patch) => onUpdate(active.id, patch)}
            onRemove={() => onRemove(active.id)}
          />
        ) : (
          <CardHeader>
            <CardTitle>Select a use case</CardTitle>
            <CardDescription>
              Pick one from the list to define its archetype and required capabilities, or add a new one.
            </CardDescription>
          </CardHeader>
        )}
      </Card>
    </div>
  )
}

function UseCaseEditor({
  useCase,
  onUpdate,
  onRemove,
}: {
  useCase: UseCaseInput
  onUpdate: (patch: Partial<UseCaseInput>) => void
  onRemove: () => void
}) {
  const archetype = useCase.archetypeId ? ARCHETYPE_BY_ID[useCase.archetypeId] : null
  const extra = new Set(useCase.extraCapabilities ?? [])
  const toggleExtra = (cap: CapabilityId) => {
    const next = new Set(extra)
    if (next.has(cap)) next.delete(cap)
    else next.add(cap)
    onUpdate({ extraCapabilities: Array.from(next) })
  }

  return (
    <>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Input
              value={useCase.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Use case name"
              className="text-lg font-semibold"
            />
            <Textarea
              value={useCase.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Business problem and desired outcome"
              rows={2}
            />
          </div>
          <Button variant="ghost" size="icon" onClick={onRemove} title="Remove use case">
            <Trash size={18} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs">Archetype</Label>
          <Select
            value={useCase.archetypeId ?? '__none__'}
            onValueChange={(v) => onUpdate({ archetypeId: v === '__none__' ? undefined : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick an archetype" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No archetype (use extra capabilities only)</SelectItem>
              {ARCHETYPES.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {archetype && (
            <p className="text-xs text-muted-foreground mt-2">{archetype.description}</p>
          )}
        </div>

        <div className="flex items-center justify-between rounded border px-3 py-2">
          <Label htmlFor={`sov-${useCase.archetypeId ?? 'na'}`} className="text-sm">
            Sovereignty required for this use case
          </Label>
          <Switch
            id={`sov-${useCase.archetypeId ?? 'na'}`}
            checked={useCase.sovereigntyRequired ?? false}
            onCheckedChange={(b) => onUpdate({ sovereigntyRequired: b })}
          />
        </div>

        {archetype && (
          <ArchetypeSummary archetype={archetype} />
        )}

        <div>
          <Label className="text-xs">Extra capabilities (optional)</Label>
          <ScrollArea className="h-48 mt-1 rounded border p-2">
            <div className="space-y-1">
              {LAYER_ORDER.map((layer) => {
                const caps = CAPABILITIES.filter((c) => c.layer === layer)
                return (
                  <div key={layer}>
                    <div className="text-[11px] font-semibold text-muted-foreground mt-2 mb-1 uppercase tracking-wide">
                      {BLUEPRINT_LAYER_LABELS[layer]}
                    </div>
                    {caps.map((c) => (
                      <label key={c.id} className="flex items-start gap-2 text-xs px-1 py-0.5 cursor-pointer">
                        <Checkbox
                          checked={extra.has(c.id)}
                          onCheckedChange={() => toggleExtra(c.id)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground"> — {c.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </>
  )
}

function ArchetypeSummary({ archetype }: { archetype: ArchetypeDef }) {
  return (
    <div className="rounded border bg-muted/30 p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <Sparkle size={14} weight="duotone" className="text-primary" />
        <strong className="text-sm">{archetype.name}</strong>
      </div>
      <div>
        <div className="font-semibold mb-0.5">Required capabilities</div>
        <div className="flex flex-wrap gap-1">
          {archetype.requiredCapabilities.map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px]">
              {CAPABILITY_BY_ID[c]?.name ?? c}
            </Badge>
          ))}
        </div>
      </div>
      {archetype.recommendedCapabilities && archetype.recommendedCapabilities.length > 0 && (
        <div>
          <div className="font-semibold mb-0.5">Recommended</div>
          <div className="flex flex-wrap gap-1">
            {archetype.recommendedCapabilities.map((c) => (
              <Badge key={c} variant="outline" className="text-[10px]">
                {CAPABILITY_BY_ID[c]?.name ?? c}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="font-semibold mb-0.5 flex items-center gap-1">
          <Warning size={12} className="text-amber-600" /> Risks to address
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
          {archetype.risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      {archetype.pilotCostBandUsd && (
        <div className="text-muted-foreground">
          Indicative pilot cost band: ${archetype.pilotCostBandUsd.min.toLocaleString()} – $
          {archetype.pilotCostBandUsd.max.toLocaleString()} / month
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Blueprints panel — side-by-side dual paths
// ───────────────────────────────────────────────────────────────────────────

function BlueprintsPanel({ result, estate }: { result: BlueprintResult; estate: TechnologyEstate }) {
  return (
    <div className="space-y-4">
      <Card className="border-2 border-primary/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{result.useCase.name}</CardTitle>
              <CardDescription>{result.useCase.description || 'No description provided.'}</CardDescription>
            </div>
            {result.archetype && (
              <Badge variant="secondary" className="gap-1">
                <Sparkle size={12} weight="duotone" /> {result.archetype.name}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <SummaryStats result={result} estate={estate} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <BlueprintColumn
          title="Path A — Best-fit"
          description="Optimal stack for this use case, ignoring incumbency."
          accent="primary"
          blueprint={result.bestFit}
        />
        <BlueprintColumn
          title="Path B — Estate-optimized"
          description="Maximizes reuse of what the customer already owns."
          accent="green"
          blueprint={result.estateOptimized}
        />
      </div>

      <DeltaCard result={result} />

      {result.archetype && <RiskAndControlsCard archetype={result.archetype} estate={estate} />}
    </div>
  )
}

function SummaryStats({ result, estate }: { result: BlueprintResult; estate: TechnologyEstate }) {
  const stat = (label: string, value: string | number, hint?: string) => (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
  const total = result.bestFit.components.length
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stat('Capabilities required', total)}
      {stat('Estate-opt reuse', `${Math.round(result.estateOptimized.reuseRatio * 100)}%`, 'Components reused')}
      {stat('Net-new (estate-opt)', result.estateOptimized.netNewServiceIds.length, 'Services to procure')}
      {stat('Capability gaps', result.estateOptimized.gapCount, 'Unmet requirements')}
      {estate.sovereigntyRequired && (
        <div className="md:col-span-4">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Sovereignty filter active</AlertTitle>
            <AlertDescription>
              Only services flagged as sovereignty-ready are considered. Some best-fit options may have been suppressed.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  )
}

function BlueprintColumn({
  title,
  description,
  accent,
  blueprint,
}: {
  title: string
  description: string
  accent: 'primary' | 'green'
  blueprint: Blueprint
}) {
  const grouped: Record<BlueprintLayer, Blueprint['components']> = {
    'app-ai': [],
    data: [],
    infrastructure: [],
    identity: [],
    security: [],
    operations: [],
  }
  blueprint.components.forEach((c) => grouped[c.layer].push(c))

  const accentClass = accent === 'primary' ? 'border-primary/40' : 'border-green-500/40'

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={`border-2 ${accentClass}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          <div className="flex items-center gap-3 pt-2 text-xs">
            <span>
              Reuse <strong>{Math.round(blueprint.reuseRatio * 100)}%</strong>
            </span>
            <Progress value={blueprint.reuseRatio * 100} className="h-1.5 flex-1" />
            {blueprint.gapCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {blueprint.gapCount} gap{blueprint.gapCount === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {LAYER_ORDER.map((layer) => {
            const items = grouped[layer]
            if (items.length === 0) return null
            return (
              <div key={layer}>
                <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {LAYER_ICONS[layer]}
                  {BLUEPRINT_LAYER_LABELS[layer]}
                </div>
                <ul className="space-y-1.5">
                  {items.map((c) => (
                    <li
                      key={c.capability}
                      className={`rounded border px-2.5 py-1.5 text-sm ${
                        c.gap
                          ? 'border-destructive/40 bg-destructive/5'
                          : c.reused
                            ? 'border-green-500/40 bg-green-500/5'
                            : 'bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-1">
                            <span className="truncate">{c.capabilityName}</span>
                            {c.service && <LearnMorePopover query={c.service.name} />}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {c.service ? `${c.service.name} · ${c.service.vendor}` : 'No service available'}
                          </div>
                        </div>
                        {c.reused && (
                          <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                            <CheckCircle size={10} weight="fill" /> Reused
                          </Badge>
                        )}
                        {c.gap && (
                          <Badge variant="destructive" className="text-[10px] shrink-0">
                            Gap
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </CardContent>
        {blueprint.netNewServiceIds.length > 0 && (
          <CardFooter className="block text-xs">
            <div className="font-semibold mb-1">Net-new to procure / provision</div>
            <div className="flex flex-wrap gap-1">
              {blueprint.netNewServiceIds.map((id) => (
                <Badge key={id} variant="outline" className="text-[10px]">
                  {SERVICE_BY_ID[id]?.name ?? id}
                </Badge>
              ))}
            </div>
          </CardFooter>
        )}
      </Card>
    </motion.div>
  )
}

function DeltaCard({ result }: { result: BlueprintResult }) {
  const { delta } = result
  if (delta.swaps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Path comparison</CardTitle>
          <CardDescription>
            Both paths converge on the same services for every required capability — no trade-offs to weigh.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Path comparison ({delta.swaps.length} differences)</CardTitle>
        <CardDescription>
          Components where Best-fit and Estate-optimized choose differently. Use to drive the trade-off conversation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3">Capability</th>
                <th className="py-2 pr-3">Best-fit</th>
                <th className="py-2 pr-3"></th>
                <th className="py-2">Estate-optimized</th>
              </tr>
            </thead>
            <tbody>
              {delta.swaps.map((s) => (
                <tr key={s.capability} className="border-b last:border-0">
                  <td className="py-2 pr-3 align-top">
                    <div className="font-medium">{s.capabilityName}</div>
                    <div className="text-[11px] text-muted-foreground">{BLUEPRINT_LAYER_LABELS[s.layer]}</div>
                  </td>
                  <td className="py-2 pr-3 align-top">
                    {s.bestFit ? (
                      <span>
                        {s.bestFit.name}{' '}
                        <Badge variant="outline" className="text-[10px]">
                          {s.bestFit.vendor}
                        </Badge>
                      </span>
                    ) : (
                      <span className="text-destructive">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 align-top text-muted-foreground">
                    <ArrowRight size={14} />
                  </td>
                  <td className="py-2 align-top">
                    {s.estateOptimized ? (
                      <span>
                        {s.estateOptimized.name}{' '}
                        <Badge variant="outline" className="text-[10px]">
                          {s.estateOptimized.vendor}
                        </Badge>
                      </span>
                    ) : (
                      <span className="text-destructive">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Avg fit-score delta (best-fit minus estate): <strong>{delta.fitScoreDelta.toFixed(1)}</strong> ·
          Reuse-ratio delta: <strong>{(delta.reuseRatioDelta * -100).toFixed(0)}%</strong> in favor of Estate-optimized.
        </div>
      </CardContent>
    </Card>
  )
}

function RiskAndControlsCard({ archetype, estate }: { archetype: ArchetypeDef; estate: TechnologyEstate }) {
  const flags: Array<{ ok: boolean; label: string }> = [
    { ok: estate.hasKeyVault, label: 'Key Vault for secrets' },
    { ok: estate.hasManagedIdentity, label: 'Managed identity (no secrets in code)' },
    { ok: estate.hasPrivateEndpoints, label: 'Private endpoints for data tier' },
    { ok: estate.hasDefenderForCloud, label: 'Defender for Cloud (CSPM)' },
    { ok: estate.hasSentinel, label: 'Sentinel for SIEM' },
    { ok: estate.hasPurview, label: 'Purview for classification & DLP' },
  ]
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck size={18} weight="duotone" className="text-primary" />
          Cybersecurity & risk overlay
        </CardTitle>
        <CardDescription>
          Archetype-specific risks and a quick check against the customer's current security posture.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold mb-1">Risks for this archetype</div>
          <ul className="text-sm list-disc list-inside space-y-1 text-muted-foreground">
            {archetype.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold mb-1">Posture checks</div>
          <ul className="text-sm space-y-1">
            {flags.map((f) => (
              <li key={f.label} className="flex items-center gap-2">
                {f.ok ? (
                  <CheckCircle size={14} weight="fill" className="text-green-600" />
                ) : (
                  <Warning size={14} weight="fill" className="text-amber-600" />
                )}
                <span className={f.ok ? '' : 'text-muted-foreground'}>{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
