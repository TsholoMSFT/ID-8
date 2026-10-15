/**
 * PortfolioIntelligenceView — container for the Pipeline Plan. Holds generated
 * intel per entity (persisted to localStorage), drives live theme generation
 * from pasted/auto-fetched source text via the theme engine, and exports the
 * full multi-sheet workbook.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { DownloadSimple, Sparkle, Info } from '@phosphor-icons/react'
import { PipelinePlanView } from './PipelinePlanView'
import type { EntityIntel } from '@/lib/pipeline-plan'
import { effectiveTicker, type PortfolioSeedEntity } from '@/lib/portfolio-seed'
import { extractThemesForEntity, extractCommitments } from '@/lib/theme-engine'
import { gatherCompanyData } from '@/lib/company-data-service'
import { exportPortfolioWorkbook } from '@/lib/excel-export'

const STORAGE_KEY = 'id8-pipeline-intel-v1'

function loadIntel(): Record<string, EntityIntel> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, EntityIntel>
  } catch {
    return {}
  }
}

export function PortfolioIntelligenceView() {
  const [intel, setIntel] = useState<Record<string, EntityIntel>>(loadIntel)
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())
  const [activeEntity, setActiveEntity] = useState<PortfolioSeedEntity | null>(null)
  const [sourceText, setSourceText] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(intel))
    } catch {
      /* ignore storage quota errors */
    }
  }, [intel])

  const generatedCount = useMemo(
    () => Object.values(intel).filter((i) => (i.pressureThemes?.length ?? 0) + (i.auditThemes?.length ?? 0) > 0).length,
    [intel],
  )

  const extractAndStore = useCallback(
    async (entity: PortfolioSeedEntity, text: string, financialSummary?: string) => {
      const input = {
        companyName: entity.name,
        industry: entity.industry,
        entityType: entity.entityType,
        region: entity.region,
        sourceText: text || undefined,
        financialSummary,
      }
      const isGov = entity.entityType === 'government'
      const [{ pressureThemes, auditThemes }, commitments] = await Promise.all([
        extractThemesForEntity(input),
        extractCommitments(input, isGov ? 'remedial-directive' : 'management-commitment'),
      ])
      setIntel((prev) => ({
        ...prev,
        [entity.id]: { ...prev[entity.id], pressureThemes, auditThemes, commitments },
      }))
      return pressureThemes.length + auditThemes.length
    },
    [],
  )

  const withBusy = useCallback(async (entityId: string, fn: () => Promise<void>) => {
    setGeneratingIds((s) => new Set(s).add(entityId))
    try {
      await fn()
    } finally {
      setGeneratingIds((s) => {
        const n = new Set(s)
        n.delete(entityId)
        return n
      })
    }
  }, [])

  const runGenerate = useCallback(
    (entity: PortfolioSeedEntity, text: string, financialSummary?: string) =>
      withBusy(entity.id, async () => {
        try {
          const total = await extractAndStore(entity, text, financialSummary)
          if (total === 0) toast.warning(`No themes found for ${entity.name}. Paste an earnings transcript or AGSA report and retry.`)
          else toast.success(`Generated ${total} theme${total === 1 ? '' : 's'} for ${entity.name}.`)
        } catch {
          toast.error(`Generation failed for ${entity.name}. Check the backend AI proxy and retry.`)
        }
      }),
    [withBusy, extractAndStore],
  )

  const autoFetchAndGenerate = useCallback(
    (entity: PortfolioSeedEntity) =>
      withBusy(entity.id, async () => {
        try {
          const data = await gatherCompanyData({
            companyName: entity.name,
            ticker: effectiveTicker(entity),
            region: entity.region,
          })
          if (data.sources.length === 0) {
            toast.warning(`No live data found for ${entity.name}. Paste source text instead.`)
            return
          }
          const total = await extractAndStore(entity, data.sourceText, data.financialSummary)
          if (total === 0) toast.warning(`Fetched ${data.sources.join(', ')} but found no themes for ${entity.name}.`)
          else toast.success(`Auto-generated ${total} theme${total === 1 ? '' : 's'} for ${entity.name} from ${data.sources.join(', ')}.`)
        } catch {
          toast.error(`Auto-fetch failed for ${entity.name}.`)
        }
      }),
    [withBusy, extractAndStore],
  )

  const submitDialog = async () => {
    if (!activeEntity) return
    const entity = activeEntity
    const text = sourceText
    setActiveEntity(null)
    setSourceText('')
    await runGenerate(entity, text)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportPortfolioWorkbook(undefined, intel)
      toast.success('Exported pipeline plan workbook.')
    } catch {
      toast.error('Export failed.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Portfolio Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Earnings-driven themes for companies, AGSA audit themes for public sector — across all accounts.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleExport} disabled={exporting}>
          <DownloadSimple size={16} /> {exporting ? 'Exporting…' : 'Export to Excel'}
        </Button>
      </div>

      <PipelinePlanView intel={intel} onGenerate={setActiveEntity} generatingIds={generatingIds} />

      <p className="text-xs text-muted-foreground">
        {generatedCount} of 32 accounts have generated themes. Click “Generate” on a row to add intelligence.
      </p>

      <Dialog open={!!activeEntity} onOpenChange={(open) => !open && setActiveEntity(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkle size={18} /> Generate themes — {activeEntity?.name}
            </DialogTitle>
            <DialogDescription>
              {activeEntity?.entityType === 'government'
                ? 'Paste an AGSA PFMA/MFMA report, annual report, or Treasury/Municipal-Money data. Audit-failure themes are classified against the T1–T11 rubric.'
                : 'Paste an earnings-call transcript, results announcement, SENS statement, or 10-K/annual-report text. Pressure themes are extracted with SA market context.'}
            </DialogDescription>
          </DialogHeader>

          {activeEntity && effectiveTicker(activeEntity) && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <Info size={14} />
              Ticker {effectiveTicker(activeEntity)} — click “Auto-fetch &amp; Generate” to pull financials + news automatically, or paste source text below.
            </div>
          )}

          <Textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Paste transcript / report / filing text here…"
            className="min-h-[220px] font-mono text-xs"
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setActiveEntity(null)}>Cancel</Button>
            {activeEntity && effectiveTicker(activeEntity) && (
              <Button
                variant="secondary"
                className="gap-2"
                onClick={() => {
                  const e = activeEntity
                  setActiveEntity(null)
                  setSourceText('')
                  void autoFetchAndGenerate(e)
                }}
              >
                <DownloadSimple size={16} /> Auto-fetch & Generate
              </Button>
            )}
            <Button onClick={submitDialog} className="gap-2">
              <Sparkle size={16} /> Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
