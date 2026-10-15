import { useState, useEffect, useMemo } from 'react'
import { UseCase, AIRegulationFramework, SecurityRequirement, DataClassification, AIRiskLevel, type BantQualification, type CustomerStakeholder, type RaciAssignment, type ComplianceEnforcement, type RegulatoryAssessment, type Industry } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { KPISelector } from '@/components/KPISelector'
import { BantQualificationEditor } from '@/components/BantQualification'
import { RaciEditor } from '@/components/RaciEditor'
import { REGULATION_LABELS, SECURITY_REQUIREMENT_LABELS, DATA_CLASSIFICATION_LABELS, RISK_LEVEL_LABELS } from '@/lib/compliance-labels'
import { assessUseCaseRisk, RISK_LEVEL_CONFIG, detectJurisdictions } from '@/lib/regulatory-engine'
import { Scales, ShieldCheck, CaretDown, X, ShieldWarning } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface UseCaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (useCase: Partial<UseCase>) => void
  editingUseCase?: UseCase | null
  /** Session context for automatic compliance assessment */
  sessionLocation?: string
  sessionIndustry?: Industry
  complianceEnforcement?: ComplianceEnforcement
  customerStakeholders?: CustomerStakeholder[]
}

export function UseCaseDialog({ open, onOpenChange, onSave, editingUseCase, sessionLocation, sessionIndustry, complianceEnforcement = 'advisory', customerStakeholders = [] }: UseCaseDialogProps) {
  const [title, setTitle] = useState(editingUseCase?.title || '')
  const [description, setDescription] = useState(editingUseCase?.description || '')
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>(editingUseCase?.kpis || [])

  const [customerAccountable, setCustomerAccountable] = useState(editingUseCase?.customerAccountable || '')
  const [microsoftAccountable, setMicrosoftAccountable] = useState(editingUseCase?.microsoftAccountable || '')
  const [bant, setBant] = useState<BantQualification | undefined>(editingUseCase?.bant)
  const [raciAssignments, setRaciAssignments] = useState<RaciAssignment[]>(editingUseCase?.raciAssignments ?? [])
  
  // Compliance & Security state
  const [complianceOpen, setComplianceOpen] = useState(false)
  const [selectedFrameworks, setSelectedFrameworks] = useState<AIRegulationFramework[]>(
    editingUseCase?.aiRegulations?.applicableFrameworks || []
  )
  const [riskLevel, setRiskLevel] = useState<AIRiskLevel | ''>(
    editingUseCase?.aiRegulations?.riskClassification || ''
  )
  const [jurisdictions, setJurisdictions] = useState<string[]>(
    editingUseCase?.aiRegulations?.jurisdictions || []
  )
  const [complianceNotes, setComplianceNotes] = useState(
    editingUseCase?.aiRegulations?.complianceNotes || ''
  )
  const [selectedSecurityReqs, setSelectedSecurityReqs] = useState<SecurityRequirement[]>(
    editingUseCase?.cybersecurity?.securityRequirements || []
  )
  const [dataClassification, setDataClassification] = useState<DataClassification | ''>(
    editingUseCase?.cybersecurity?.dataClassification || ''
  )
  const [securityNotes, setSecurityNotes] = useState(
    editingUseCase?.cybersecurity?.securityNotes || ''
  )
  const [newJurisdiction, setNewJurisdiction] = useState('')

  // Live compliance assessment preview
  const liveAssessment = useMemo<RegulatoryAssessment | null>(() => {
    if (!title.trim() || !sessionLocation) return null
    const detectedJurisdictions = detectJurisdictions(sessionLocation)
    if (detectedJurisdictions.length === 0) return null
    const fakeUC = { id: 'preview', title: title.trim(), description: description.trim() } as UseCase
    return assessUseCaseRisk(fakeUC, detectedJurisdictions, sessionIndustry, complianceEnforcement)
  }, [title, description, sessionLocation, sessionIndustry, complianceEnforcement])

  const isBlocked = complianceEnforcement === 'strict' && liveAssessment?.gateStatus === 'blocked'

  useEffect(() => {
    if (editingUseCase) {
      setTitle(editingUseCase.title)
      setDescription(editingUseCase.description)
      setSelectedKPIs(editingUseCase.kpis || [])
      setCustomerAccountable(editingUseCase.customerAccountable || '')
      setMicrosoftAccountable(editingUseCase.microsoftAccountable || '')
      setBant(editingUseCase.bant)
      setRaciAssignments(editingUseCase.raciAssignments ?? [])
      setSelectedFrameworks(editingUseCase.aiRegulations?.applicableFrameworks || [])
      setRiskLevel(editingUseCase.aiRegulations?.riskClassification || '')
      setJurisdictions(editingUseCase.aiRegulations?.jurisdictions || [])
      setComplianceNotes(editingUseCase.aiRegulations?.complianceNotes || '')
      setSelectedSecurityReqs(editingUseCase.cybersecurity?.securityRequirements || [])
      setDataClassification(editingUseCase.cybersecurity?.dataClassification || '')
      setSecurityNotes(editingUseCase.cybersecurity?.securityNotes || '')
    } else {
      setTitle('')
      setDescription('')
      setSelectedKPIs([])
      setCustomerAccountable('')
      setMicrosoftAccountable('')
      setBant(undefined)
      setRaciAssignments([])
      setSelectedFrameworks([])
      setRiskLevel('')
      setJurisdictions([])
      setComplianceNotes('')
      setSelectedSecurityReqs([])
      setDataClassification('')
      setSecurityNotes('')
    }
  }, [editingUseCase, open])

  const handleSave = () => {
    if (!title.trim()) return

    // Block if strict mode and use case is blocked
    if (isBlocked) {
      toast.error('Cannot save — this use case is classified as blocked under strict compliance mode. Please adjust the description or switch to advisory mode.')
      return
    }

    // Warn if high risk in advisory mode
    if (liveAssessment && (liveAssessment.overallRisk === 'high' || liveAssessment.overallRisk === 'unacceptable')) {
      toast.warning(`Use case has ${RISK_LEVEL_CONFIG[liveAssessment.overallRisk].label} risk classification`, {
        description: 'Review the compliance section for applicable frameworks and remediations.',
        duration: 5000,
      })
    }

    const hasAiRegulations = selectedFrameworks.length > 0 || riskLevel || jurisdictions.length > 0 || complianceNotes
    const hasCybersecurity = selectedSecurityReqs.length > 0 || dataClassification || securityNotes

    onSave({
      ...(editingUseCase || {}),
      title: title.trim(),
      description: description.trim(),
      kpis: selectedKPIs,
      customerAccountable: customerAccountable.trim() || undefined,
      microsoftAccountable: microsoftAccountable.trim() || undefined,
      bant,
      raciAssignments,
      aiRegulations: hasAiRegulations ? {
        applicableFrameworks: selectedFrameworks,
        riskClassification: (riskLevel || liveAssessment?.overallRisk) || undefined,
        jurisdictions: jurisdictions.length > 0 ? jurisdictions : undefined,
        complianceNotes: complianceNotes || undefined,
      } : (liveAssessment ? {
        applicableFrameworks: liveAssessment.frameworkAssessments.map(fa => fa.framework),
        riskClassification: liveAssessment.overallRisk,
        jurisdictions: sessionLocation ? detectJurisdictions(sessionLocation) : undefined,
        complianceNotes: `Auto-assessed: ${RISK_LEVEL_CONFIG[liveAssessment.overallRisk].description}`,
      } : undefined),
      regulatoryAssessment: liveAssessment || undefined,
      cybersecurity: hasCybersecurity ? {
        securityRequirements: selectedSecurityReqs,
        dataClassification: dataClassification || undefined,
        securityNotes: securityNotes || undefined,
      } : undefined,
    })

    // Reset all fields
    setTitle('')
    setDescription('')
    setSelectedKPIs([])
    setCustomerAccountable('')
    setMicrosoftAccountable('')
    setBant(undefined)
    setRaciAssignments([])
    setSelectedFrameworks([])
    setRiskLevel('')
    setJurisdictions([])
    setComplianceNotes('')
    setSelectedSecurityReqs([])
    setDataClassification('')
    setSecurityNotes('')
    onOpenChange(false)
  }

  const handleClose = () => {
    if (!editingUseCase) {
      setTitle('')
      setDescription('')
      setSelectedKPIs([])
      setCustomerAccountable('')
      setMicrosoftAccountable('')
      setBant(undefined)
      setRaciAssignments([])
      setSelectedFrameworks([])
      setRiskLevel('')
      setJurisdictions([])
      setComplianceNotes('')
      setSelectedSecurityReqs([])
      setDataClassification('')
      setSecurityNotes('')
    }
    onOpenChange(false)
  }

  const toggleFramework = (framework: AIRegulationFramework) => {
    setSelectedFrameworks(prev => 
      prev.includes(framework) 
        ? prev.filter(f => f !== framework)
        : [...prev, framework]
    )
  }

  const toggleSecurityReq = (req: SecurityRequirement) => {
    setSelectedSecurityReqs(prev => 
      prev.includes(req) 
        ? prev.filter(r => r !== req)
        : [...prev, req]
    )
  }

  const addJurisdiction = () => {
    if (newJurisdiction.trim() && !jurisdictions.includes(newJurisdiction.trim())) {
      setJurisdictions([...jurisdictions, newJurisdiction.trim()])
      setNewJurisdiction('')
    }
  }

  const removeJurisdiction = (j: string) => {
    setJurisdictions(jurisdictions.filter(jur => jur !== j))
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingUseCase ? 'Edit Use Case' : 'Add New Use Case'}</DialogTitle>
          <DialogDescription>
            {editingUseCase
              ? 'Update the details of your use case.'
              : 'Enter the details for a new use case to evaluate.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Real-time collaboration feature"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) handleSave()
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the use case, its benefits, and context..."
                rows={4}
              />
            </div>

          </div>
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">Owners and qualification (optional)</summary>
            <div className="mt-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer-accountable">Customer Accountable (Optional)</Label>
                <Input
                  id="customer-accountable"
                  value={customerAccountable}
                  onChange={(e) => setCustomerAccountable(e.target.value)}
                  placeholder="e.g., Head of Operations"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="microsoft-accountable">Microsoft Accountable (Optional)</Label>
                <Input
                  id="microsoft-accountable"
                  value={microsoftAccountable}
                  onChange={(e) => setMicrosoftAccountable(e.target.value)}
                  placeholder="e.g., Account Team / Solution Engineer"
                />
              </div>
            </div>
          <Separator />

          <BantQualificationEditor value={bant} onChange={setBant} />

          <Separator />

          <RaciEditor stakeholders={customerStakeholders} value={raciAssignments} onChange={setRaciAssignments} />
            </div>
          </details>
          <Separator />

          <KPISelector
            selectedKPIs={selectedKPIs}
            onChange={setSelectedKPIs}
            collapsible
            defaultOpen={false}
            enableAISuggestions
            useCaseTitle={title}
            useCaseDescription={description}
          />

          <Separator />

          {/* Compliance & Security Section */}
          <Collapsible open={complianceOpen} onOpenChange={setComplianceOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Scales size={16} />
                  <ShieldCheck size={16} />
                  <span>Compliance & Security (Optional)</span>
                </div>
                <CaretDown size={16} className={`transition-transform ${complianceOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-6">
              {/* AI Regulations Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Scales size={14} />
                  <span>AI Regulations & Compliance</span>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs">Applicable Frameworks</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(REGULATION_LABELS) as AIRegulationFramework[]).map((framework) => (
                      <Badge
                        key={framework}
                        variant={selectedFrameworks.includes(framework) ? 'default' : 'outline'}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleFramework(framework)}
                      >
                        {REGULATION_LABELS[framework]}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Risk Classification</Label>
                    <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as AIRiskLevel)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select risk level" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RISK_LEVEL_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Jurisdictions</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newJurisdiction}
                        onChange={(e) => setNewJurisdiction(e.target.value)}
                        placeholder="e.g., South Africa"
                        className="text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addJurisdiction())}
                      />
                      <Button type="button" size="sm" onClick={addJurisdiction}>Add</Button>
                    </div>
                    {jurisdictions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {jurisdictions.map((j) => (
                          <Badge key={j} variant="secondary" className="gap-1 text-xs">
                            {j}
                            <X size={10} className="cursor-pointer" onClick={() => removeJurisdiction(j)} />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Compliance Notes</Label>
                  <Textarea
                    value={complianceNotes}
                    onChange={(e) => setComplianceNotes(e.target.value)}
                    placeholder="Key compliance considerations..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </div>

              <Separator />

              {/* Cybersecurity Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <ShieldCheck size={14} />
                  <span>Cybersecurity</span>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Security Requirements</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(SECURITY_REQUIREMENT_LABELS) as SecurityRequirement[]).map((req) => (
                      <Badge
                        key={req}
                        variant={selectedSecurityReqs.includes(req) ? 'default' : 'outline'}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleSecurityReq(req)}
                      >
                        {SECURITY_REQUIREMENT_LABELS[req]}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Data Classification</Label>
                  <Select value={dataClassification} onValueChange={(v) => setDataClassification(v as DataClassification)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select data classification" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DATA_CLASSIFICATION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Security Notes</Label>
                  <Textarea
                    value={securityNotes}
                    onChange={(e) => setSecurityNotes(e.target.value)}
                    placeholder="Key security considerations..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Live compliance assessment preview */}
          {liveAssessment && title.trim() && (
            <div className={`flex items-start gap-2 p-3 rounded-lg border ${RISK_LEVEL_CONFIG[liveAssessment.overallRisk].bgColor} ${RISK_LEVEL_CONFIG[liveAssessment.overallRisk].borderColor}`}>
              <span className="text-base">{RISK_LEVEL_CONFIG[liveAssessment.overallRisk].icon}</span>
              <div className="flex-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${RISK_LEVEL_CONFIG[liveAssessment.overallRisk].color}`}>
                    {RISK_LEVEL_CONFIG[liveAssessment.overallRisk].label} Risk
                  </span>
                  <span className="text-muted-foreground">
                    ({liveAssessment.frameworkAssessments.length} frameworks assessed)
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5">
                  {RISK_LEVEL_CONFIG[liveAssessment.overallRisk].description}
                </p>
                {isBlocked && (
                  <p className="text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <ShieldWarning size={12} />
                    Blocked — cannot save in strict compliance mode
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || isBlocked}>
            {isBlocked ? 'Blocked by Compliance' : editingUseCase ? 'Save Changes' : 'Add Use Case'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
