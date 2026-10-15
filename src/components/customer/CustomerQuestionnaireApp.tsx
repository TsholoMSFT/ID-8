/**
 * CustomerQuestionnaireApp — the isolated customer self-serve surface.
 *
 * Mounted ONLY when the URL is /q/<token> (see src/main.tsx). It renders its own
 * minimal shell and never imports the consultant app tree (no NavigationHeader,
 * no AppView, no dashboard). The customer:
 *   1. confirms company + enters email (required) + stakeholder + optional function
 *   2. answers the consultant-scoped questions (autosaved locally, resumable)
 *   3. submits, then can download a copy (JSON / Markdown / print-to-PDF)
 *
 * Answers are kept in-memory so the download works even if the network submit fails.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  Printer,
  Warning,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getQuestionnaire,
  submitQuestionnaire,
  QuestionnaireError,
  QuestionnaireValidationError,
  type QuestionnaireValidationDetail,
} from '@/lib/questionnaire-api'
import { downloadResponsesJson, downloadResponsesMarkdown } from '@/lib/questionnaire-export'
import { businessFunctionLabel, groupedBusinessFunctions } from '@/lib/business-functions'
import { industryLabels } from '@/lib/discovery-questions'
import type { BusinessFunction, DiscoveryQuestion, DiscoveryResponse, Industry } from '@/lib/types'
import type { QuestionnaireLinkConfig } from '@/lib/questionnaire-types'
import { QuestionCard, type AnswerState } from './QuestionCard'

type Phase = 'loading' | 'load-error' | 'welcome' | 'questions' | 'submitting' | 'done'

interface PersistedState {
  companyName: string
  email: string
  primaryStakeholder: string
  businessFunction: string
  answers: Record<string, AnswerState>
  index: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function CustomerQuestionnaireApp({ token }: { token: string }) {
  const storageKey = `id8:q:${token}`

  const [phase, setPhase] = useState<Phase>('loading')
  const [config, setConfig] = useState<QuestionnaireLinkConfig | null>(null)
  const [loadError, setLoadError] = useState<{ kind: string; message: string } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [validationDetails, setValidationDetails] = useState<QuestionnaireValidationDetail[]>([])

  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [primaryStakeholder, setPrimaryStakeholder] = useState('')
  const [businessFunction, setBusinessFunction] = useState('')
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
  const [index, setIndex] = useState(0)

  // ── Load config + restore any local autosave ──────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { config: cfg } = await getQuestionnaire(token)
        if (cancelled) return
        setConfig(cfg)
        setCompanyName(cfg.customerName)
        try {
          const saved = localStorage.getItem(storageKey)
          if (saved) {
            const s = JSON.parse(saved) as PersistedState
            setCompanyName(s.companyName || cfg.customerName)
            setEmail(s.email || '')
            setPrimaryStakeholder(s.primaryStakeholder || '')
            setBusinessFunction(s.businessFunction || '')
            setAnswers(s.answers || {})
            setIndex(Math.min(s.index || 0, Math.max(0, cfg.questions.length - 1)))
          }
        } catch {
          /* ignore corrupt autosave */
        }
        setPhase('welcome')
      } catch (err) {
        if (cancelled) return
        const qe = err as QuestionnaireError
        setLoadError({ kind: qe.kind ?? 'error', message: qe.message })
        setPhase('load-error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, storageKey])

  // ── Autosave ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'loading' || phase === 'load-error' || phase === 'done') return
    const state: PersistedState = { companyName, email, primaryStakeholder, businessFunction, answers, index }
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, [phase, companyName, email, primaryStakeholder, businessFunction, answers, index, storageKey])

  const questions = config?.questions ?? []
  const total = questions.length
  const current: DiscoveryQuestion | undefined = questions[index]
  const emailValid = EMAIL_RE.test(email.trim())

  const businessFunctionOptions = useMemo(() => {
    const scoped = (config?.businessFunctions ?? []).filter(Boolean)
    if (scoped.length) {
      return scoped.map((id) => ({ id, label: businessFunctionLabel(id as BusinessFunction) }))
    }
    return null // fall back to full grouped list
  }, [config])

  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id]?.answer ?? '').trim().length > 0).length,
    [questions, answers],
  )

  const buildResponses = (): DiscoveryResponse[] =>
    questions
      .map((q) => {
        const a = answers[q.id]
        if (!a || (!a.answer?.trim() && !a.ranking)) return null
        const r: DiscoveryResponse = { questionId: q.id, answer: a.answer ?? '' }
        if (a.ranking && Object.keys(a.ranking).length) r.ranking = a.ranking
        if (a.comment?.trim()) r.comment = a.comment.trim()
        return r
      })
      .filter((r): r is DiscoveryResponse => r !== null)

  const exportInput = () => ({
    companyName,
    email: email.trim() || undefined,
    primaryStakeholder: primaryStakeholder.trim() || undefined,
    businessFunction: businessFunction || undefined,
    industry: config ? industryLabels[config.industry as Industry] : undefined,
    submittedAt: Date.now(),
    questions,
    responses: buildResponses(),
  })

  const handleSubmit = async () => {
    setSubmitError(null)
    setValidationDetails([])
    setPhase('submitting')
    try {
      await submitQuestionnaire(token, {
        email: email.trim(),
        primaryStakeholder: primaryStakeholder.trim() || undefined,
        businessFunction: (businessFunction || undefined) as BusinessFunction | undefined,
        companyName: companyName.trim() || undefined,
        responses: buildResponses(),
      })
      try {
        localStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
      setPhase('done')
    } catch (err) {
      if (err instanceof QuestionnaireValidationError) {
        setValidationDetails(err.details)
        const firstInvalidIndex = questions.findIndex((question) => question.id === err.details[0]?.questionId)
        if (firstInvalidIndex >= 0) setIndex(firstInvalidIndex)
      }
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. You can still download your answers below.')
      setPhase('questions')
    }
  }

  // ── Shell ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="border-b bg-background">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-2">
          <Buildings size={22} weight="duotone" className="text-primary" />
          <span className="font-semibold tracking-tight">Discovery Questionnaire</span>
          {config && <span className="text-muted-foreground text-sm ml-auto">{config.customerName}</span>}
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
        {phase === 'loading' && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-24">
            <CircleNotch size={20} className="animate-spin" />
            Loading…
          </div>
        )}

        {phase === 'load-error' && loadError && (
          <Alert variant="destructive" className="mt-8">
            <Warning size={18} />
            <AlertTitle>
              {loadError.kind === 'expired'
                ? 'This questionnaire has expired'
                : loadError.kind === 'not-found'
                  ? 'Questionnaire not found'
                  : 'Something went wrong'}
            </AlertTitle>
            <AlertDescription>
              {loadError.message} Please contact your Microsoft representative for an updated link.
            </AlertDescription>
          </Alert>
        )}

        {phase === 'welcome' && config && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Welcome{config.customerName ? `, ${config.customerName}` : ''}</CardTitle>
              <CardDescription>
                {config.introMessage ||
                  'Please share a few details and answer the questions below. Your responses help us tailor the discovery session to your priorities.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="company">Company name</Label>
                <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">
                  Your email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  aria-invalid={email.length > 0 && !emailValid}
                />
                {email.length > 0 && !emailValid && (
                  <p className="text-xs text-destructive">Please enter a valid email address.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stakeholder">Primary stakeholder (optional)</Label>
                <Input
                  id="stakeholder"
                  value={primaryStakeholder}
                  onChange={(e) => setPrimaryStakeholder(e.target.value)}
                  placeholder="Name of the main contact"
                />
              </div>
              <div className="space-y-2">
                <Label>Business function (optional)</Label>
                <Select value={businessFunction} onValueChange={setBusinessFunction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a business function" />
                  </SelectTrigger>
                  <SelectContent>
                    {businessFunctionOptions
                      ? businessFunctionOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.label}
                          </SelectItem>
                        ))
                      : groupedBusinessFunctions().map((g) => (
                          <SelectGroup key={g.group}>
                            <SelectLabel>{g.label}</SelectLabel>
                            {g.functions.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="justify-end border-t pt-6">
              <Button disabled={!emailValid} onClick={() => setPhase('questions')}>
                Start questionnaire
                <ArrowRight size={18} className="ml-2" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {(phase === 'questions' || phase === 'submitting') && config && current && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Question {index + 1} of {total}
                </span>
                <span>{answeredCount} answered</span>
              </div>
              <Progress value={((index + 1) / total) * 100} />
            </div>

            {submitError && (
              <Alert variant="destructive">
                <Warning size={18} />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-xl leading-snug">{current.question}</CardTitle>
              </CardHeader>
              <CardContent>
                <QuestionCard
                  question={current}
                  value={answers[current.id] ?? { answer: '' }}
                  onChange={(next) => {
                    setAnswers((prev) => ({ ...prev, [current.id]: next }))
                    setValidationDetails((details) => details.filter((detail) => detail.questionId !== current.id))
                  }}
                />
                {validationDetails
                  .filter((detail) => detail.questionId === current.id)
                  .map((detail) => (
                    <p key={detail.error} className="text-sm text-destructive mt-3">
                      {detail.error}
                    </p>
                  ))}
                <p className="text-xs text-muted-foreground mt-3">
                  Optional — you can skip a question and come back to it later.
                </p>
              </CardContent>
              <CardFooter className="justify-between border-t pt-6">
                <Button
                  variant="ghost"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0 || phase === 'submitting'}
                >
                  <ArrowLeft size={18} className="mr-2" />
                  Back
                </Button>
                {index < total - 1 ? (
                  <Button onClick={() => setIndex((i) => Math.min(total - 1, i + 1))} disabled={phase === 'submitting'}>
                    Next
                    <ArrowRight size={18} className="ml-2" />
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={phase === 'submitting'}>
                    {phase === 'submitting' ? (
                      <>
                        <CircleNotch size={18} className="mr-2 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      'Submit responses'
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        )}

        {phase === 'done' && config && (
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="items-center text-center">
              <CheckCircle size={48} weight="fill" className="text-green-600 mb-2" />
              <CardTitle className="text-2xl">Thank you!</CardTitle>
              <CardDescription>
                Your responses have been submitted. A Microsoft representative will follow up to review the findings with
                you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Keep a copy of your answers for your records:
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 print:hidden">
                <Button variant="outline" onClick={() => downloadResponsesMarkdown(exportInput())}>
                  <DownloadSimple size={18} className="mr-2" />
                  Download (Markdown)
                </Button>
                <Button variant="outline" onClick={() => downloadResponsesJson(exportInput())}>
                  <DownloadSimple size={18} className="mr-2" />
                  Download (JSON)
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer size={18} className="mr-2" />
                  Print / Save as PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t bg-background py-4">
        <div className="max-w-3xl mx-auto px-4 text-xs text-muted-foreground text-center">
          Powered by ID-8 · Your responses are shared only with your Microsoft engagement team.
        </div>
      </footer>
    </div>
  )
}
