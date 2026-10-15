import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { DiscoveryResponse, DiscoverySession, Industry, DiscoveryQuestion, BusinessFunction } from '@/lib/types'
import { SessionMetadata } from '@/components/SessionMetadataForm'
import { NavigationHeader } from '@/components/NavigationHeader'
import { useDiscoverySettings } from '@/hooks/use-discovery-settings'
import { discoveryQuestions, getQuestionsForIndustry, industryLabels, type DiscoveryTrack } from '@/lib/discovery-questions'
import { groupedBusinessFunctions } from '@/lib/business-functions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Sparkle, MagnifyingGlass, Buildings, Hospital, Bank, Factory, ShoppingCart, Bank as GovIcon, GraduationCap, Lightning, Broadcast, Microphone, Lightbulb, FileMagnifyingGlass, SkipForward, Mountains, Target } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { InlineDisclaimer } from '@/components/Disclaimer'
import { CompanyResearch } from '@/components/CompanyResearch'
import { KPISelector } from '@/components/KPISelector'
import { CompanyInsight } from '@/lib/company-research-service'

interface DiscoveryWizardProps {
  sessionMetadata: SessionMetadata
  onComplete: (session: DiscoverySession) => void
  onCancel: () => void
  onBackToLanding?: () => void
  onSwitchToLive?: (sessionName: string, industry: Industry, responses: DiscoveryResponse[]) => void
  initialSessionName?: string
  initialIndustry?: Industry
  initialResponses?: DiscoveryResponse[]
  initialDiscoveryTrack?: DiscoveryTrack
  initialCompanyInsights?: CompanyInsight[]
  initialCompanyResearchSummary?: string
  skipNaming?: boolean
  researchPersistenceKey?: string
}

type WizardStep = 'name' | 'industry' | 'business-function' | 'track' | 'research' | 'outcomes' | 'questions'

interface DiscoveryWizardDraft {
  wizardStep: WizardStep
  sessionName: string
  selectedIndustry: Industry | null
  selectedBusinessFunctions: BusinessFunction[]
  businessUnitLabel: string
  targetKpis: string[]
  desiredOutcomes: string
  discoveryTrack: DiscoveryTrack
  currentStep: number
  responses: DiscoveryResponse[]
  currentAnswer: string
  currentQuestionId?: string
  followUpQuestions: DiscoveryQuestion[]
  companyInsights: CompanyInsight[]
  companyResearchSummary: string
  currentRanking: Record<string, number | null>
  currentComment: string
}

const industryIcons: Record<Industry, React.ReactNode> = {
  general: <Buildings size={32} weight="duotone" />,
  healthcare: <Hospital size={32} weight="duotone" />,
  'financial-services': <Bank size={32} weight="duotone" />,
  manufacturing: <Factory size={32} weight="duotone" />,
  retail: <ShoppingCart size={32} weight="duotone" />,
  government: <GovIcon size={32} weight="duotone" />,
  education: <GraduationCap size={32} weight="duotone" />,
  energy: <Lightning size={32} weight="duotone" />,
  'mining-resources': <Mountains size={32} weight="duotone" />,
  telecommunications: <Broadcast size={32} weight="duotone" />,
  'technology-software': <Lightbulb size={32} weight="duotone" />,
}

