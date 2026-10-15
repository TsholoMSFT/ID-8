/**
 * FY27 alignment scorecard tab — the leadership-facing roll-up + share/export.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Copy, MicrosoftTeamsLogo, CheckCircle, Warning } from '@phosphor-icons/react'
import { openTeamsShare } from '@/lib/share-helpers'
import type { Fy27AlignmentScorecard, Fy27Band } from '@/lib/fy27-types'

const BAND_COLOR: Record<Fy27Band, string> = {
  strong: 'text-green-600',
  moderate: 'text-amber-600',
  partial: 'text-orange-600',
  weak: 'text-red-600',
}

const BAND_BADGE: Record<Fy27Band, string> = {
  strong: 'bg-green-100 text-green-800 border-green-200',
  moderate: 'bg-amber-100 text-amber-800 border-amber-200',
  partial: 'bg-orange-100 text-orange-800 border-orange-200',
  weak: 'bg-red-100 text-red-800 border-red-200',
}

function buildScorecardText(scorecard: Fy27AlignmentScorecard): string {
  const lines: string[] = []
  lines.push(`ATS FY27 Alignment — ${scorecard.customerName ?? 'Account'}`)
  lines.push(`Overall: ${scorecard.overallScore}/100 (${scorecard.overallBand.toUpperCase()})`)
  lines.push('')
  for (const f of scorecard.focusScores) {
    lines.push(`• ${f.label}: ${f.score}/100 (${f.band})`)
    if (f.gaps.length) lines.push(`   Gaps: ${f.gaps.join('; ')}`)
  }
  lines.push('')
  lines.push(`Generated ${new Date(scorecard.generatedAt).toLocaleDateString()} · ID-8`)
  return lines.join('\n')
}

export interface Fy27ScorecardTabProps {
  scorecard: Fy27AlignmentScorecard
}

export function Fy27ScorecardTab({ scorecard }: Fy27ScorecardTabProps) {
  const text = buildScorecardText(scorecard)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Scorecard copied to clipboard')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  const handleShare = () => {
    openTeamsShare({
      message: text,
      topic: `FY27 Alignment — ${scorecard.customerName ?? 'Account'}`,
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">ATS FY27 Alignment</CardTitle>
              <p className="text-sm text-muted-foreground">
                {scorecard.customerName ?? 'Account'} · generated{' '}
                {new Date(scorecard.generatedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCopy}>
                <Copy className="mr-1.5" /> Copy
              </Button>
              <Button size="sm" variant="outline" onClick={handleShare}>
                <MicrosoftTeamsLogo className="mr-1.5" /> Share
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className={`text-4xl font-bold ${BAND_COLOR[scorecard.overallBand]}`}>
              {scorecard.overallScore}
              <span className="text-lg text-muted-foreground font-normal">/100</span>
            </div>
            <div className="flex-1">
              <Progress value={scorecard.overallScore} className="h-3" />
              <p className="mt-1 text-xs text-muted-foreground capitalize">
                Overall alignment: {scorecard.overallBand}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {scorecard.focusScores.map((f) => (
          <Card key={f.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{f.label}</CardTitle>
                <Badge variant="outline" className={BAND_BADGE[f.band]}>
                  {f.score}/100
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={f.score} className="h-2" />
              {f.signals.length > 0 && (
                <ul className="space-y-1">
                  {f.signals.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle className="mt-0.5 shrink-0 text-green-600" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
              {f.gaps.length > 0 && (
                <ul className="space-y-1">
                  {f.gaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-orange-700">
                      <Warning className="mt-0.5 shrink-0" />
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
