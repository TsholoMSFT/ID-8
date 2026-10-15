import { useState, useEffect, useRef, useMemo } from 'react'
import { DiscoverySession, UseCase, AIRegulationsInfo, CybersecurityInfo, EarningsInsight, StrategicAlignmentInfo, UseCaseBusinessProcess, UseCaseMicrosoftSolution, UseCaseAgenticOpportunity, ImplementationComplexityInfo, BusinessFunction, DiscoveryResponse, DiscoveryQuestion } from '@/lib/types'
import { useDiscovery } from '@/hooks/use-discovery'
import { discoveryQuestions, getQuestionsForIndustry, industryLabels } from '@/lib/discovery-questions'
import { BUSINESS_FUNCTION_IDS } from '@/lib/business-functions'
import { AVAILABLE_KPIS } from '@/lib/kpis'
import { getRegulationsForIndustry, getSecurityRequirementsForIndustry, getRegulationsForJurisdiction, getFallbackUseCasesForIndustry } from '@/lib/industry-fallbacks'
import { detectJurisdictions, getApplicableFrameworks, getRegulationDisplayInfo } from '@/lib/regulatory-engine'
import { formatRegulatoryContext } from '@/lib/regulatory-news-service'
import { fetchRegulatoryNews } from '@/lib/regulatory-news-service'
import { sanitizePromptInput } from '@/lib/sanitize'
import { 
  searchEarningsTranscripts, 
  analyzeTranscriptsWithAI, 
  CompanyInsight, 
  EarningsSearchResult,
  fetchFinancialStatements,
  fetchCompanyNews,
  fetchIndustryResearch,
  FinancialMetrics,
  NewsSearchResult,
  IndustryResearchResult
} from '@/lib/earnings-service'
import { EnhancedDiscoveryWorkflow } from '@/components/EnhancedDiscoveryWorkflow'
import { QuestionnaireImportPanel, type ImportedQuestionnaire } from '@/components/QuestionnaireImportPanel'
import { EngagementPrepCard } from '@/components/EngagementPrepCard'
import { NavigationHeader } from '@/components/NavigationHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkle, ArrowClockwise, Warning, ChartLineUp, Database, CheckCircle, CaretDown, CaretUp, Quotes, DownloadSimple } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  generateUseCaseCandidates as requestUseCaseCandidates,
  type CandidateEvidenceSource,
} from '@/lib/use-case-generation-service'

interface DiscoveryResultsProps {
  session: DiscoverySession
  onCreateUseCases: (useCases: Partial<UseCase>[], executiveSummary: string, nextAction?: 'dashboard' | 'solution-design') => void
  onBack: () => void
}

interface SuggestedUseCase {
  title: string
  description: string
  rationale: string
  businessFunction?: BusinessFunction
  selected: boolean
  aiRegulations?: AIRegulationsInfo
  cybersecurity?: CybersecurityInfo
  // Innovation Hub Methodology additions
  strategicAlignment?: StrategicAlignmentInfo
  businessProcesses?: (UseCaseBusinessProcess & { processData?: any })[]
  microsoftSolutions?: UseCaseMicrosoftSolution[]
  referenceArchitecture?: string
  agenticOpportunities?: UseCaseAgenticOpportunity[]
  implementationComplexity?: ImplementationComplexityInfo
  kpis?: string[]
}

type FallbackReason = 'no-responses' | 'api-error' | 'empty-result'

function restoreSuggestedUseCases(session: DiscoverySession): SuggestedUseCase[] {
  return (session.suggestedUseCases ?? []).map((useCase) => ({
    ...useCase,
    selected: true,
  }))
}

function restoreFallbackReason(session: DiscoverySession): FallbackReason | null {
  const reason = session.useCaseGeneration?.fallbackReason
  return reason === 'no-responses' || reason === 'api-error' || reason === 'empty-result' ? reason : null
}

