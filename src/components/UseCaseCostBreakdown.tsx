import { useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CurrencyDollar, Calculator, ArrowsClockwise, CaretDown, CaretUp } from '@phosphor-icons/react'
import type { UseCase } from '@/lib/types'
import { estimateRunCost, PRICING_VERSION } from '@/lib/cost-engine'

const REGION_OPTIONS = [
  { value: 'eastus', label: 'East US' },
  { value: 'westeurope', label: 'West Europe' },
  { value: 'northeurope', label: 'North Europe' },
  { value: 'uksouth', label: 'UK South' },
  { value: 'southafricanorth', label: 'South Africa North' },
  { value: 'southeastasia', label: 'Southeast Asia' },
]

interface UseCaseCostBreakdownProps {
  useCase: UseCase
  onUpdate?: (useCase: UseCase) => void
  /** When true, render compact (collapsed by default). */
  compact?: boolean
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function UseCaseCostBreakdown({ useCase, onUpdate, compact = false }: UseCaseCostBreakdownProps) {
  const [open, setOpen] = useState(!compact)
  const [users, setUsers] = useState<number>(useCase.runCost?.inputs?.activeUsers ?? 100)
  const [tx, setTx] = useState<number>(useCase.runCost?.inputs?.monthlyTransactions ?? 50_000)
  const [region, setRegion] = useState<string>(useCase.runCost?.inputs?.region ?? 'eastus')
  const [searchBackend, setSearchBackend] = useState<'azure-ai-search' | 'blob-hybrid'>(useCase.runCost?.inputs?.searchBackend ?? 'azure-ai-search')
  const [sharedPlatformId, setSharedPlatformId] = useState(useCase.runCost?.inputs?.sharedPlatformId ?? '')

  const live = useMemo(() => estimateRunCost(useCase, { activeUsers: users, monthlyTransactions: tx, region, searchBackend, sharedPlatformId: sharedPlatformId.trim() }), [useCase, users, tx, region, searchBackend, sharedPlatformId])
  const persisted = useCase.runCost
  const dirty = !persisted
    || persisted.inputs?.activeUsers !== users
    || persisted.inputs?.monthlyTransactions !== tx
    || persisted.inputs?.region !== region
    || (persisted.inputs?.searchBackend ?? 'azure-ai-search') !== searchBackend
    || (persisted.inputs?.sharedPlatformId ?? '') !== sharedPlatformId.trim()
    || persisted.pricingVersion !== PRICING_VERSION

  const save = () => {
    if (!onUpdate) return
    onUpdate({ ...useCase, runCost: live })
  }

  return (
    <Card className="border-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <CurrencyDollar size={18} weight="duotone" className="text-emerald-600" />
            <CardTitle className="text-base">Run-cost estimate (Azure + licenses)</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">pricing v{PRICING_VERSION}</Badge>
            <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse cost breakdown' : 'Expand cost breakdown'}>
              {open ? <CaretUp size={16} /> : <CaretDown size={16} />}
            </Button>
          </div>
        </div>
        {!open && (
          <CardDescription className="text-xs">
            {fmt(live.totalMonthlyUSD)}/mo · {fmt(live.totalAnnualUSD)}/yr · One-time {fmt(live.oneTimeImplementationUSD)}
          </CardDescription>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`users-${useCase.id}`} className="text-xs">Active users</Label>
              <Input id={`users-${useCase.id}`} type="number" value={users} min={1} onChange={(e) => setUsers(Math.max(1, Number(e.target.value) || 1))} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`tx-${useCase.id}`} className="text-xs">Monthly transactions</Label>
              <Input id={`tx-${useCase.id}`} type="number" value={tx} min={0} onChange={(e) => setTx(Math.max(0, Number(e.target.value) || 0))} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGION_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Knowledge retrieval, when required</Label>
              <Select value={searchBackend} onValueChange={(value) => setSearchBackend(value === 'blob-hybrid' ? 'blob-hybrid' : 'azure-ai-search')}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="azure-ai-search">Dedicated Azure AI Search</SelectItem>
                  <SelectItem value="blob-hybrid">Blob hybrid (small, low-traffic corpus)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`shared-${useCase.id}`} className="text-xs">Shared platform group (optional)</Label>
              <Input id={`shared-${useCase.id}`} value={sharedPlatformId} onChange={(event) => setSharedPlatformId(event.target.value)} placeholder="Same group only for workloads sharing one platform" className="h-8" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Planning estimate, not actual billing. Matching platform groups share fixed Search capacity in portfolio totals; unrelated workloads remain separate. Re-save older estimates to apply the new cost model.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
            <div className="rounded border bg-muted/30 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Compute</div>
              <div className="text-sm font-semibold">{fmt(live.monthlyComputeUSD)}<span className="text-xs text-muted-foreground">/mo</span></div>
            </div>
            <div className="rounded border bg-muted/30 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Licenses</div>
              <div className="text-sm font-semibold">{fmt(live.monthlyLicenseUSD)}<span className="text-xs text-muted-foreground">/mo</span></div>
            </div>
            <div className="rounded border bg-muted/30 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Data</div>
              <div className="text-sm font-semibold">{fmt(live.monthlyDataUSD)}<span className="text-xs text-muted-foreground">/mo</span></div>
            </div>
            <div className="rounded border bg-emerald-500/10 border-emerald-500/30 p-2">
              <div className="text-[10px] uppercase text-emerald-700">Total</div>
              <div className="text-sm font-semibold text-emerald-700">{fmt(live.totalMonthlyUSD)}<span className="text-xs">/mo</span></div>
              <div className="text-[10px] text-emerald-700">{fmt(live.totalAnnualUSD)}/yr</div>
            </div>
          </div>

          <div className="rounded border bg-amber-500/5 border-amber-500/30 p-2 text-xs">
            <span className="text-muted-foreground">One-time implementation: </span>
            <span className="font-semibold text-amber-700">{fmt(live.oneTimeImplementationUSD)}</span>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Calculator size={12} /> Assumptions ({live.assumptions.length})
            </summary>
            <ul className="mt-1 space-y-0.5 text-muted-foreground pl-4 list-disc">
              {live.assumptions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </details>

          {onUpdate && dirty && (
            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={save} className="h-7 text-xs">
                <ArrowsClockwise size={12} className="mr-1" /> Save estimate
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
