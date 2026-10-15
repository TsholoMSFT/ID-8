import { useState, useEffect } from 'react'
import { Industry, EntityType, ENTITY_TYPE_LABELS, ENTITY_TYPE_DESCRIPTIONS, BusinessFunction } from '@/lib/types'
import { SessionMetadata } from '@/components/SessionMetadataForm'
import { industryLabels } from '@/lib/discovery-questions'
import { groupedBusinessFunctions } from '@/lib/business-functions'
import { extractUseCasesFromNotes, ExtractedUseCase } from '@/lib/use-case-extraction'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { NavigationHeader } from '@/components/NavigationHeader'
import { Sparkle, FileText, Info, CaretDown, CaretUp } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// Draft persistence interface
export interface DiscoveryDraft {
  notes: string
  customerName: string
  sessionName: string
  industry: Industry
  businessFunctions?: BusinessFunction[]
  entityType?: EntityType
  location?: string
  stockTicker?: string
  // Session details (optional)
  innovationHubSPOC?: string
  primaryStakeholder?: string
  accountTeamRep?: string
  solutionEngineer?: string
}

interface DiscoveryNotesInputProps {
  sessionMetadata?: Partial<SessionMetadata>
  onAnalyze: (notes: string, metadata: SessionMetadata, extractedUseCases: ExtractedUseCase[], sessionName: string, industry: Industry, entityType?: EntityType, businessFunctions?: BusinessFunction[]) => void
  onCancel: () => void
  onBackToLanding?: () => void
  // Draft persistence props
  initialDraft?: DiscoveryDraft | null
  onDraftChange?: (draft: DiscoveryDraft) => void
  onDraftClear?: () => void
}

const industryOptions: Array<{ value: Industry; label: string }> = [
  { value: 'general', label: industryLabels['general'] },
  { value: 'technology-software', label: industryLabels['technology-software'] },
  { value: 'telecommunications', label: industryLabels['telecommunications'] },
  { value: 'financial-services', label: industryLabels['financial-services'] },
  { value: 'healthcare', label: industryLabels['healthcare'] },
  { value: 'retail', label: industryLabels['retail'] },
  { value: 'manufacturing', label: industryLabels['manufacturing'] },
  { value: 'mining-resources', label: industryLabels['mining-resources'] },
  { value: 'government', label: industryLabels['government'] },
  { value: 'education', label: industryLabels['education'] },
  { value: 'energy', label: industryLabels['energy'] },
]

