import { lazy, Suspense, useMemo, useState } from 'react'
import type { BlueprintPathKind, BlueprintResult } from '@/lib/solution-blueprint/types'
import { toMermaid } from '@/lib/diagram/blueprint-to-mermaid'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Download, Copy, Code, FileText, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { LearnMorePopover } from './LearnMorePopover'

const MermaidDiagram = lazy(() =>
  import('./MermaidDiagram').then(m => ({ default: m.MermaidDiagram })),
)

const FlowDiagram = lazy(() =>
  import('./FlowDiagram').then(m => ({ default: m.FlowDiagram })),
)

interface BlueprintDiagramProps {
  result: BlueprintResult
  defaultPath?: BlueprintPathKind | 'side-by-side'
  /** Optional — used to persist Flow layout drags per use case. */
  useCaseId?: string
}

type ViewMode = BlueprintPathKind | 'side-by-side'
type Renderer = 'mermaid' | 'interactive'

function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function PathPanel({
  result,
  path,
  renderer,
  flowLayoutKey,
  onSvgReady,
}: {
  result: BlueprintResult
  path: BlueprintPathKind
  renderer: Renderer
  flowLayoutKey?: string
  onSvgReady?: (svg: string) => void
}) {
  const source = useMemo(() => toMermaid(result, path), [result, path])
  const blueprint = path === 'best-fit' ? result.bestFit : result.estateOptimized
  const [showSource, setShowSource] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={path === 'best-fit' ? 'default' : 'secondary'}>
          {path === 'best-fit' ? 'Path A — Best fit' : 'Path B — Estate-optimized'}
        </Badge>
        <Badge variant="outline">{Math.round(blueprint.reuseRatio * 100)}% reuse</Badge>
        <Badge variant="outline">{blueprint.gapCount} gap{blueprint.gapCount === 1 ? '' : 's'}</Badge>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(source)
              toast.success('Mermaid source copied')
            }}
          >
            <Copy className="mr-1 size-3.5" /> Source
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSource(s => !s)}>
            <Code className="mr-1 size-3.5" /> {showSource ? 'Hide' : 'Show'} code
          </Button>
        </div>
      </div>

      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        {renderer === 'mermaid' ? (
          <MermaidDiagram
            source={source}
            onRendered={svg => onSvgReady?.(svg.outerHTML)}
            className="rounded-md border bg-card p-3"
          />
        ) : (
          <FlowDiagram
            result={result}
            pathKind={path}
            flowLayoutKey={flowLayoutKey ? `${flowLayoutKey}:${path}` : undefined}
            className="rounded-md border bg-card"
          />
        )}
      </Suspense>

      <ComponentsLegend blueprint={blueprint} />

      {showSource && (
        <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs">
          <code>{source}</code>
        </pre>
      )}
    </div>
  )
}

