import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Sparkle, Copy, ArrowsClockwise, Download, X } from '@phosphor-icons/react'
import { marked } from 'marked'
import type { UseCase } from '@/lib/types'
import { generateBusinessCase, type BusinessCaseContext } from '@/lib/business-case-service'
import { estimateRunCost } from '@/lib/cost-engine'
import { toast } from 'sonner'

interface BusinessCaseProps {
  useCase: UseCase
  context?: BusinessCaseContext
  onUpdate?: (useCase: UseCase) => void
  onClose?: () => void
}

function fmtMoney(n?: number): string {
  if (!n || !isFinite(n)) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function stripUnsafe(html: string): string {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
}

export function BusinessCase({ useCase, context, onUpdate, onClose }: BusinessCaseProps) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const md = useCase.businessCase?.markdown
  const generatedAt = useCase.businessCase?.generatedAt

  const html = useMemo(() => (md ? stripUnsafe(marked.parse(md, { async: false }) as string) : ''), [md])

  const runCost = useCase.runCost ?? estimateRunCost(useCase)
  const ev = useCase.expectedValue
  const coi = useCase.costOfInaction
  const netAnnual = (ev?.totalAnnualValue ?? 0) - (runCost.totalAnnualUSD ?? 0)

  const generate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const newMd = await generateBusinessCase(useCase, context)
      if (onUpdate) {
        onUpdate({
          ...useCase,
          businessCase: { markdown: newMd, generatedAt: Date.now(), model: 'gpt-4o-mini' },
        })
      }
      toast.success('Business Case generated')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Generation failed'
      setError(msg)
      toast.error(`Business Case failed: ${msg}`)
    } finally {
      setGenerating(false)
    }
  }

  const copyMarkdown = async () => {
    if (!md) return
    await navigator.clipboard.writeText(md)
    toast.success('Markdown copied')
  }

  const downloadMarkdown = () => {
    if (!md) return
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ID-8-business-case-${useCase.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printPdf = () => {
    if (!md) return
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) { toast.error('Pop-up blocked'); return }
    w.document.write(`<!doctype html><html><head><title>Business Case — ${useCase.title}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1.5rem; color: #111; line-height: 1.55; }
        h1 { color: #0078d4; border-bottom: 2px solid #0078d4; padding-bottom: 0.4rem; }
        h2 { color: #323130; margin-top: 1.6rem; }
        ul { padding-left: 1.4rem; }
        .meta { color: #605e5c; font-size: 0.85rem; margin-bottom: 1.5rem; }
        @media print { body { margin: 0.6in; max-width: none; } }
      </style></head><body>
      <h1>Business Case — ${useCase.title}</h1>
      <div class="meta">Generated ${generatedAt ? new Date(generatedAt).toLocaleString() : 'now'} · ID-8</div>
      ${html}
      <script>window.onload = () => window.print();</script>
      </body></html>`)
    w.document.close()
  }

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText size={18} weight="duotone" className="text-primary" />
              Business Case
            </CardTitle>
            <CardDescription className="text-xs">
              One-page executive view: Problem · Solution · COI · Run Cost · Value · Asks.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {md && (
              <>
                <Button variant="ghost" size="icon" onClick={copyMarkdown} aria-label="Copy markdown to clipboard">
                  <Copy size={16} />
                </Button>
                <Button variant="ghost" size="icon" onClick={downloadMarkdown} aria-label="Download markdown">
                  <Download size={16} />
                </Button>
                <Button variant="ghost" size="icon" onClick={printPdf} aria-label="Print / save as PDF">
                  <FileText size={16} />
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={generate} disabled={generating} className="h-8">
              {generating ? <ArrowsClockwise size={14} className="animate-spin mr-1" /> : <Sparkle size={14} className="mr-1" />}
              {md ? 'Regenerate' : 'Generate'}
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close business case">
                <X size={16} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick numerics row — always visible even before AI generation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          <div className="rounded border bg-red-500/5 border-red-500/20 p-2">
            <div className="text-[10px] uppercase text-red-700">COI / yr</div>
            <div className="text-sm font-semibold text-red-700">{fmtMoney(coi?.totalAnnualCOI)}</div>
          </div>
          <div className="rounded border bg-emerald-500/5 border-emerald-500/20 p-2">
            <div className="text-[10px] uppercase text-emerald-700">Run cost / yr</div>
            <div className="text-sm font-semibold text-emerald-700">{fmtMoney(runCost.totalAnnualUSD)}</div>
          </div>
          <div className="rounded border bg-green-500/5 border-green-500/20 p-2">
            <div className="text-[10px] uppercase text-green-700">Value / yr</div>
            <div className="text-sm font-semibold text-green-700">{fmtMoney(ev?.totalAnnualValue)}</div>
          </div>
          <div className={`rounded border p-2 ${netAnnual > 0 ? 'bg-blue-500/5 border-blue-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
            <div className={`text-[10px] uppercase ${netAnnual > 0 ? 'text-blue-700' : 'text-amber-700'}`}>Net / yr</div>
            <div className={`text-sm font-semibold ${netAnnual > 0 ? 'text-blue-700' : 'text-amber-700'}`}>{fmtMoney(netAnnual)}</div>
            {ev?.paybackMonths ? <div className="text-[10px] text-muted-foreground">{ev.paybackMonths}mo payback</div> : null}
          </div>
        </div>

        {error && (
          <div className="rounded border bg-red-500/10 border-red-500/30 p-2 text-xs text-red-700">{error}</div>
        )}

        {!md && !generating && (
          <div className="rounded border-dashed border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
            Click <strong>Generate</strong> to draft an executive Business Case from the data on this card.
          </div>
        )}

        {md && (
          <>
            <div
              className="prose prose-sm max-w-none [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_ul]:my-1 [&_li]:my-0"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t">
              <span>Generated {generatedAt ? new Date(generatedAt).toLocaleString() : '—'} · {useCase.businessCase?.model || 'gpt-4o-mini'}</span>
              <Badge variant="outline" className="text-[10px]">AI-drafted, review before sharing</Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