export function DiscoveryWizard({ 
  sessionMetadata,
  onComplete: onSessionComplete,
  onCancel,
  onBackToLanding,
  onSwitchToLive,
  initialSessionName,
  initialIndustry,
  initialResponses,
  initialDiscoveryTrack,
  initialCompanyInsights = [],
  initialCompanyResearchSummary = '',
  skipNaming = false,
  researchPersistenceKey,
}: DiscoveryWizardProps) {
  const { isAIFeatureEnabled } = useDiscoverySettings()
  const [savedDraft, saveDraft] = useLocalStorage<DiscoveryWizardDraft | null>(
    `discovery-wizard-draft:${researchPersistenceKey ?? sessionMetadata.customerName.trim().toLowerCase()}`, null,
  )
  const restoredQuestionId = useRef(savedDraft?.currentQuestionId)
  const onComplete = (session: DiscoverySession) => {
    saveDraft(null)
    onSessionComplete(session)
  }
  const [wizardStep, setWizardStep] = useState<WizardStep>(
    savedDraft?.wizardStep ?? (initialResponses?.length ? 'questions' : skipNaming ? 'business-function' : initialSessionName ? (initialIndustry ? 'questions' : 'industry') : 'name')
  )
  const [sessionName, setSessionName] = useState(savedDraft?.sessionName ?? initialSessionName ?? '')
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(savedDraft?.selectedIndustry ?? initialIndustry ?? null)
  const [selectedBusinessFunctions, setSelectedBusinessFunctions] = useState<BusinessFunction[]>(savedDraft?.selectedBusinessFunctions ?? [])
  const [businessUnitLabel, setBusinessUnitLabel] = useState(savedDraft?.businessUnitLabel ?? '')
  const [targetKpis, setTargetKpis] = useState<string[]>(savedDraft?.targetKpis ?? [])
  const [desiredOutcomes, setDesiredOutcomes] = useState(savedDraft?.desiredOutcomes ?? '')
  const [discoveryTrack, setDiscoveryTrack] = useState<DiscoveryTrack>(savedDraft?.discoveryTrack ?? initialDiscoveryTrack ?? 'use-case')
  const [currentStep, setCurrentStep] = useState(savedDraft?.currentStep ?? 0)
  const [responses, setResponses] = useState<DiscoveryResponse[]>(savedDraft?.responses ?? initialResponses ?? [])
  const [currentAnswer, setCurrentAnswer] = useState(savedDraft?.currentAnswer ?? '')
  const [aiSuggestionItems, setAiSuggestionItems] = useState<string[]>([])
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false)
  const [showAiSuggestion, setShowAiSuggestion] = useState(false)
  const [followUpQuestions, setFollowUpQuestions] = useState<DiscoveryQuestion[]>(savedDraft?.followUpQuestions ?? [])
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false)
  const [showFollowUpPrompt, setShowFollowUpPrompt] = useState(false)
  const [companyInsights, setCompanyInsights] = useState<CompanyInsight[]>(savedDraft?.companyInsights ?? initialCompanyInsights)
  const [companyResearchSummary, setCompanyResearchSummary] = useState(savedDraft?.companyResearchSummary ?? initialCompanyResearchSummary)
  const [currentRanking, setCurrentRanking] = useState<Record<string, number | null>>(savedDraft?.currentRanking ?? {})
  const [currentComment, setCurrentComment] = useState(savedDraft?.currentComment ?? '')

  const handleCompanyInsightsChange = useCallback((insights: CompanyInsight[]) => {
    setCompanyInsights(insights)
  }, [])

  const handleCompanyResearchSummaryChange = useCallback((summary: string) => {
    setCompanyResearchSummary(summary)
  }, [])

  const baseQuestions = selectedIndustry
    ? getQuestionsForIndustry(selectedIndustry, discoveryTrack)
    : discoveryQuestions.filter((q) => !q.industries)
  const allQuestions = [...baseQuestions, ...followUpQuestions]
  const questions = allQuestions
  const progress = wizardStep === 'questions' ? ((currentStep + 1) / questions.length) * 100 : 0
  const currentQuestion = wizardStep === 'questions' ? questions[currentStep] : null
  const isLastBaseQuestion = currentQuestion && currentStep === baseQuestions.length - 1
  const isLastQuestion = currentQuestion && currentStep === questions.length - 1
  useEffect(() => {
    saveDraft({
      wizardStep, sessionName, selectedIndustry, selectedBusinessFunctions, businessUnitLabel, targetKpis,
      desiredOutcomes, discoveryTrack, currentStep, responses, currentAnswer, currentQuestionId: currentQuestion?.id,
      followUpQuestions, companyInsights, companyResearchSummary, currentRanking, currentComment,
    })
  }, [wizardStep, sessionName, selectedIndustry, selectedBusinessFunctions, businessUnitLabel, targetKpis,
    desiredOutcomes, discoveryTrack, currentStep, responses, currentAnswer, currentQuestion?.id, followUpQuestions,
    companyInsights, companyResearchSummary, currentRanking, currentComment, saveDraft])

  const getDefaultRankingState = useCallback((question: DiscoveryQuestion | null) => {
    if (!question || question.inputType !== 'ranking' || !question.rankingItems?.length) return {}
    return Object.fromEntries(question.rankingItems.map((item) => [item, null])) as Record<string, number | null>
  }, [])

  const buildAnswerForCurrentQuestion = useCallback((question: DiscoveryQuestion | null) => {
    if (!question) return ''
    if (question.inputType === 'ranking') {
      const selected = Object.entries(currentRanking)
        .filter(([, rank]) => typeof rank === 'number')
        .map(([item, rank]) => ({ item, rank: rank as number }))
        .sort((a, b) => a.rank - b.rank)

      const rankedText = selected.length
        ? `Ranked priorities:\n${selected.map((x) => `${x.rank}. ${x.item}`).join('\n')}`
        : ''

      const commentText = currentComment.trim() ? `Notes: ${currentComment.trim()}` : ''

      return [rankedText, commentText].filter(Boolean).join('\n\n')
    }

    return currentAnswer.trim()
  }, [currentAnswer, currentComment, currentRanking])

  useEffect(() => {
    if (currentQuestion && wizardStep === 'questions') {
      if (restoredQuestionId.current === currentQuestion.id) {
        restoredQuestionId.current = undefined
        return
      }
      const existingResponse = responses.find((r) => r.questionId === currentQuestion.id)
      setCurrentAnswer(existingResponse?.answer || '')
      setCurrentRanking(
        existingResponse?.ranking
          ? Object.fromEntries(Object.entries(existingResponse.ranking).map(([k, v]) => [k, v]))
          : getDefaultRankingState(currentQuestion)
      )
      setCurrentComment(existingResponse?.comment || '')
      setShowAiSuggestion(false)
      setAiSuggestionItems([])
    }
  }, [currentStep, currentQuestion, wizardStep])

  const generateAiSuggestion = async () => {
    if (!currentQuestion) return

    setIsGeneratingSuggestion(true)
    setShowAiSuggestion(true)

    try {
      const contextText = responses.length > 0
        ? `Previous responses from this session:\n${responses.map(r => {
            const q = questions.find(q => q.id === r.questionId)
            return `Q: ${q?.question}\nA: ${r.answer}`
          }).join('\n\n')}\n\n`
        : ''

      const promptText = `You are an innovation consultant helping someone answer a discovery question.

${contextText}Current Question: ${currentQuestion.question}

Customer Context:
- Company: ${sessionMetadata.customerName}
- Industry: ${selectedIndustry ? industryLabels[selectedIndustry] : 'General'}

Generate 3-5 short, speakable, first-person questions the user can ask themselves to produce a better answer.

Rules:
- Each item must be phrased as a question and end with "?"
- Use first person ("What do I...", "How do we...", "Which...", "Who owns...", etc.)
- No markdown, no bullets, no asterisks

Return ONLY a JSON object with this exact structure:
{
  "questions": ["...?"]
}`

      const result = await window.llm(promptText, 'gpt-4o-mini', true)

      let items: string[] = []
      try {
        const parsed = JSON.parse(result)
        if (Array.isArray(parsed?.questions)) {
          items = parsed.questions
        }
      } catch {
        // Fall back to parsing plain text if JSON parsing fails
        items = String(result)
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*([*\-•]+|\d+[\.)])\s*/g, '').trim())
          .filter(Boolean)
      }

      const normalized = items
        .map((q) => q.replace(/^\s*"|"\s*$/g, '').trim())
        .filter(Boolean)
        .slice(0, 6)
        .map((q) => (q.endsWith('?') ? q : `${q}?`))

      setAiSuggestionItems(normalized)
    } catch (error) {
      console.error('Error generating suggestion:', error)
      toast.error('Failed to generate suggestion')
      setShowAiSuggestion(false)
    } finally {
      setIsGeneratingSuggestion(false)
    }
  }

  const generateFollowUpQuestions = async (currentQuestionData: DiscoveryQuestion, answer: string) => {
    if (!answer.trim()) return []

    setIsGeneratingFollowUp(true)

    try {
      const contextText = responses.length > 0
        ? `Previous discussion:\n${responses.map(r => {
            const q = baseQuestions.find(q => q.id === r.questionId)
            return `Q: ${q?.question}\nA: ${r.answer}`
          }).join('\n\n')}\n\n`
        : ''

      const industry = selectedIndustry ? industryLabels[selectedIndustry] : 'General'
      
      const promptText = `You are an innovation consultant conducting a discovery session. Based on the customer's answer, generate 1-2 intelligent follow-up questions that will help uncover deeper insights and potential use cases.

${contextText}Current Question: ${currentQuestionData.question}
Customer's Answer: ${answer}

Customer Context:
- Company: ${sessionMetadata.customerName}
- Industry: ${industry}

Generate 1-2 targeted follow-up questions that:
1. Dig deeper into specific aspects mentioned in their answer
2. Uncover quantifiable metrics or pain points
3. Explore the business impact or technical constraints
4. Help identify concrete automation or innovation opportunities

Return ONLY a JSON object with this exact structure (no markdown, no code blocks):
{
  "questions": [
    {
      "question": "The follow-up question text",
      "category": "business|technical|users|challenges",
      "placeholder": "Example placeholder text for the answer"
    }
  ]
}

Keep questions conversational, specific to their answer, and focused on discovering valuable use cases.`

      const result = await window.llm(promptText, 'gpt-4o-mini', true)
      const parsed = JSON.parse(result)
      
      const followUps: DiscoveryQuestion[] = parsed.questions.map((q: any, idx: number) => ({
        id: `followup-${currentQuestionData.id}-${Date.now()}-${idx}`,
        question: q.question,
        category: q.category || 'business',
        placeholder: q.placeholder,
        isFollowUp: true,
        parentQuestionId: currentQuestionData.id,
      }))

      return followUps
    } catch (error) {
      console.error('Error generating follow-up questions:', error)
      return []
    } finally {
      setIsGeneratingFollowUp(false)
    }
  }

  const handleNameNext = () => {
    if (!sessionName.trim()) return
    setWizardStep('industry')
  }

  const handleIndustrySelect = (industry: Industry) => {
    setSelectedIndustry(industry)
    // Business function comes next (mirrors the industry step).
    setWizardStep('business-function')
  }

  const toggleBusinessFunction = (id: BusinessFunction) => {
    setSelectedBusinessFunctions((cur) => {
      // 'cross-functional' is mutually exclusive with specific functions.
      if (id === 'cross-functional') {
        return cur.includes('cross-functional') ? [] : ['cross-functional']
      }
      const withoutCross = cur.filter((x) => x !== 'cross-functional')
      return withoutCross.includes(id) ? withoutCross.filter((x) => x !== id) : [...withoutCross, id]
    })
  }

  const handleBusinessFunctionNext = () => {
    // If the user already chose a track before entering the wizard (e.g., Landing Page),
    // don't ask them to select it again.
    if (initialDiscoveryTrack) {
      setDiscoveryTrack(initialDiscoveryTrack)
      setWizardStep('research')
      return
    }
    setWizardStep('track')
  }

  const handleTrackSelect = (track: DiscoveryTrack) => {
    setDiscoveryTrack(track)
    setWizardStep('research')
  }

  const handleResearchNext = () => {
    setWizardStep('outcomes')
  }

  const handleResearchSkip = () => {
    setWizardStep('outcomes')
  }

  const handleOutcomesNext = () => {
    setWizardStep('questions')
  }

  const handleNext = async () => {
    if (!currentQuestion) return

    const filteredResponses = responses.filter((r) => r.questionId !== currentQuestion.id)

    const builtAnswer = buildAnswerForCurrentQuestion(currentQuestion)
    const hasStructuredAnswer = currentQuestion.inputType === 'ranking'
      ? (Object.values(currentRanking).some((v) => typeof v === 'number') || currentComment.trim().length > 0)
      : builtAnswer.trim().length > 0

    const updatedResponses = hasStructuredAnswer
      ? [...filteredResponses, {
          questionId: currentQuestion.id,
          answer: builtAnswer,
          ranking: currentQuestion.inputType === 'ranking'
            ? Object.fromEntries(
                Object.entries(currentRanking)
                  .filter(([, v]) => typeof v === 'number')
                  .map(([k, v]) => [k, v as number])
              )
            : undefined,
          comment: currentQuestion.inputType === 'ranking' && currentComment.trim()
            ? currentComment.trim()
            : undefined,
        }]
      : filteredResponses
    
    setResponses(updatedResponses)

    if (isLastQuestion) {
      const customerId = `customer-${sessionMetadata.customerName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
      const session: DiscoverySession = {
        id: `discovery-${Date.now()}`,
        customerId,
        customerName: sessionMetadata.customerName,
        innovationHubSPOC: sessionMetadata.innovationHubSPOC,
        name: sessionName,
        industry: selectedIndustry || 'general',
        businessFunctions: selectedBusinessFunctions.length ? selectedBusinessFunctions : undefined,
        businessUnitLabel: businessUnitLabel.trim() || undefined,
        targetKpis: targetKpis.length ? targetKpis : undefined,
        desiredOutcomes: desiredOutcomes.trim() || undefined,
        innovationHubLocation: sessionMetadata.innovationHubLocation,
        solutionEngineer: sessionMetadata.solutionEngineer,
        accountTeamRep: sessionMetadata.accountTeamRep,
        primaryStakeholder: sessionMetadata.primaryStakeholder,
        stockTicker: sessionMetadata.stockTicker || undefined,
        entityType: sessionMetadata.entityType,
        accountSegment: sessionMetadata.accountSegment,
        complianceEnforcement: sessionMetadata.complianceEnforcement,
        manualFinancials: sessionMetadata.manualFinancials,
        userRole: sessionMetadata.userRole,
        responses: updatedResponses,
        companyInsights: companyInsights.length > 0 ? companyInsights : undefined,
        companyResearchSummary: companyResearchSummary || undefined,
        createdAt: Date.now(),
        completedAt: Date.now(),
      }
      onComplete(session)
    } else {
      if (isLastBaseQuestion && builtAnswer.trim() && !currentQuestion.isFollowUp && isAIFeatureEnabled('enableFollowUpQuestions')) {
        setShowFollowUpPrompt(true)
      } else {
        setCurrentStep(currentStep + 1)
        const nextQuestion = questions[currentStep + 1]
        const nextResponse = updatedResponses.find((r) => r.questionId === nextQuestion.id)
        setCurrentAnswer(nextResponse?.answer || '')
      }
    }
  }

  const handleGenerateFollowUps = async () => {
    if (!currentQuestion || !currentAnswer.trim()) return
    
    const newFollowUps = await generateFollowUpQuestions(currentQuestion, currentAnswer)
    
    if (newFollowUps.length > 0) {
      setFollowUpQuestions(prev => [...prev, ...newFollowUps])
      toast.success(`Generated ${newFollowUps.length} follow-up question${newFollowUps.length > 1 ? 's' : ''}`)
      setShowFollowUpPrompt(false)
      setCurrentStep(currentStep + 1)
      setCurrentAnswer('')
    } else {
      toast.error('Could not generate follow-up questions')
      handleSkipFollowUps()
    }
  }

  const handleSkipFollowUps = () => {
    setShowFollowUpPrompt(false)
    if (currentStep + 1 < questions.length) {
      setCurrentStep(currentStep + 1)
      const nextQuestion = questions[currentStep + 1]
      const nextResponse = responses.find((r) => r.questionId === nextQuestion.id)
      setCurrentAnswer(nextResponse?.answer || '')
    } else {
      const customerId = `customer-${sessionMetadata.customerName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
      const session: DiscoverySession = {
        id: `discovery-${Date.now()}`,
        customerId,
        customerName: sessionMetadata.customerName,
        innovationHubSPOC: sessionMetadata.innovationHubSPOC,
        name: sessionName,
        industry: selectedIndustry || 'general',
        businessFunctions: selectedBusinessFunctions.length ? selectedBusinessFunctions : undefined,
        businessUnitLabel: businessUnitLabel.trim() || undefined,
        targetKpis: targetKpis.length ? targetKpis : undefined,
        desiredOutcomes: desiredOutcomes.trim() || undefined,
        innovationHubLocation: sessionMetadata.innovationHubLocation,
        solutionEngineer: sessionMetadata.solutionEngineer,
        accountTeamRep: sessionMetadata.accountTeamRep,
        primaryStakeholder: sessionMetadata.primaryStakeholder,
        stockTicker: sessionMetadata.stockTicker || undefined,
        entityType: sessionMetadata.entityType,
        accountSegment: sessionMetadata.accountSegment,
        complianceEnforcement: sessionMetadata.complianceEnforcement,
        manualFinancials: sessionMetadata.manualFinancials,
        userRole: sessionMetadata.userRole,
        responses: responses,
        companyInsights: companyInsights.length > 0 ? companyInsights : undefined,
        companyResearchSummary: companyResearchSummary || undefined,
        createdAt: Date.now(),
        completedAt: Date.now(),
      }
      onComplete(session)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      const prevQuestion = questions[currentStep - 1]
      const prevResponse = responses.find((r) => r.questionId === prevQuestion.id)
      setCurrentAnswer(prevResponse?.answer || '')
    } else if (wizardStep === 'questions') {
      setWizardStep('outcomes')
      setCurrentStep(0)
      setResponses([])
      setCurrentAnswer('')
    } else if (wizardStep === 'outcomes') {
      setWizardStep('research')
    } else if (wizardStep === 'research') {
      setWizardStep(initialDiscoveryTrack ? 'business-function' : 'track')
    } else if (wizardStep === 'track') {
      setWizardStep('business-function')
    } else if (wizardStep === 'business-function') {
      setWizardStep('industry')
    } else if (wizardStep === 'industry') {
      setWizardStep('name')
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'business':
        return 'bg-primary text-primary-foreground'
      case 'technical':
        return 'bg-secondary text-secondary-foreground'
      case 'users':
        return 'bg-accent text-accent-foreground'
      case 'challenges':
        return 'bg-muted text-muted-foreground'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  if (wizardStep === 'name') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-2xl"
        >
          <Card className="border-2">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2">
                <MagnifyingGlass size={28} weight="bold" className="text-primary" />
                <CardTitle className="text-2xl">New Discovery Session</CardTitle>
              </div>
              <CardDescription className="text-base">
                Give your discovery session a meaningful name to help identify it later
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="session-name" className="text-base">
                  Session Name
                </Label>
                <Input
                  id="session-name"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g., Q1 2024 Customer Discovery, Manufacturing Assessment"
                  className="text-base"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && sessionName.trim()) {
                      handleNameNext()
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Choose a name that will help you identify this session when comparing with others
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex justify-between border-t pt-6">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <div className="flex gap-2">
                {onSwitchToLive && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (sessionName.trim()) {
                        onSwitchToLive(sessionName, selectedIndustry || 'general', responses)
                      }
                    }}
                    className="gap-2"
                  >
                    <Microphone size={18} weight="fill" />
                    Switch to Live
                  </Button>
                )}
                <Button onClick={handleNameNext} disabled={!sessionName.trim()} className="gap-2">
                  Continue
                  <ArrowRight size={18} />
                </Button>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    )
  }

  if (wizardStep === 'industry') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-5xl"
        >
          <Card className="border-2">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2">
                <MagnifyingGlass size={28} weight="bold" className="text-primary" />
                <CardTitle className="text-2xl">Select Your Industry</CardTitle>
              </div>
              <CardDescription className="text-base">
                Choose your industry to get tailored discovery questions that match your specific needs
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(Object.keys(industryLabels) as Industry[]).map((industry) => (
                  <motion.button
                    key={industry}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleIndustrySelect(industry)}
                    className="group relative p-6 rounded-lg border-2 border-border hover:border-primary transition-all bg-card hover:bg-muted/50 text-left"
                  >
                    <div className="flex flex-col items-start gap-3">
                      <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {industryIcons[industry]}
                      </div>
                      <h3 className="font-semibold text-foreground text-base leading-tight">
                        {industryLabels[industry]}
                      </h3>
                    </div>
                  </motion.button>
                ))}
              </div>
            </CardContent>

            <CardFooter className="border-t pt-6 flex justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft size={18} className="mr-2" />
                  Back
                </Button>
              </div>
              {onSwitchToLive && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    if (sessionName.trim()) {
                      onSwitchToLive(sessionName, selectedIndustry || 'general', responses)
                    }
                  }}
                  className="gap-2"
                >
                  <Microphone size={18} weight="fill" />
                  Switch to Live
                </Button>
              )}
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    )
  }

  if (wizardStep === 'business-function') {
    const groups = groupedBusinessFunctions()
    const hasSelection = selectedBusinessFunctions.length > 0
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-5xl"
        >
          <Card className="border-2">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2">
                <Buildings size={28} weight="bold" className="text-primary" />
                <CardTitle className="text-2xl">Target Business Function</CardTitle>
              </div>
              <CardDescription className="text-base">
                Which department(s) is this discovery for? Pick one or more to focus use cases on their workflows,
                stakeholders and KPIs &mdash; or skip for an enterprise-wide engagement.
              </CardDescription>
              <div className="flex flex-wrap gap-2">
                {selectedIndustry && (
                  <Badge variant="outline" className="w-fit">{industryLabels[selectedIndustry]}</Badge>
                )}
                {sessionName.trim() && (
                  <Badge variant="secondary" className="w-fit">{sessionName}</Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-5 max-h-[55vh] overflow-y-auto">
              {groups.map((g) => (
                <div key={g.group} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h4>
                  <div className="flex flex-wrap gap-2">
                    {g.functions.map((f) => {
                      const active = selectedBusinessFunctions.includes(f.id)
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggleBusinessFunction(f.id)}
                          title={f.description}
                          className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
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

              <div className="space-y-2 pt-2">
                <Label htmlFor="business-unit" className="text-sm">
                  Business unit / division <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="business-unit"
                  value={businessUnitLabel}
                  onChange={(e) => setBusinessUnitLabel(e.target.value)}
                  placeholder="e.g., Personal & Business Banking"
                />
              </div>
            </CardContent>

            <CardFooter className="border-t pt-6 flex items-center justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft size={18} className="mr-2" />
                  Back
                </Button>
              </div>
              <div className="flex items-center gap-3">
                {!hasSelection && (
                  <span className="text-xs text-muted-foreground">No function = enterprise-wide</span>
                )}
                <Button onClick={handleBusinessFunctionNext} className="gap-2">
                  {hasSelection ? 'Continue' : 'Skip \u2014 enterprise-wide'}
                  <ArrowRight size={18} />
                </Button>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    )
  }

  if (wizardStep === 'track') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-5xl"
        >
          <Card className="border-2">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2">
                <Lightbulb size={28} weight="bold" className="text-primary" />
                <CardTitle className="text-2xl">Select a Discovery Track</CardTitle>
              </div>
              <CardDescription className="text-base">
                Choose whether you want to focus on identifying use cases or assess AI readiness and architecture.
              </CardDescription>

              <div className="flex flex-wrap gap-2">
                {selectedIndustry && (
                  <Badge variant="outline" className="w-fit">
                    {industryLabels[selectedIndustry]}
                  </Badge>
                )}
                {sessionName.trim() && (
                  <Badge variant="secondary" className="w-fit">
                    {sessionName}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleTrackSelect('use-case')}
                  className={`group relative p-6 rounded-lg border-2 transition-all text-left bg-card hover:bg-muted/50 ${
                    discoveryTrack === 'use-case' ? 'border-primary' : 'border-border hover:border-primary'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <MagnifyingGlass size={28} weight="duotone" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground text-base">Use Case Discovery</h3>
                        {discoveryTrack === 'use-case' && (
                          <Badge className="text-xs">Selected</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Identify business opportunities, pain points, users, data sources, and candidate use cases.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Best when the goal is: “What should we build?”
                      </p>
                    </div>
                  </div>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleTrackSelect('ai-assessment')}
                  className={`group relative p-6 rounded-lg border-2 transition-all text-left bg-card hover:bg-muted/50 ${
                    discoveryTrack === 'ai-assessment' ? 'border-primary' : 'border-border hover:border-primary'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Sparkle size={28} weight="duotone" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground text-base">AI Assessment Lite</h3>
                        {discoveryTrack === 'ai-assessment' && (
                          <Badge className="text-xs">Selected</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Assess application architecture, data readiness, model approach, security, governance, and scale.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Best when the goal is: “Are we ready, and how should we implement safely?”
                      </p>
                    </div>
                  </div>
                </motion.button>
              </div>
            </CardContent>

            <CardFooter className="border-t pt-6 flex justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft size={18} className="mr-2" />
                  Back
                </Button>
              </div>
              <Button
                onClick={() => setWizardStep('research')}
                className="gap-2"
              >
                Continue
                <ArrowRight size={18} />
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    )
  }

  if (wizardStep === 'outcomes') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-3xl"
        >
          <Card className="border-2">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2">
                <Target size={28} weight="bold" className="text-primary" />
                <CardTitle className="text-2xl">Desired Business Outcomes</CardTitle>
              </div>
              <CardDescription className="text-base">
                Which business KPIs should these use cases move, and what does success look like? This focuses the AI on
                outcomes you care about &mdash; or skip and let it infer them.
              </CardDescription>
              <div className="flex flex-wrap gap-2">
                {selectedIndustry && (
                  <Badge variant="outline" className="w-fit">{industryLabels[selectedIndustry]}</Badge>
                )}
                {sessionName.trim() && (
                  <Badge variant="secondary" className="w-fit">{sessionName}</Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Target KPIs</Label>
                <KPISelector selectedKPIs={targetKpis} onChange={setTargetKpis} maxSelection={8} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desired-outcomes">
                  Desired outcomes / targets <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="desired-outcomes"
                  value={desiredOutcomes}
                  onChange={(e) => setDesiredOutcomes(e.target.value)}
                  placeholder="e.g., Reduce month-end close from 8 to 3 days; cut contact-centre handle time 30%; improve forecast accuracy to 90%."
                  rows={3}
                />
              </div>
            </CardContent>

            <CardFooter className="border-t pt-6 flex justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft size={18} className="mr-2" />
                  Back
                </Button>
              </div>
              <Button onClick={handleOutcomesNext} className="gap-2">
                {targetKpis.length ? `Continue with ${targetKpis.length} KPI${targetKpis.length > 1 ? 's' : ''}` : 'Skip \u2014 let AI infer'}
                <ArrowRight size={18} />
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    )
  }

  if (wizardStep === 'research') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-5xl"
        >
          <Card className="border-2">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2">
                <FileMagnifyingGlass size={28} weight="bold" className="text-primary" />
                <div className="flex flex-col">
                  <CardTitle className="text-2xl">Company Research</CardTitle>
                  <CardDescription className="text-base mt-1">
                    Add context about {sessionMetadata.customerName} to generate more relevant insights
                  </CardDescription>
                </div>
              </div>
              {selectedIndustry && (
                <Badge variant="outline" className="w-fit">
                  {industryLabels[selectedIndustry]}
                </Badge>
              )}
            </CardHeader>

            <CardContent>
              <CompanyResearch
                companyName={sessionMetadata.customerName}
                entityType={sessionMetadata.entityType}
                onInsightsChange={handleCompanyInsightsChange}
                onSummaryChange={handleCompanyResearchSummaryChange}
                initialInsights={companyInsights}
                initialSummary={companyResearchSummary}
                persistenceKey={researchPersistenceKey}
              />
            </CardContent>

            <CardFooter className="border-t pt-6 flex justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft size={18} className="mr-2" />
                  Back
                </Button>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleResearchSkip}
                  className="gap-2"
                >
                  <SkipForward size={18} />
                  Skip Research
                </Button>
                <Button onClick={handleResearchNext} className="gap-2">
                  {companyInsights.length > 0 
                    ? `Continue with ${companyInsights.length} Insight${companyInsights.length > 1 ? 's' : ''}`
                    : 'Continue'
                  }
                  <ArrowRight size={18} />
                </Button>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 max-w-3xl">
        <NavigationHeader
          variant="minimal"
          onBackToLanding={onBackToLanding}
          onBack={onCancel}
          backLabel="Cancel"
        />
      </div>
      <div className="flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl"
      >
        <Card className="border-2">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MagnifyingGlass size={28} weight="bold" className="text-primary" />
                <div className="flex flex-col">
                  <CardTitle className="text-2xl">Discovery Process</CardTitle>
                  {selectedIndustry && (
                    <Badge variant="outline" className="w-fit mt-1">
                      {industryLabels[selectedIndustry]}
                    </Badge>
                  )}
                </div>
              </div>
              <Badge variant="outline" className="text-sm">
                Question {currentStep + 1} of {questions.length}
              </Badge>
            </div>
            <Progress value={progress} className="h-2" />
            <CardDescription className="text-base">
              Help us understand your needs to identify potential use cases
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <AnimatePresence mode="wait">
              {showFollowUpPrompt ? (
                <motion.div
                  key="followup-prompt"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-4"
                >
                  <Alert className="bg-primary/10 border-primary/30">
                    <Sparkle size={20} weight="fill" className="text-primary" />
                    <AlertDescription className="text-base">
                      <p className="font-semibold text-foreground mb-2">
                        Great answer! Would you like AI-generated follow-up questions?
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Based on your response, I can generate 1-2 targeted follow-up questions to dig deeper and uncover more valuable insights.
                      </p>
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      onClick={handleGenerateFollowUps}
                      disabled={isGeneratingFollowUp}
                      className="gap-2"
                      size="lg"
                    >
                      <Sparkle size={18} weight="fill" />
                      {isGeneratingFollowUp ? 'Generating Questions...' : 'Yes, Generate Follow-ups'}
                    </Button>
                    <Button
                      onClick={handleSkipFollowUps}
                      variant="outline"
                      size="lg"
                      disabled={isGeneratingFollowUp}
                    >
                      No, Continue to Next Question
                    </Button>
                  </div>

                  {isGeneratingFollowUp && (
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground animate-pulse">
                        Analyzing your answer and generating intelligent follow-up questions...
                      </p>
                    </div>
                  )}
                </motion.div>
              ) : currentQuestion && (
                <motion.div
                  key={currentQuestion.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <Badge className={getCategoryColor(currentQuestion.category)}>
                      {currentQuestion.category}
                    </Badge>
                    {currentQuestion.industries && (
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/30">
                        Industry-Specific
                      </Badge>
                    )}
                    {currentQuestion.isFollowUp && (
                      <Badge variant="outline" className="bg-accent/20 text-accent-foreground border-accent/40">
                        <Sparkle size={12} weight="fill" className="mr-1" />
                        AI Follow-up
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-foreground leading-relaxed">
                      {currentQuestion.question}
                    </h3>
                    {currentQuestion.inputType === 'ranking' && currentQuestion.rankingItems?.length ? (
                      <div className="space-y-4">
                        <div className="space-y-3">
                          {currentQuestion.rankingItems.map((item) => {
                            const usedRanks = new Set(
                              Object.entries(currentRanking)
                                .filter(([k, v]) => k !== item && typeof v === 'number')
                                .map(([, v]) => v as number)
                            )

                            const selectedRank = currentRanking[item]
                            const maxRank = currentQuestion.rankingItems?.length ?? 0

                            return (
                              <div key={item} className="flex items-center justify-between gap-3">
                                <div className="text-sm text-foreground flex-1">{item}</div>
                                <Select
                                  value={selectedRank ? String(selectedRank) : ''}
                                  onValueChange={(value) => {
                                    const rank = value ? Number(value) : null
                                    setCurrentRanking((prev) => {
                                      const next = { ...prev }
                                      if (rank !== null) {
                                        for (const key of Object.keys(next)) {
                                          if (key !== item && next[key] === rank) {
                                            next[key] = null
                                          }
                                        }
                                      }
                                      next[item] = rank
                                      return next
                                    })
                                  }}
                                >
                                  <SelectTrigger className="w-[140px]">
                                    <SelectValue placeholder="Select rank" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: maxRank }).map((_, i) => {
                                      const rankValue = i + 1
                                      const disabled = usedRanks.has(rankValue) && selectedRank !== rankValue
                                      return (
                                        <SelectItem key={rankValue} value={String(rankValue)} disabled={disabled}>
                                          {rankValue}
                                        </SelectItem>
                                      )
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                            )
                          })}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm">Comments / context (optional)</Label>
                          <Textarea
                            value={currentComment}
                            onChange={(e) => setCurrentComment(e.target.value)}
                            placeholder={currentQuestion.placeholder}
                            className="min-h-[120px] resize-none text-base"
                            autoFocus
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCurrentRanking(getDefaultRankingState(currentQuestion))
                              setCurrentComment('')
                            }}
                            className="text-xs"
                          >
                            Clear ranking
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Textarea
                        value={currentAnswer}
                        onChange={(e) => setCurrentAnswer(e.target.value)}
                        placeholder={currentQuestion.placeholder}
                        className="min-h-[180px] resize-none text-base"
                        autoFocus
                      />
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Optional: You can skip questions and come back later
                      </p>
                      {isAIFeatureEnabled('enableAIInsights') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={generateAiSuggestion}
                          disabled={isGeneratingSuggestion}
                          className="gap-2 text-xs"
                        >
                          <Sparkle size={14} weight="fill" className="text-primary" />
                          {isGeneratingSuggestion ? 'Thinking...' : 'Need help?'}
                        </Button>
                      )}
                    </div>

                    <AnimatePresence>
                      {showAiSuggestion && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <Alert className="bg-primary/5 border-primary/20 mt-3">
                            <Lightbulb size={18} weight="fill" className="text-primary" />
                            <AlertDescription className="text-sm">
                              {isGeneratingSuggestion ? (
                                <span className="text-muted-foreground italic">Generating suggestions...</span>
                              ) : (
                                <div className="text-foreground">
                                  {aiSuggestionItems.length > 0 ? (
                                    <>
                                      <ol className="list-decimal pl-5 space-y-1">
                                        {aiSuggestionItems.map((q, idx) => (
                                          <li key={`${idx}-${q}`}>{q}</li>
                                        ))}
                                      </ol>
                                      <InlineDisclaimer
                                        text="AI-generated suggestions based on your industry and prior answers. Use as starting points."
                                        icon="ai"
                                        className="mt-2"
                                      />
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">No suggestions available.</span>
                                  )}
                                </div>
                              )}
                            </AlertDescription>
                          </Alert>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>

          <CardFooter className="flex justify-between border-t pt-6">
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              {!showFollowUpPrompt && (
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft size={18} className="mr-2" />
                  Back
                </Button>
              )}
            </div>
            {!showFollowUpPrompt && (
              <div className="flex gap-2">
                {onSwitchToLive && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (sessionName.trim() && selectedIndustry) {
                        const filteredResponses = responses.filter((r) => r.questionId !== currentQuestion?.id)
                        const builtAnswer = buildAnswerForCurrentQuestion(currentQuestion || null)
                        const hasStructuredAnswer = currentQuestion?.inputType === 'ranking'
                          ? (Object.values(currentRanking).some((v) => typeof v === 'number') || currentComment.trim().length > 0)
                          : builtAnswer.trim().length > 0

                        const updatedResponses = hasStructuredAnswer && currentQuestion
                          ? [...filteredResponses, {
                              questionId: currentQuestion.id,
                              answer: builtAnswer,
                              ranking: currentQuestion.inputType === 'ranking'
                                ? Object.fromEntries(
                                    Object.entries(currentRanking)
                                      .filter(([, v]) => typeof v === 'number')
                                      .map(([k, v]) => [k, v as number])
                                  )
                                : undefined,
                              comment: currentQuestion.inputType === 'ranking' && currentComment.trim()
                                ? currentComment.trim()
                                : undefined,
                            }]
                          : filteredResponses
                        onSwitchToLive(sessionName, selectedIndustry, updatedResponses)
                      }
                    }}
                    className="gap-2"
                  >
                    <Microphone size={18} weight="fill" />
                    Switch to Live
                  </Button>
                )}
                <Button onClick={handleNext} className="gap-2">
                  {isLastQuestion ? (
                    <>
                      <Sparkle size={18} weight="fill" />
                      Generate Use Cases
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight size={18} />
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardFooter>
        </Card>
      </motion.div>
      </div>
    </div>
  )
}
