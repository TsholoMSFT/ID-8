import type { FrontierReadinessAssessment as ReadinessAssessment } from '@/lib/types'
import {
  FRONTIER_PILLARS,
  FRONTIER_WORKSTREAM_LABELS,
  type FrontierPillarId,
  type FrontierReadinessRating,
  type FrontierWorkstreamId,
} from '@/lib/frontier-ai/catalog'
import { computeFrontierMaturity } from '@/lib/frontier-ai/maturity-engine'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { ChartLineUp, CheckCircle, Circle } from '@phosphor-icons/react'

interface FrontierReadinessAssessmentProps {
  value: ReadinessAssessment
  onChange: (assessment: ReadinessAssessment) => void
}

const RATING_LABELS = [
  'Not started',
  'Exploring',
  'Planning',
  'Implementing',
  'Scaling / Realizing',
] as const

const GROUP_STYLES: Record<FrontierWorkstreamId, { border: string; accent: string; background: string }> = {
  shared: { border: 'border-slate-300 dark:border-slate-600', accent: 'text-slate-700 dark:text-slate-200', background: 'bg-slate-50/70 dark:bg-slate-900/40' },
  trusted: { border: 'border-sky-300 dark:border-sky-700', accent: 'text-sky-700 dark:text-sky-300', background: 'bg-sky-50/60 dark:bg-sky-950/30' },
  agentify: { border: 'border-emerald-300 dark:border-emerald-700', accent: 'text-emerald-700 dark:text-emerald-300', background: 'bg-emerald-50/60 dark:bg-emerald-950/30' },
}

export function FrontierReadinessAssessment({ value, onChange }: FrontierReadinessAssessmentProps) {
  const maturity = computeFrontierMaturity(value.ratings)

  const updateRating = (pillarId: FrontierPillarId, rating: number) => {
    onChange({
      ...value,
      ratings: {
        ...value.ratings,
        [pillarId]: Math.max(0, Math.min(4, rating)) as FrontierReadinessRating,
      },
      assessedAt: Date.now(),
    })
  }

  const updateEvidence = (pillarId: FrontierPillarId, evidence: string) => {
    onChange({
      ...value,
      evidence: { ...value.evidence, [pillarId]: evidence },
      assessedAt: Date.now(),
    })
  }

  return (
    <div className="space-y-6">
      <section className="border-y border-border bg-muted/30 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Current AI maturity</p>
            <h2 className="mt-1 text-3xl font-bold">{maturity.stage}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{maturity.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1.5 bg-background px-3 py-1.5">
              <CheckCircle size={14} /> {maturity.pillarsAtThreshold}/9 at implementation
            </Badge>
            <Badge variant="outline" className="gap-1.5 bg-background px-3 py-1.5">
              <ChartLineUp size={14} /> {maturity.aiPillarsAtThreshold} AI pillars
            </Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        {(['shared', 'trusted', 'agentify'] as const).map((groupId) => {
          const style = GROUP_STYLES[groupId]
          const pillars = FRONTIER_PILLARS.filter((pillar) => pillar.group === groupId)
          return (
            <section key={groupId} className={`border-t-4 ${style.border} ${style.background} p-4`}>
              <div className="mb-4">
                <h3 className={`font-semibold ${style.accent}`}>{FRONTIER_WORKSTREAM_LABELS[groupId]}</h3>
                <p className="text-xs text-muted-foreground">
                  {groupId === 'shared' && 'Security and governance capabilities shared across the journey.'}
                  {groupId === 'trusted' && 'The customer-owned data, application, and AI platform foundation.'}
                  {groupId === 'agentify' && 'Copilot and agent experiences across people and engineering.'}
                </p>
              </div>

              <div className="space-y-5">
                {pillars.map((pillar) => {
                  const rating = value.ratings[pillar.id]
                  return (
                    <div key={pillar.id} className="space-y-2 border-t border-border/70 pt-4 first:border-0 first:pt-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Label htmlFor={`pillar-${pillar.id}`} className="flex items-center gap-2 text-sm font-semibold">
                            <Circle size={7} weight="fill" className={rating >= 3 ? 'text-emerald-600' : 'text-muted-foreground'} />
                            {pillar.name}
                            {pillar.isAiPillar && <Badge variant="outline" className="text-[10px]">AI</Badge>}
                          </Label>
                          <p className="mt-1 text-xs text-muted-foreground">{pillar.description}</p>
                        </div>
                        <Badge className="shrink-0" variant={rating >= 3 ? 'default' : 'secondary'}>
                          {rating} · {RATING_LABELS[rating]}
                        </Badge>
                      </div>
                      <Slider
                        id={`pillar-${pillar.id}`}
                        min={0}
                        max={4}
                        step={1}
                        value={[rating]}
                        onValueChange={([nextRating]) => updateRating(pillar.id, nextRating ?? 0)}
                        aria-label={`${pillar.name} maturity rating`}
                      />
                      <Input
                        value={value.evidence[pillar.id] ?? ''}
                        onChange={(event) => updateEvidence(pillar.id, event.target.value)}
                        placeholder="Customer-agreed evidence or current state"
                        className="h-8 bg-background text-xs"
                      />
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default FrontierReadinessAssessment