function ComponentsLegend({ blueprint }: { blueprint: import('@/lib/solution-blueprint/types').Blueprint }) {
  const byLayer = useMemo(() => {
    const map = new Map<string, typeof blueprint.components>()
    for (const c of blueprint.components) {
      const arr = map.get(c.layer) ?? []
      arr.push(c)
      map.set(c.layer, arr)
    }
    return Array.from(map.entries())
  }, [blueprint])

  if (!blueprint.components.length) return null

  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium select-none">
        Components ({blueprint.components.length})
      </summary>
      <div className="mt-2 space-y-3">
        {byLayer.map(([layer, comps]) => (
          <div key={layer}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{layer}</div>
            <ul className="space-y-1">
              {comps.map(c => (
                <li key={c.capability} className="flex items-center gap-2">
                  <span className="flex-1">
                    <span className="font-medium">{c.capabilityName}</span>
                    {c.service && <span className="text-muted-foreground"> — {c.service.name}</span>}
                    {c.gap && <Badge variant="destructive" className="ml-2 text-[10px]">gap</Badge>}
                    {c.reused && <Badge variant="outline" className="ml-2 text-[10px]">reused</Badge>}
                    {c.kpiImpact && (
                      <Badge variant="outline" className="ml-2 text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                        {c.kpiImpact.deltaPct != null
                          ? `${c.kpiImpact.deltaPct > 0 ? '+' : ''}${c.kpiImpact.deltaPct}% ${c.kpiImpact.kpiId}`
                          : c.kpiImpact.kpiId}
                        {c.kpiImpact.timeToValueMonths != null && ` · ${c.kpiImpact.timeToValueMonths}mo`}
                      </Badge>
                    )}
                  </span>
                  {c.service && <LearnMorePopover query={`${c.service.name} Azure`} />}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}

export function BlueprintDiagram({ result, defaultPath = 'side-by-side', useCaseId }: BlueprintDiagramProps) {
  const [mode, setMode] = useState<ViewMode>(defaultPath)
  const [renderer, setRenderer] = useState<Renderer>('mermaid')
  const [svgA, setSvgA] = useState<string | null>(null)
  const [svgB, setSvgB] = useState<string | null>(null)

  const slug = result.useCase.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'blueprint'
  const flowLayoutKey = useCaseId ? `id8:flow-layout:${useCaseId}` : undefined

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={mode} onValueChange={v => setMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="best-fit">Path A</TabsTrigger>
              <TabsTrigger value="estate-optimized">Path B</TabsTrigger>
              <TabsTrigger value="side-by-side">Side-by-side</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={renderer} onValueChange={v => setRenderer(v as Renderer)}>
            <TabsList>
              <TabsTrigger value="mermaid">Mermaid</TabsTrigger>
              <TabsTrigger value="interactive">Interactive</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!svgA || renderer !== 'mermaid'}
            onClick={() => svgA && downloadSvg(svgA, `ID-8-${slug}-best-fit.svg`)}
          >
            <Download className="mr-1 size-3.5" /> Path A SVG
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!svgB || renderer !== 'mermaid'}
            onClick={() => svgB && downloadSvg(svgB, `ID-8-${slug}-estate-optimized.svg`)}
          >
            <Download className="mr-1 size-3.5" /> Path B SVG
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!svgA || renderer !== 'mermaid'}
            onClick={async () => {
              if (!svgA) return
              try {
                const { exportBlueprintToPDF } = await import('@/lib/diagram/blueprint-export')
                await exportBlueprintToPDF({ result, path: 'best-fit', svg: svgA, fileName: `ID-8-${slug}-best-fit.pdf` })
                toast.success('Path A PDF exported')
              } catch (e: any) {
                toast.error(`PDF export failed: ${e?.message ?? e}`)
              }
            }}
          >
            <FileText className="mr-1 size-3.5" /> Path A PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!svgB || renderer !== 'mermaid'}
            onClick={async () => {
              if (!svgB) return
              try {
                const { exportBlueprintToPDF } = await import('@/lib/diagram/blueprint-export')
                await exportBlueprintToPDF({ result, path: 'estate-optimized', svg: svgB, fileName: `ID-8-${slug}-estate-optimized.pdf` })
                toast.success('Path B PDF exported')
              } catch (e: any) {
                toast.error(`PDF export failed: ${e?.message ?? e}`)
              }
            }}
          >
            <FileText className="mr-1 size-3.5" /> Path B PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const { exportBlueprintToCsv } = await import('@/lib/diagram/blueprint-export')
              exportBlueprintToCsv(result, 'best-fit', `ID-8-${slug}-best-fit.csv`)
              exportBlueprintToCsv(result, 'estate-optimized', `ID-8-${slug}-estate-optimized.csv`)
              toast.success('Component CSVs exported')
            }}
          >
            <FileSpreadsheet className="mr-1 size-3.5" /> CSV
          </Button>
        </div>
      </div>

      <Tabs value={mode}>
        <TabsContent value="best-fit" className="mt-0">
          <PathPanel result={result} path="best-fit" renderer={renderer} flowLayoutKey={flowLayoutKey} onSvgReady={setSvgA} />
        </TabsContent>
        <TabsContent value="estate-optimized" className="mt-0">
          <PathPanel result={result} path="estate-optimized" renderer={renderer} flowLayoutKey={flowLayoutKey} onSvgReady={setSvgB} />
        </TabsContent>
        <TabsContent value="side-by-side" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            <PathPanel result={result} path="best-fit" renderer={renderer} flowLayoutKey={flowLayoutKey} onSvgReady={setSvgA} />
            <PathPanel result={result} path="estate-optimized" renderer={renderer} flowLayoutKey={flowLayoutKey} onSvgReady={setSvgB} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