export function DiscoveryNotesInput({
  sessionMetadata,
  onAnalyze,
  onCancel,
  onBackToLanding,
  initialDraft,
  onDraftChange,
  onDraftClear
}: DiscoveryNotesInputProps) {
  // Initialize from draft if available, otherwise from sessionMetadata
  const [notes, setNotes] = useState(initialDraft?.notes || '')
  const [sessionName, setSessionName] = useState(initialDraft?.sessionName || '')
  const [customerName, setCustomerName] = useState(initialDraft?.customerName || sessionMetadata?.customerName || '')
  const [industry, setIndustry] = useState<Industry>(initialDraft?.industry || 'general')
  const [businessFunctions, setBusinessFunctions] = useState<BusinessFunction[]>(initialDraft?.businessFunctions || [])
  const toggleBusinessFunction = (id: BusinessFunction) => {
    setBusinessFunctions((cur) => {
      if (id === 'cross-functional') return cur.includes('cross-functional') ? [] : ['cross-functional']
      const withoutCross = cur.filter((x) => x !== 'cross-functional')
      return withoutCross.includes(id) ? withoutCross.filter((x) => x !== id) : [...withoutCross, id]
    })
  }
  const [entityType, setEntityType] = useState<EntityType>(initialDraft?.entityType || 'public-company')
  const [location, setLocation] = useState(initialDraft?.location || sessionMetadata?.innovationHubLocation || '')
  const [stockTicker, setStockTicker] = useState(initialDraft?.stockTicker || '')
  
  // Session details (collapsible)
  const [showSessionDetails, setShowSessionDetails] = useState(false)
  const [innovationHubSPOC, setInnovationHubSPOC] = useState(initialDraft?.innovationHubSPOC || sessionMetadata?.innovationHubSPOC || '')
  const [primaryStakeholder, setPrimaryStakeholder] = useState(initialDraft?.primaryStakeholder || sessionMetadata?.primaryStakeholder || '')
  const [accountTeamRep, setAccountTeamRep] = useState(initialDraft?.accountTeamRep || sessionMetadata?.accountTeamRep || '')
  const [solutionEngineer, setSolutionEngineer] = useState(initialDraft?.solutionEngineer || sessionMetadata?.solutionEngineer || '')
  
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showExample, setShowExample] = useState(false)
  
  // Auto-detect entity type from customer name patterns
  useEffect(() => {
    if (!customerName) return
    const lowerName = customerName.toLowerCase()
    if (lowerName.includes('department of') || lowerName.includes('ministry of') || 
        lowerName.includes('government') || lowerName.includes('municipality') ||
        lowerName.includes('city of') || lowerName.includes('province') ||
        lowerName.includes('national') && (lowerName.includes('treasury') || lowerName.includes('agency'))) {
      setEntityType('government')
    } else if (lowerName.includes('foundation') || lowerName.includes('ngo') || 
               lowerName.includes('non-profit') || lowerName.includes('charity')) {
      setEntityType('non-profit')
    }
  }, [customerName])
  
  // Draft persistence - debounced save
  useEffect(() => {
    if (!onDraftChange) return
    const timer = setTimeout(() => {
      onDraftChange({
        notes, customerName, sessionName, industry, entityType, location, stockTicker, businessFunctions,
        innovationHubSPOC, primaryStakeholder, accountTeamRep, solutionEngineer
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [notes, customerName, sessionName, industry, entityType, location, stockTicker, businessFunctions,
      innovationHubSPOC, primaryStakeholder, accountTeamRep, solutionEngineer, onDraftChange])

  const isValid = notes.trim().length >= 50 && sessionName.trim() && customerName.trim()

  const handleAnalyze = async () => {
    if (!isValid) {
      toast.error('Please fill in all required fields', {
        description: 'Notes must be at least 50 characters'
      })
      return
    }

    setIsAnalyzing(true)

    try {
      const metadata: SessionMetadata = {
        customerName: customerName.trim(),
        innovationHubSPOC: innovationHubSPOC.trim() || '',
        primaryStakeholder: primaryStakeholder.trim() || '',
        accountTeamRep: accountTeamRep.trim() || '',
        innovationHubLocation: location.trim() || '',
        solutionEngineer: solutionEngineer.trim() || '',
        stockTicker: entityType === 'public-company' ? stockTicker.trim() : '',
        entityType,
      }

      const extractedUseCases = await extractUseCasesFromNotes(notes, {
        customerName: customerName.trim(),
        industry,
        businessFunctions: businessFunctions.length ? businessFunctions : undefined,
        entityType,
        location: location.trim() || undefined,
        stockTicker: entityType === 'public-company' ? stockTicker.trim() : undefined,
      })

      if (extractedUseCases.length === 0) {
        toast.error('No use cases extracted', {
          description: 'Try providing more detailed notes about pain points and challenges'
        })
        setIsAnalyzing(false)
        return
      }

      toast.success(`Extracted ${extractedUseCases.length} use cases!`, {
        description: 'Proceeding to review and scoring workflow'
      })

      // Clear draft on successful analysis
      onDraftClear?.()
      
      onAnalyze(notes, metadata, extractedUseCases, sessionName.trim(), industry, entityType, businessFunctions.length ? businessFunctions : undefined)
    } catch (error) {
      console.error('Analysis failed:', error)
      toast.error('Failed to analyze notes', {
        description: error instanceof Error ? error.message : 'Please try again or contact support'
      })
      setIsAnalyzing(false)
    }
  }

  const exampleNotes = `MTN is Africa's largest mobile network operator with 280 million subscribers across 19 markets. They're facing significant challenges with customer churn — currently losing 2.3 million subscribers quarterly, representing R850M in lost revenue. Their call centers handle 4 million calls monthly with 12-minute average handle time and 35% first-call resolution. Network operations struggle with reactive maintenance — they experience 1,200 unplanned outages monthly, costing an estimated R45M in SLA penalties and lost revenue. The digital channels team wants to increase USSD and app self-service adoption from 23% to 60% to reduce call center load. Finance is concerned about revenue leakage in the billing system — they estimate 3-5% of billable usage goes uncaptured. Leadership wants a unified customer data platform to enable personalized offers, but subscriber data is fragmented across 8 BSS/OSS systems including Huawei, Ericsson, and legacy platforms.`

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader
        variant="full"
        onBackToLanding={onBackToLanding}
        onBack={onCancel}
        backLabel="Back"
        title="Notes Analysis"
        subtitle="AI-powered use case extraction from discovery notes"
        iconColorClass="text-brand-green"
      />
      <div className="container mx-auto px-4 md:px-6 py-8 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-green/10 rounded-lg flex items-center justify-center">
                    <FileText size={28} weight="duotone" className="text-brand-green" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Quick Notes Analysis</CardTitle>
                    <CardDescription>
                      Paste your discovery notes and let AI extract use cases
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Session Metadata */}
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="session-name">
                      Session Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="session-name"
                      placeholder="e.g., MTN Discovery - January 2026"
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      disabled={isAnalyzing}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer-name">
                      Customer Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="customer-name"
                      placeholder="e.g., MTN Group"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      disabled={isAnalyzing}
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Select value={industry} onValueChange={(value) => setIndustry(value as Industry)} disabled={isAnalyzing}>
                      <SelectTrigger id="industry">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {industryOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="entity-type">Organization Type</Label>
                    <Select value={entityType} onValueChange={(value) => setEntityType(value as EntityType)} disabled={isAnalyzing}>
                      <SelectTrigger id="entity-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(ENTITY_TYPE_LABELS) as [EntityType, string][]).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            <div className="flex flex-col">
                              <span>{label}</span>
                              <span className="text-xs text-muted-foreground">{ENTITY_TYPE_DESCRIPTIONS[value]}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    Business Function <span className="text-muted-foreground text-xs">(optional &mdash; leave blank for enterprise-wide)</span>
                  </Label>
                  <div className="max-h-44 overflow-y-auto rounded-md border p-3 space-y-3">
                    {groupedBusinessFunctions().map((g) => (
                      <div key={g.group} className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.functions.map((f) => {
                            const active = businessFunctions.includes(f.id)
                            return (
                              <button
                                key={f.id}
                                type="button"
                                disabled={isAnalyzing}
                                onClick={() => toggleBusinessFunction(f.id)}
                                title={f.description}
                                className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                                  active
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-card hover:bg-muted/60'
                                }`}
                              >
                                {f.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`grid gap-4 ${entityType === 'public-company' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location (Optional)</Label>
                    <Input
                      id="location"
                      placeholder="e.g., Johannesburg"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      disabled={isAnalyzing}
                    />
                  </div>

                  {entityType === 'public-company' && (
                    <div className="space-y-2">
                      <Label htmlFor="ticker">Stock Ticker (Optional)</Label>
                      <Input
                        id="ticker"
                        placeholder="e.g., MTN.JO"
                        value={stockTicker}
                        onChange={(e) => setStockTicker(e.target.value)}
                        disabled={isAnalyzing}
                      />
                    </div>
                  )}

                  {entityType === 'government' && (
                    <div className="space-y-2">
                      <Label htmlFor="jurisdiction">Jurisdiction (Optional)</Label>
                      <Input
                        id="jurisdiction"
                        placeholder="e.g., National, Gauteng Province"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        disabled={isAnalyzing}
                      />
                    </div>
                  )}
                </div>

                {/* Collapsible Session Details */}
                <Collapsible open={showSessionDetails} onOpenChange={setShowSessionDetails}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground">
                      {showSessionDetails ? <CaretUp size={14} className="mr-2" /> : <CaretDown size={14} className="mr-2" />}
                      {showSessionDetails ? 'Hide' : 'Show'} Session Details (optional team info)
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4 space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="spoc">Innovation Hub SPOC</Label>
                        <Input
                          id="spoc"
                          placeholder="e.g., John Smith"
                          value={innovationHubSPOC}
                          onChange={(e) => setInnovationHubSPOC(e.target.value)}
                          disabled={isAnalyzing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="stakeholder">Primary Stakeholder</Label>
                        <Input
                          id="stakeholder"
                          placeholder="e.g., Jane Doe (CTO)"
                          value={primaryStakeholder}
                          onChange={(e) => setPrimaryStakeholder(e.target.value)}
                          disabled={isAnalyzing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="account-rep">Account Team Rep</Label>
                        <Input
                          id="account-rep"
                          placeholder="e.g., Account Executive name"
                          value={accountTeamRep}
                          onChange={(e) => setAccountTeamRep(e.target.value)}
                          disabled={isAnalyzing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="solution-engineer">Solution Engineer</Label>
                        <Input
                          id="solution-engineer"
                          placeholder="e.g., SE name"
                          value={solutionEngineer}
                          onChange={(e) => setSolutionEngineer(e.target.value)}
                          disabled={isAnalyzing}
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Discovery Notes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="notes">
                    Discovery Notes <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowExample(!showExample)}
                    className="text-xs"
                  >
                    <Info size={14} className="mr-1" />
                    {showExample ? 'Hide' : 'Show'} Example
                  </Button>
                </div>
                
                <AnimatePresence>
                  {showExample && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <Alert className="mb-2">
                        <AlertDescription className="text-xs">
                          <strong>Example notes:</strong> Include pain points, challenges, quantified impacts (revenue, costs, volumes), data sources, stakeholders, and goals. The AI will extract use cases from these details.
                        </AlertDescription>
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Textarea
                  id="notes"
                  placeholder={`Paste your discovery notes here...

Example format:
- Business challenges and pain points
- Current processes and inefficiencies
- Quantified impacts (revenue loss, costs, volumes)
- Data availability and systems
- Stakeholders and their goals
- Success metrics

The AI will analyze these notes and extract high-value use cases with Microsoft solution recommendations.`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                  disabled={isAnalyzing}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{notes.length} characters {notes.length < 50 && '(minimum 50)'}</span>
                  {showExample && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNotes(exampleNotes)}
                      className="text-xs"
                    >
                      Use Example Notes
                    </Button>
                  )}
                </div>
              </div>

              {/* Info Alert */}
              <Alert>
                <Sparkle size={16} className="text-brand-green" />
                <AlertDescription>
                  <strong>What happens next:</strong> The AI will analyze your notes to identify 4-8 high-value use cases, map them to Microsoft solutions and reference architectures, and suggest implementation complexity. You'll then review, score, and prioritize each use case.
                </AlertDescription>
              </Alert>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleAnalyze}
                  disabled={!isValid || isAnalyzing}
                  className="flex-1 gap-2 bg-brand-green hover:bg-brand-green/90 text-brand-green-foreground"
                  size="lg"
                >
                  {isAnalyzing ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      >
                        <Sparkle size={20} weight="fill" />
                      </motion.div>
                      Analyzing Notes...
                    </>
                  ) : (
                    <>
                      <Sparkle size={20} weight="fill" />
                      Analyze with AI
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
