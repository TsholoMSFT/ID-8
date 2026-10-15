/**
 * Page 12 — Specialist vs CSAM Lens (Section 10)
 * Page 13 — Export / Copy Outputs (Section 15)
 */
import { useMemo } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowsLeftRight, Export, EnvelopeSimple, Copy, Table, MicrosoftTeamsLogo } from '@phosphor-icons/react'
import { openOutlookCompose, openTeamsShare } from '@/lib/share-helpers'
import { computeAllScores, prioritiseUseCases, topValueGaps } from '@/lib/csam/scoring'
import { recommendNextBestActions } from '@/lib/csam/engine'
import { ADOPTION_STAGE_LABELS, type CsamCustomerProfile } from '@/lib/csam/types'
import { PageHeader } from '../shared'

// ============================================================================
// Specialist vs CSAM Lens
// ============================================================================

const SPECIALIST_POINTS = [
  'Opportunity creation & qualification',
  'Solution fit & product alignment',
  'Business case to buy (ROI / TCO)',
  'Technical win & proof',
  'Competitive differentiation',
  'Pipeline / close plan',
  'Partner attach',
  'Customer commitment',
]

const CSAM_POINTS = [
  'Value realisation & usage / adoption',
  'Customer health & workload resiliency',
  'Behavioural change & supportability',
  'Financial value validation',
  'Renewal value & expansion readiness',
  'Executive success narrative',
  'Customer Success Plan & CSDR actions',
  'Next best action to unlock value',
]

export function SpecialistVsCsamLensPage({ profile }: { profile: CsamCustomerProfile }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Specialist vs CSAM Lens"
        description="The same account, two lenses. The Specialist asks why to invest; the CSAM asks whether value is being realised and what must happen next."
        icon={<ArrowsLeftRight size={24} />}
      />
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-sky-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-sky-700">Specialist view (pre-sale)</CardTitle>
            <p className="text-sm text-muted-foreground">“Why should the customer invest?”</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm list-disc list-inside">
              {SPECIALIST_POINTS.map((p) => <li key={p} className="text-muted-foreground"><span className="text-foreground">{p}</span></li>)}
            </ul>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-700">CSAM view (post-sale)</CardTitle>
            <p className="text-sm text-muted-foreground">“Is the customer realising value, and what must happen next?”</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm list-disc list-inside">
              {CSAM_POINTS.map((p) => <li key={p} className="text-muted-foreground"><span className="text-foreground">{p}</span></li>)}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">This account, through the CSAM lens</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• {profile.useCases.length} use case(s); the lead focus is value realisation, not opportunity creation.</p>
          <p>• Pre-sale framing assumed “{profile.name} should invest”; the CSAM job now is to prove and unlock that value.</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Export / Copy Outputs
// ============================================================================

function buildSummaryMarkdown(profile: CsamCustomerProfile): string {
  const scores = computeAllScores(profile)
  const gaps = topValueGaps(profile)
  const actions = recommendNextBestActions(profile).slice(0, 5)
  return [
    `# Customer Value Realisation \u2014 ${profile.name}`,
    '',
    '## Scorecard',
    ...scores.map((s) => `- ${s.label}: ${s.score}/100 (${s.colorState}, ${s.confidence})`),
    '',
    '## Top value gaps',
    ...(gaps.length ? gaps.map((g) => `- ${g}`) : ['- None material']),
    '',
    '## Next best actions',
    ...actions.map((a) => `- [${a.timeframe}] ${a.recommendation}`),
    '',
    '> Financial impacts are hypotheses to validate with the customer, not realised value.',
  ].join('\n')
}

function buildCspUpdate(profile: CsamCustomerProfile): string {
  const ranked = prioritiseUseCases(profile).slice(0, 5)
  return [
    `Customer Success Plan update \u2014 ${profile.name}`,
    '',
    'Priorities this period:',
    ...ranked.map((r, i) => `${i + 1}. [${r.category}] ${r.useCase.name} \u2014 ${ADOPTION_STAGE_LABELS[r.useCase.adoptionStage]}`),
  ].join('\n')
}

function buildTracker(profile: CsamCustomerProfile): string {
  const header = ['Use case', 'Solution area', 'Adoption stage', 'Linked investment', 'Behavioural blockers']
  const rows = profile.useCases.map((u) => [
    u.name,
    u.solutionArea,
    u.adoptionStage,
    profile.investments.find((i) => i.id === u.linkedInvestmentId)?.product ?? '',
    (u.behaviouralBarriers ?? []).join('; '),
  ])
  return [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.startsWith('ID-8-') ? filename : `ID-8-${filename}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Copy failed')
  }
}

export function ExportPage({ profile }: { profile: CsamCustomerProfile }) {
  const summary = useMemo(() => buildSummaryMarkdown(profile), [profile])

  const exports = [
    {
      icon: <Copy size={18} />,
      title: 'CSDR summary',
      desc: 'Scorecard, value gaps and next actions as markdown.',
      action: () => copy(summary, 'CSDR summary'),
      label: 'Copy',
    },
    {
      icon: <Copy size={18} />,
      title: 'Customer Success Plan update',
      desc: 'Prioritised use cases for the CSP.',
      action: () => copy(buildCspUpdate(profile), 'CSP update'),
      label: 'Copy',
    },
    {
      icon: <EnvelopeSimple size={18} />,
      title: 'Executive email',
      desc: 'Open a pre-filled Outlook message.',
      action: () =>
        openOutlookCompose({ subject: `Value realisation review \u2014 ${profile.name}`, body: summary, isHtml: false }),
      label: 'Compose',
    },
    {
      icon: <MicrosoftTeamsLogo size={18} />,
      title: 'Share to Teams',
      desc: 'Post the summary to a Teams chat.',
      action: () => openTeamsShare({ message: summary, topic: `Value realisation \u2014 ${profile.name}` }),
      label: 'Share',
    },
    {
      icon: <Table size={18} />,
      title: 'Value-realisation tracker (CSV)',
      desc: 'Download the use-case tracker.',
      action: () => downloadFile(`${profile.name.replace(/\s+/g, '-')}-value-tracker.csv`, buildTracker(profile), 'text/csv'),
      label: 'Download',
    },
    {
      icon: <Export size={18} />,
      title: 'PPTX slide outline',
      desc: 'Copy a slide outline for a CSDR deck.',
      action: () => copy(summary, 'Slide outline'),
      label: 'Copy',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export / Copy Outputs"
        description="Take the cockpit into your CSDR, Success Plan, account plan, email or deck."
        icon={<Export size={24} />}
      />
      <div className="grid md:grid-cols-2 gap-3">
        {exports.map((e) => (
          <Card key={e.title}>
            <CardContent className="pt-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="text-primary mt-0.5">{e.icon}</div>
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-sm text-muted-foreground">{e.desc}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={e.action}>{e.label}</Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Reuses the existing Teams / Outlook share helpers. Financial figures are framed as hypotheses to validate.
      </p>
    </div>
  )
}