export function DiscoveryResults({ session, onCreateUseCases, onBack }: DiscoveryResultsProps) {
  const { updateSession } = useDiscovery()
  const restoredUseCases = restoreSuggestedUseCases(session)
  const [isGenerating, setIsGenerating] = useState(restoredUseCases.length === 0)
  const [generationPhase, setGenerationPhase] = useState<'analyzing' | 'fetching-earnings' | 'generating'>('analyzing')
  const [suggestedUseCases, setSuggestedUseCases] = useState<SuggestedUseCase[]>(restoredUseCases)
  const [earningsInsights, setEarningsInsights] = useState<EarningsInsight[]>(session.earningsInsights ?? [])
  const [earningsDataSources, setEarningsDataSources] = useState<EarningsSearchResult['sources'] | null>(null)
  const [financialMetrics, setFinancialMetrics] = useState<FinancialMetrics | null>(null)
  const [newsArticles, setNewsArticles] = useState<NewsSearchResult | null>(null)
  const [industryInsights, setIndustryInsights] = useState<IndustryResearchResult | null>(null)
  const [showWorkflow, setShowWorkflow] = useState(false)
  const [usedFallback, setUsedFallback] = useState(session.useCaseGeneration?.mode === 'template')
  const [fallbackReason, setFallbackReason] = useState<FallbackReason | null>(restoreFallbackReason(session))
  const [usedEarningsData, setUsedEarningsData] = useState((session.earningsInsights?.length ?? 0) > 0)
  const [showAllInsights, setShowAllInsights] = useState(false)
  const generationAttemptedRef = useRef<string | null>(null)
  const importedRef = useRef<{ responses: DiscoveryResponse[]; questions: DiscoveryQuestion[] } | null>(null)
  const [importedSummary, setImportedSummary] = useState<{ email?: string; count: number } | null>(null)
  const [showImportPanel, setShowImportPanel] = useState(false)

  // Load fallback use cases for the industry
  const loadFallbackUseCases = (reason: FallbackReason) => {
    const industry = session.industry || 'general'
    const fallbackCases = getFallbackUseCasesForIndustry(industry)
    
    const useCases: SuggestedUseCase[] = fallbackCases.map((fc) => ({
      title: fc.title,
      description: fc.description,
      rationale: fc.rationale,
      selected: true,
      aiRegulations: fc.aiRegulations,
      cybersecurity: fc.cybersecurity,
    }))
    
    setSuggestedUseCases(useCases)
    setUsedFallback(true)
    
    const useCaseData = useCases.map((uc) => ({
      title: uc.title,
      description: uc.description,
      rationale: uc.rationale,
      aiRegulations: uc.aiRegulations,
      cybersecurity: uc.cybersecurity,
      dataSources: ['fallback'] as ('earnings' | 'financials' | 'news' | 'industry-research' | 'discovery' | 'ai-generated' | 'manual' | 'fallback')[],
    }))
    
    updateSession(session.id, {
      suggestedUseCases: useCaseData,
      useCaseGeneration: {
        mode: 'template',
        generatedAt: Date.now(),
        fallbackReason: reason,
        evidenceSources: ['fallback'],
      },
    })
    
    toast.info(`Showing ${useCases.length} sample use cases for ${industryLabels[industry] || 'your industry'}`, {
      description: 'AI generation unavailable. These are curated samples you can customize.',
    })
  }

  const generateUseCases = async () => {
    setIsGenerating(true)
    setGenerationPhase('analyzing')
    setFallbackReason(null)
    
    try {
      const baseQuestions = session.industry 
        ? getQuestionsForIndustry(session.industry) 
        : discoveryQuestions.filter((q) => !q.industries)
      // Include imported customer-questionnaire questions so their responses resolve their text.
      const importedQuestions = importedRef.current?.questions ?? session.importedQuestionnaireQuestions ?? []
      const allQuestions = importedQuestions.length ? [...baseQuestions, ...importedQuestions] : baseQuestions

      // Merge consultant responses with any imported customer responses (deduped by questionId).
      const importedResponses = importedRef.current?.responses ?? []
      const effectiveResponses = importedResponses.length
        ? [...session.responses.filter((sr) => !importedResponses.some((ir) => ir.questionId === sr.questionId)), ...importedResponses]
        : session.responses

      // Check if we have any meaningful responses
      const hasResponses = effectiveResponses.length > 0 && 
        effectiveResponses.some(r => r.answer && r.answer.trim().length > 0)
      const hasCompanyInsights = session.companyInsights && session.companyInsights.length > 0
      const hasStockTicker = !!session.stockTicker

      // If no responses, no company insights, and no stock ticker, use fallback immediately
      if (!hasResponses && !hasCompanyInsights && !hasStockTicker) {
        console.log('No discovery data available, loading fallback')
        setFallbackReason('no-responses')
        loadFallbackUseCases('no-responses')
        setIsGenerating(false)
        return
      }

      // Desired business KPI outcomes captured in Discovery.
      const targetKpiNames = (session.targetKpis ?? []).map((id) => AVAILABLE_KPIS.find((k) => k.id === id)?.name ?? id)

      // Determine jurisdiction from location (enhanced with regulatory engine)
      const detectedJurisdictions = detectJurisdictions(session.innovationHubLocation || '')
      const jurisdiction = detectedJurisdictions.length > 0 ? detectedJurisdictions[0] : 'United States'
      
      // Get applicable regulatory frameworks for this session
      const applicableFrameworkCodes = getApplicableFrameworks(detectedJurisdictions, session.industry)
      const regulatoryFrameworkContext = applicableFrameworkCodes.length > 0
        ? `\n\nAPPLICABLE REGULATORY FRAMEWORKS (${detectedJurisdictions.join(', ')}):
${applicableFrameworkCodes.map(code => {
  const info = getRegulationDisplayInfo(code)
  return `- ${info.shortName} (${info.jurisdiction}): ${info.displayName}`
}).join('\n')}
IMPORTANT: When assessing each use case, consider these frameworks for risk classification and compliance notes.
Enforcement mode: ${session.complianceEnforcement || 'advisory'}`
        : ''

      // Fetch live regulatory news context (non-blocking)
      let regulatoryNewsContext = ''
      try {
        const newsItems = await fetchRegulatoryNews(detectedJurisdictions, session.industry?.toString())
        if (newsItems.length > 0) {
          regulatoryNewsContext = `\n\nRECENT REGULATORY NEWS & ENFORCEMENT (live):
${formatRegulatoryContext(newsItems)}
Consider these recent developments when assessing use case risk and compliance.`
        }
      } catch {
        // Non-critical — continue without live news
      }

      // Fetch all data sources (earnings, financials, news, industry research)
      const dataSources: ('earnings' | 'financials' | 'news' | 'industry-research' | 'discovery')[] = ['discovery']
      let earningsContext = ''
      let financialsContext = ''
      let newsContext = ''
      let industryResearchContext = ''
      let companyResearchContext = ''
      let fetchedInsights: EarningsInsight[] = []
      let hasTickerWarning = false

      // Add company research insights from discovery session if available
      if (session.companyInsights && session.companyInsights.length > 0) {
        dataSources.push('discovery')
        const insightsByCategory: Record<string, typeof session.companyInsights> = {}
        session.companyInsights.forEach(i => {
          if (!insightsByCategory[i.category]) {
            insightsByCategory[i.category] = []
          }
          insightsByCategory[i.category].push(i)
        })
        
        companyResearchContext = `\n\nCOMPANY RESEARCH INSIGHTS (from pasted documents, news, or RSS feeds):
${Object.entries(insightsByCategory).map(([cat, items]) => 
  `${cat.toUpperCase()}:
${items.map(i => `- ${i.title}: ${i.summary}
  AI Relevance: ${i.relevanceToAI}
  Potential Use Cases: ${i.potentialUseCases.join(', ')}`).join('\n')}`
).join('\n\n')}

IMPORTANT: Use these company research insights to inform your use case suggestions. Address the company's stated initiatives, solve their pain points, and leverage identified opportunities.`

        toast.success(`Using ${session.companyInsights.length} company research insights`)
      }

      // Add research summary if available
      if (session.companyResearchSummary) {
        companyResearchContext += `\n\nCOMPANY RESEARCH SUMMARY (AI-generated overview):\n${session.companyResearchSummary}`
      }
      
      if (session.stockTicker) {
        setGenerationPhase('fetching-earnings')
        try {
          // Determine region based on ticker format
          const region: 'US' | 'ZA' | 'EU' | 'GLOBAL' = 
            session.stockTicker.includes('.JO') || session.stockTicker.includes('.JSE') ? 'ZA' :
            session.stockTicker.includes('.L') || session.stockTicker.includes('.DE') || session.stockTicker.includes('.PA') ? 'EU' :
            session.stockTicker.match(/^[A-Z]{1,5}$/) ? 'US' : 'GLOBAL'
          
          // Fetch all data sources in parallel
          const [earningsResult, financialsResult, newsResult] = await Promise.allSettled([
            searchEarningsTranscripts(session.customerName, { ticker: session.stockTicker, region }),
            fetchFinancialStatements(session.stockTicker),
            fetchCompanyNews(session.customerName, session.stockTicker),
          ])
          
          // Process earnings transcripts
          if (earningsResult.status === 'fulfilled' && earningsResult.value.transcripts.length > 0) {
            setEarningsDataSources(earningsResult.value.sources)
            
            // Analyze transcripts with AI
            const insights = await analyzeTranscriptsWithAI(session.customerName, earningsResult.value.transcripts)
            
            if (insights.length > 0) {
              dataSources.push('earnings')
              fetchedInsights = insights.map((i: CompanyInsight): EarningsInsight => ({
                id: i.id,
                category: i.category,
                title: i.title,
                description: i.description,
                quote: i.quote,
                source: i.source,
                relevanceScore: i.relevanceScore,
              }))
              setEarningsInsights(fetchedInsights)
              setUsedEarningsData(true)
              
              // Build earnings context for the prompt
              const insightsByCategory: Record<string, EarningsInsight[]> = {}
              fetchedInsights.forEach(i => {
                if (!insightsByCategory[i.category]) {
                  insightsByCategory[i.category] = []
                }
                insightsByCategory[i.category].push(i)
              })
              
              earningsContext = `\n\nEARNINGS CALL INSIGHTS (from recent earnings transcripts):
${Object.entries(insightsByCategory).map(([cat, items]) => 
  `${cat.toUpperCase().replace('-', ' ')}:
${items.map(i => `- ${i.title}: ${i.description}${i.quote ? ` ("${i.quote}")` : ''}`).join('\n')}`
).join('\n\n')}

IMPORTANT: Use these earnings insights to inform your use case suggestions. Address the company's stated strategic priorities, help solve their pain points, and align with their investment areas.`

              toast.success(`Found ${fetchedInsights.length} insights from ${earningsResult.value.transcripts.length} earnings transcripts`)
            }
          }
          
          // Process financial statements
          if (financialsResult.status === 'fulfilled' && financialsResult.value.statements.length > 0) {
            dataSources.push('financials')
            const financials = financialsResult.value
            setFinancialMetrics(financials)
            
            const statements = financials.statements[0]
            financialsContext = `\n\nFINANCIAL STATEMENTS & METRICS:
${financials.summary}

Key Financial Data:
- Revenue: ${statements.revenue ? `$${(statements.revenue / 1e9).toFixed(2)}B` : 'N/A'}
- Net Income: ${statements.netIncome ? `$${(statements.netIncome / 1e9).toFixed(2)}B` : 'N/A'}
- Total Assets: ${statements.totalAssets ? `$${(statements.totalAssets / 1e9).toFixed(2)}B` : 'N/A'}

IMPORTANT: Use these financial metrics to inform use cases about cost savings, revenue growth opportunities, and ROI potential. Consider the company's financial scale when sizing opportunities.`

            toast.success('Loaded financial statements')
          }
          
          // Process company news
          if (newsResult.status === 'fulfilled' && newsResult.value.articles.length > 0) {
            dataSources.push('news')
            const news = newsResult.value
            setNewsArticles(news)
            
            const recentNews = news.articles.slice(0, 8)
            newsContext = `\n\nRECENT COMPANY NEWS (${recentNews.length} articles):
${recentNews.map(a => `- ${a.title} (${a.source}, ${a.sentiment})`).join('\n')}

IMPORTANT: Consider these recent developments, announcements, and market sentiment when suggesting use cases. Align with current business initiatives and market conditions.`

            toast.success(`Found ${news.articles.length} recent news articles`)
          }
        } catch (error) {
          console.warn('Could not fetch financial data:', error)
          // Continue without financial data
        }
      } else {
        hasTickerWarning = true
      }
      
      // Fetch industry research (always, doesn't require ticker)
      if (session.industry && session.industry !== 'general') {
        try {
          const industryResult = await fetchIndustryResearch(session.industry, session.customerName)
          if (industryResult.insights.length > 0) {
            dataSources.push('industry-research')
            setIndustryInsights(industryResult)
            
            industryResearchContext = `\n\nINDUSTRY STANDARDS, TRENDS & REGULATIONS:
${industryResult.insights.map(i => `- [${i.category.toUpperCase()}] ${i.title}: ${i.description} (Source: ${i.source})`).join('\n')}

IMPORTANT: Ensure use cases align with industry standards and address key trends. Consider regulatory compliance requirements.`

            toast.success(`Found ${industryResult.insights.length} industry insights`)
          }
        } catch (error) {
          console.warn('Could not fetch industry research:', error)
        }
      }
      
      // Show warning if no ticker provided
      if (hasTickerWarning) {
        toast.warning('No stock ticker provided', {
          description: 'Use cases will be generated from discovery responses and industry research only. Add a ticker for comprehensive financial analysis.',
          duration: 5000,
        })
      }

      setGenerationPhase('generating')

      // Sanitize user-supplied values before prompt interpolation
      const safeCustomerName = sanitizePromptInput(session.customerName || '')


      const evidence: Array<{ source: CandidateEvidenceSource; title?: string; content: string }> = []
      const addEvidence = (source: CandidateEvidenceSource, title: string, content: string) => {
        const normalized = sanitizePromptInput(content).trim().slice(0, 4_000)
        if (normalized) evidence.push({ source, title, content: normalized })
      }
      addEvidence('company-research', 'Company research', companyResearchContext)
      addEvidence('earnings', 'Earnings insights', earningsContext)
      addEvidence('financials', 'Financial context', financialsContext)
      addEvidence('news', 'Company news', newsContext)
      addEvidence('industry-research', 'Industry and regulatory context', `${industryResearchContext}${regulatoryFrameworkContext}${regulatoryNewsContext}`)

      const candidateResponse = await requestUseCaseCandidates({
        customerName: safeCustomerName,
        industry: session.industry ? industryLabels[session.industry] : 'General',
        jurisdiction,
        businessFunctions: session.businessFunctions ?? [],
        targetKpis: targetKpiNames,
        desiredOutcomes: session.desiredOutcomes,
        responses: effectiveResponses
          .filter((response) => response.answer.trim())
          .map((response) => ({
            question: allQuestions.find((question) => question.id === response.questionId)?.question || response.questionId,
            answer: sanitizePromptInput(response.answer),
          })),
        evidence,
      })

      // Get default regulations based on industry and jurisdiction for fallback
      const defaultRegulations = session.industry 
        ? getRegulationsForIndustry(session.industry) 
        : []
      const jurisdictionRegs = getRegulationsForJurisdiction(jurisdiction)
      const defaultSecurityReqs = session.industry 
        ? getSecurityRequirementsForIndustry(session.industry) 
        : []

      const riskClassification = {
        low: 'minimal',
        medium: 'limited',
        high: 'high',
      } as const
      const useCases: SuggestedUseCase[] = candidateResponse.useCases.map((candidate, index) => ({
          title: candidate.title,
          description: candidate.description,
          rationale: `${candidate.rationale} Expected outcomes: ${candidate.expectedOutcomes.join('; ')}.`,
          kpis: candidate.kpis,
          businessFunction: (BUSINESS_FUNCTION_IDS as string[]).includes(candidate.businessFunction)
            ? (candidate.businessFunction as BusinessFunction)
            : session.businessFunctions?.[0],
          selected: true,
          aiRegulations: {
            applicableFrameworks: [...new Set([...defaultRegulations, ...jurisdictionRegs])],
            riskClassification: riskClassification[candidate.preliminaryRisk.level],
            complianceNotes: candidate.preliminaryRisk.notes,
            jurisdictions: [jurisdiction],
          },
          cybersecurity: {
            securityRequirements: defaultSecurityReqs,
            dataClassification: 'internal',
            securityNotes: candidate.preliminaryRisk.notes,
          },
          strategicAlignment: {
            primaryPriority: candidate.strategicAlignment.primaryPriority,
            linkedPriorities: [],
            alignmentScore: candidate.strategicAlignment.alignmentScore,
            alignmentRationale: candidate.strategicAlignment.rationale,
            source: 'ai-generated',
          },
          businessProcesses: [{
            processId: `process-${Date.now()}-${index}`,
            processName: candidate.processContext.processName,
            affectedSteps: [],
            currentPainPoints: candidate.processContext.painPoints,
            proposedImprovement: candidate.processContext.proposedImprovement,
          }],
          implementationComplexity: {
            level: candidate.complexity.level,
            factors: [candidate.complexity.rationale],
            keyRisks: [candidate.preliminaryRisk.notes],
          },
        }))
      setSuggestedUseCases(useCases)
      toast.success(`Generated ${useCases.length} use-case candidates ready for scoring!`)
      
      const useCaseData = useCases.map((uc: SuggestedUseCase) => ({
        title: uc.title,
        description: uc.description,
        rationale: uc.rationale,
        kpis: uc.kpis,
        aiRegulations: uc.aiRegulations,
        cybersecurity: uc.cybersecurity,
        dataSources: [...dataSources, 'ai-generated'] as ('earnings' | 'financials' | 'news' | 'industry-research' | 'discovery' | 'ai-generated' | 'manual' | 'fallback')[],
        // Innovation Hub Methodology additions
        strategicAlignment: uc.strategicAlignment,
        businessProcesses: uc.businessProcesses,
        microsoftSolutions: uc.microsoftSolutions,
        referenceArchitecture: uc.referenceArchitecture,
        agenticOpportunities: uc.agenticOpportunities,
        implementationComplexity: uc.implementationComplexity,
      }))
      
      updateSession(session.id, {
        suggestedUseCases: useCaseData,
        earningsInsights: fetchedInsights.length > 0 ? fetchedInsights : undefined,
        useCaseGeneration: {
          mode: 'ai',
          provider: candidateResponse.generation.provider,
          model: candidateResponse.generation.model,
          deployment: candidateResponse.generation.deployment,
          correlationId: candidateResponse.generation.correlationId,
          generatedAt: Date.parse(candidateResponse.generation.generatedAt),
          evidenceSources: dataSources,
        },
      })
      
      // Check if AI returned empty results
      if (useCases.length === 0) {
        console.warn('AI returned empty use cases, loading fallback')
        setFallbackReason('empty-result')
        loadFallbackUseCases('empty-result')
      }
    } catch (error) {
      console.error('Error generating use cases:', error)
      
      // Show error message and load fallback use cases
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      setFallbackReason('api-error')
      
      if (errorMessage.includes('Azure Functions') || errorMessage.includes('API') || errorMessage.includes('fetch') || errorMessage.includes('No AI models')) {
        toast.error('AI service unavailable', {
          description: 'Loading sample use cases instead. You can retry once the service is available.',
        })
      } else {
        toast.error('Failed to generate use cases', {
          description: 'Loading sample use cases for your industry.',
        })
      }
      
      // Load fallback use cases
      loadFallbackUseCases('api-error')
    } finally {
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    if (generationAttemptedRef.current === session.id) return
    generationAttemptedRef.current = session.id

    if (session.suggestedUseCases?.length) {
      setSuggestedUseCases(restoreSuggestedUseCases(session))
      setEarningsInsights(session.earningsInsights ?? [])
      setUsedFallback(session.useCaseGeneration?.mode === 'template')
      setFallbackReason(restoreFallbackReason(session))
      setUsedEarningsData((session.earningsInsights?.length ?? 0) > 0)
      setIsGenerating(false)
      return
    }

    if (session.awaitingCustomerResponses) {
      setIsGenerating(false)
      setShowImportPanel(true)
      return
    }

    void generateUseCases()
    // Generation is intentionally one attempt per session ID. Imported-response
    // retries and the explicit Retry action invoke generateUseCases directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.awaitingCustomerResponses])

  const handleRetryGeneration = async () => {
    setUsedFallback(false)
    setFallbackReason(null)
    setUsedEarningsData(false)
    setSuggestedUseCases([])
    setEarningsInsights([])
    await generateUseCases()
  }

  const handleStartWorkflow = () => {
    setShowWorkflow(true)
  }

  const handleWorkflowComplete = (useCases: Partial<UseCase>[], executiveSummary: string, nextAction?: 'dashboard' | 'solution-design') => {
    updateSession(session.id, {
      executiveSummary,
      completedAt: Date.now(),
    })
    onCreateUseCases(useCases, executiveSummary, nextAction)
  }

  const engagementTranscript = useMemo(() => {
    const base = session.industry
      ? getQuestionsForIndustry(session.industry)
      : discoveryQuestions.filter((q) => !q.industries)
    const imported = importedRef.current?.questions ?? session.importedQuestionnaireQuestions ?? []
    const qs = [...base, ...imported]
    const importedResp = importedRef.current?.responses ?? []
    const responses = importedResp.length
      ? [...session.responses.filter((sr) => !importedResp.some((ir) => ir.questionId === sr.questionId)), ...importedResp]
      : session.responses
    return responses
      .map((r) => `Q: ${qs.find((x) => x.id === r.questionId)?.question ?? r.questionId}\nA: ${r.answer}`)
      .join('\n\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, importedSummary])

  const handleImportResponses = (data: ImportedQuestionnaire) => {
    importedRef.current = { responses: data.responses, questions: data.questions }
    const merged = [
      ...session.responses.filter((sr) => !data.responses.some((ir) => ir.questionId === sr.questionId)),
      ...data.responses,
    ]
    updateSession(session.id, {
      responses: merged,
      importedQuestionnaireQuestions: data.questions,
      customerEmail: data.email,
      awaitingCustomerResponses: false,
    })
    setImportedSummary({ email: data.email, count: data.responses.length })
    setShowImportPanel(false)
    setIsGenerating(true)
    generateUseCases()
  }

  if (showImportPanel) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Customer Responses" subtitle={session.customerName} onBack={onBack} />
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
          <QuestionnaireImportPanel
            onImport={handleImportResponses}
            onSkip={() => {
              setShowImportPanel(false)
              if (suggestedUseCases.length === 0 && !isGenerating) {
                setIsGenerating(true)
                generateUseCases()
              }
            }}
          />
        </div>
      </div>
    )
  }

  if (showWorkflow) {
    return (
      <EnhancedDiscoveryWorkflow
        session={session}
        initialUseCases={suggestedUseCases}
        onComplete={handleWorkflowComplete}
        onCancel={onBack}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 md:px-6 py-8 max-w-4xl">
        {!isGenerating && (
          <div className="flex items-center justify-end gap-3 mb-4">
            {importedSummary && (
              <span className="text-xs text-muted-foreground mr-auto">
                Imported {importedSummary.count} customer answers{importedSummary.email ? ` from ${importedSummary.email}` : ''}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowImportPanel(true)}>
              <DownloadSimple size={16} className="mr-2" />
              Import customer responses
            </Button>
          </div>
        )}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {isGenerating ? (
            <Card className="border-2">
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center gap-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    {generationPhase === 'fetching-earnings' ? (
                      <ChartLineUp size={48} weight="fill" className="text-primary" />
                    ) : (
                      <Sparkle size={48} weight="fill" className="text-primary" />
                    )}
                  </motion.div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-semibold text-foreground">
                      {generationPhase === 'analyzing' && 'Analyzing Your Responses'}
                      {generationPhase === 'fetching-earnings' && 'Fetching Financial Intelligence'}
                      {generationPhase === 'generating' && 'Generating Use Cases'}
                    </h3>
                    <p className="text-muted-foreground">
                      {generationPhase === 'analyzing' && 'Processing discovery session data...'}
                      {generationPhase === 'fetching-earnings' && `Retrieving earnings transcripts for ${session.stockTicker}...`}
                      {generationPhase === 'generating' && 'Creating AI-powered recommendations...'}
                    </p>
                    {session.stockTicker && generationPhase === 'analyzing' && (
                      <p className="text-xs text-muted-foreground">
                        Will also analyze earnings calls for {session.stockTicker}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-2">
              <CardContent className="py-12 text-center space-y-6">
                <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                  {usedFallback ? (
                    <Warning size={40} weight="duotone" className="text-amber-500" />
                  ) : usedEarningsData ? (
                    <ChartLineUp size={40} weight="duotone" className="text-primary" />
                  ) : (
                    <Sparkle size={40} weight="duotone" className="text-primary" />
                  )}
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">
                    {suggestedUseCases.length} Use Cases {usedFallback ? 'Available' : 'Identified'}
                  </h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {usedFallback ? (
                      <>Sample use cases for {industryLabels[session.industry || 'general']}. You can customize these during the scoring workflow.</>
                    ) : usedEarningsData ? (
                      <>AI-generated use cases informed by {earningsInsights.length} insights from earnings transcripts</>
                    ) : (
                      <>Ready to review, score, and prioritize these opportunities through our guided workflow</>
                    )}
                  </p>
                  {usedFallback && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {fallbackReason === 'no-responses' 
                          ? 'No discovery responses provided. Complete the discovery questions or add company research to generate personalized AI use cases.'
                          : fallbackReason === 'api-error'
                          ? 'AI service was unavailable. These are curated samples that can be edited.'
                          : fallbackReason === 'empty-result'
                          ? 'AI could not generate use cases from the provided data. These are curated samples.'
                          : 'AI generation was unavailable. These are curated samples that can be edited.'
                        }
                      </p>
                      <Button 
                        onClick={handleRetryGeneration} 
                        variant="outline" 
                        size="sm" 
                        className="gap-2"
                        disabled={isGenerating}
                      >
                        <ArrowClockwise size={14} className={isGenerating ? 'animate-spin' : ''} />
                        {isGenerating ? 'Generating...' : 'Retry AI Generation'}
                      </Button>
                    </div>
                  )}
                  {usedEarningsData && (earningsInsights.length > 0 || financialMetrics || newsArticles || industryInsights) && (
                    <div className="mt-4 space-y-3 max-w-lg mx-auto">
                      <div className="p-4 bg-primary/5 rounded-lg text-left">
                        <div className="flex items-start gap-3 mb-3">
                          <Database size={20} className="text-primary mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-primary mb-1">
                              How Comprehensive Data Enriches Use Cases
                            </p>
                            <p className="text-xs text-muted-foreground">
                              We analyzed multiple data sources including earnings transcripts, financial statements, recent news, and industry research
                              to identify the company's strategic priorities, pain points, and investment areas. This comprehensive intelligence ensures 
                              our AI-generated use cases directly address their stated business goals and challenges.
                            </p>
                          </div>
                        </div>
                        
                        {/* Data Sources Overview */}
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                          <p className="text-xs font-medium text-foreground mb-2">Data Sources Used:</p>
                          
                          {earningsInsights.length > 0 && (
                            <div className="flex items-start gap-2 text-xs">
                              <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/30">
                                <CheckCircle size={12} weight="fill" />
                                Earnings Transcripts
                              </Badge>
                              <span className="text-muted-foreground">{earningsInsights.length} insights from recent calls</span>
                            </div>
                          )}
                          
                          {financialMetrics && financialMetrics.statements.length > 0 && (
                            <div className="flex items-start gap-2 text-xs">
                              <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-500/30">
                                <CheckCircle size={12} weight="fill" />
                                Financial Statements
                              </Badge>
                              <span className="text-muted-foreground">Income statement, balance sheet, metrics</span>
                            </div>
                          )}
                          
                          {newsArticles && newsArticles.articles.length > 0 && (
                            <div className="flex items-start gap-2 text-xs">
                              <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-600 border-orange-500/30">
                                <CheckCircle size={12} weight="fill" />
                                Company News
                              </Badge>
                              <span className="text-muted-foreground">{newsArticles.articles.length} recent articles with sentiment analysis</span>
                            </div>
                          )}
                          
                          {industryInsights && industryInsights.insights.length > 0 && (
                            <div className="flex items-start gap-2 text-xs">
                              <Badge variant="outline" className="gap-1 bg-purple-500/10 text-purple-600 border-purple-500/30">
                                <CheckCircle size={12} weight="fill" />
                                Industry Research
                              </Badge>
                              <span className="text-muted-foreground">{industryInsights.insights.length} insights on trends & standards</span>
                            </div>
                          )}
                          
                          <div className="flex items-start gap-2 text-xs">
                            <Badge variant="outline" className="gap-1 bg-gray-500/10 text-gray-300 border-gray-500/30">
                              <CheckCircle size={12} weight="fill" />
                              Discovery Session
                            </Badge>
                            <span className="text-muted-foreground">{session.responses.length} Q&A responses</span>
                          </div>
                        </div>
                        
                        {earningsDataSources && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <p className="text-xs font-medium text-foreground mb-2">Financial Data Sources:</p>
                            <div className="flex flex-wrap gap-2">
                              {earningsDataSources.secEdgar && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <CheckCircle size={12} weight="fill" />
                                  SEC EDGAR
                                </Badge>
                              )}
                              {earningsDataSources.jseSens && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <CheckCircle size={12} weight="fill" />
                                  JSE SENS
                                </Badge>
                              )}
                              {earningsDataSources.yahooFinance && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <CheckCircle size={12} weight="fill" />
                                  Yahoo Finance
                                </Badge>
                              )}
                              {earningsDataSources.alphaVantage && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <CheckCircle size={12} weight="fill" />
                                  Alpha Vantage
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Key Insights Section - Expandable */}
                      {earningsInsights.length > 0 && (
                        <div className="p-3 bg-accent/30 rounded-lg text-left">
                          <button 
                            onClick={() => setShowAllInsights(!showAllInsights)}
                            className="w-full flex items-center justify-between text-xs font-medium text-foreground mb-2 hover:text-primary transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <Quotes size={14} weight="fill" className="text-primary" />
                              Key Insights from Earnings ({earningsInsights.length})
                            </span>
                            {showAllInsights ? <CaretUp size={14} /> : <CaretDown size={14} />}
                          </button>
                          
                          <div className="space-y-3">
                            {(showAllInsights ? earningsInsights : earningsInsights.slice(0, 3)).map((insight) => (
                              <div key={insight.id} className="bg-background/50 rounded-md p-2.5 border border-border/50">
                                <div className="flex items-start gap-2">
                                  <Badge 
                                    variant="outline" 
                                    className={`text-[10px] shrink-0 ${
                                      insight.category === 'strategic-priority' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                      insight.category === 'pain-point' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                                      insight.category === 'opportunity' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                                      insight.category === 'investment' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                                      insight.category === 'risk' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                                      'bg-gray-500/10 text-gray-400 border-gray-500/30'
                                    }`}
                                  >
                                    {insight.category.replace('-', ' ')}
                                  </Badge>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground">{insight.title}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                                    {insight.quote && (
                                      <blockquote className="mt-2 pl-2 border-l-2 border-primary/50 text-xs text-muted-foreground italic">
                                        "{insight.quote}"
                                      </blockquote>
                                    )}
                                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                                      Source: {insight.source} • Relevance: {insight.relevanceScore}/10
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {!showAllInsights && earningsInsights.length > 3 && (
                            <button 
                              onClick={() => setShowAllInsights(true)}
                              className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              Show {earningsInsights.length - 3} more insights
                              <CaretDown size={12} />
                            </button>
                          )}
                        </div>
                      )}

                    </div>
                  )}
                </div>
                <div className="flex gap-3 justify-center pt-4">
                  <Button variant="outline" onClick={onBack}>
                    Cancel
                  </Button>
                  <Button onClick={handleStartWorkflow} size="lg" className="gap-2">
                    Start Scoring Workflow
                    <Sparkle size={20} weight="bold" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {!isGenerating && suggestedUseCases.length > 0 && (
          <div className="mt-6">
            <EngagementPrepCard
              sessionId={session.id}
              customerName={session.customerName}
              industry={session.industry}
              stakeholders={session.primaryStakeholder ? [session.primaryStakeholder] : undefined}
              useCases={suggestedUseCases.map((uc) => ({ title: uc.title, description: uc.description }))}
              transcript={engagementTranscript}
            />
          </div>
        )}
      </div>
    </div>
  )
}
