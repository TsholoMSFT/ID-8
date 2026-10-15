/**
 * BlueprintCopilotRail
 * ----------------------------------------------------------------------------
 * Sticky right-rail AI assistant that watches workspace state and proposes
 * the next best action. The rail itself is presentational — actual state
 * mutations happen in the parent (SolutionBlueprintWorkspace) via the
 * onAction callback.
 *
 * Modes:
 *   - 'off':       hidden
 *   - 'suggest':   shows suggestions, intern clicks to run (default)
 *   - 'autopilot': auto-runs every suggestion flagged safeToAutorun
 */

import { useEffect, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sparkle, Robot, ChartLineUp, ArrowRight } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import {
  nextSuggestions,
  getLedger,
  type CopilotState,
  type CopilotSuggestion,
  type BlueprintAIMode,
} from '@/lib/blueprint-copilot-service'

interface Props {
  state: CopilotState
  mode: BlueprintAIMode
  onModeChange: (m: BlueprintAIMode) => void
  /** Run an action — parent owns actual state mutations. */
  onAction: (s: CopilotSuggestion) => void | Promise<void>
  /** True when an action is currently executing (parent-tracked). */
  isRunning?: boolean
  /** Last activity message to surface (e.g., "Generated 3 use cases"). */
  lastActivity?: string | null
}

export function BlueprintCopilotRail({
  state,
  mode,
  onModeChange,
  onAction,
  isRunning,
  lastActivity,
}: Props) {
  const suggestions = useMemo(() => nextSuggestions(state), [state])
  const ledger = state.customerId ? getLedger(state.customerId) : null

  // Autopilot: auto-fire safe suggestions, one at a time, with an autorun flag
  // to avoid re-firing in a loop. Only triggers when not already running and
  // no recent activity for the same suggestion id.
  const autorunSeenRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    autorunSeenRef.current.clear()
  }, [state.customerId])
  useEffect(() => {
    if (mode !== 'autopilot' || isRunning) return
    const next = suggestions.find((s) => s.safeToAutorun && !autorunSeenRef.current.has(s.id))
    if (!next) return
    autorunSeenRef.current.add(next.id)
    void onAction(next)
  }, [mode, suggestions, isRunning, onAction])

  if (mode === 'off') return null

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent sticky top-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="rounded-md bg-primary/10 p-1.5 text-primary">
                <Robot size={16} weight="duotone" />
              </span>
              Blueprint Copilot
            </CardTitle>
            <CardDescription className="text-[12px] mt-0.5">
              Suggests the next best step and can run it for you. Powered by routed AI models.
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Select value={mode} onValueChange={(v) => onModeChange(v as BlueprintAIMode)}>
            <SelectTrigger className="h-7 text-[11px] w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="suggest">Suggest</SelectItem>
              <SelectItem value="autopilot">Autopilot</SelectItem>
            </SelectContent>
          </Select>
          {ledger && (
            <Badge variant="outline" className="gap-1 text-[10px] font-normal">
              <ChartLineUp size={10} /> {ledger.totalTokens.toLocaleString()} provider tokens
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Daily and per-minute quotas are enforced by the server.</p>
      </CardHeader>

      <CardContent className="space-y-2">
        {!state.customerId && (
          <div className="text-[12px] text-muted-foreground">Pick a customer to get suggestions.</div>
        )}

        {isRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-md border bg-background/60 p-2 text-[11px] flex items-center gap-2"
          >
            <span className="size-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-muted-foreground">Working…</span>
          </motion.div>
        )}

        {lastActivity && !isRunning && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800">
            <Sparkle size={11} weight="fill" className="inline mr-1" /> {lastActivity}
          </div>
        )}

        {state.customerId && suggestions.length === 0 && !isRunning && (
          <div className="rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
            All caught up. Refine a use case or generate the executive brief from the Mutual commitments tab.
          </div>
        )}

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-2 pr-1">
            {suggestions.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-lg border bg-background p-2.5 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[12px] font-medium leading-snug">{s.title}</div>
                  <Badge variant="outline" className="text-[10px] font-normal flex-shrink-0">
                    {s.estCostCents === 0 ? 'No inference' : 'Metered AI'}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{s.detail}</div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={s.action === 'pull-iq' ? 'default' : 'secondary'}
                    onClick={() => onAction(s)}
                    disabled={isRunning}
                    className="h-6 text-[11px] gap-1"
                  >
                    {mode === 'autopilot' && s.safeToAutorun ? 'Auto' : 'Run'} <ArrowRight size={10} />
                  </Button>
                  <span className="text-[10px] text-muted-foreground">→ {labelForTab(s.tab)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>

        {ledger && ledger.callCount > 0 && (
          <details className="text-[10px] text-muted-foreground pt-1">
            <summary className="cursor-pointer hover:text-foreground">Provider usage ({ledger.callCount} calls, {ledger.cachedCalls} cached)</summary>
            <ul className="mt-1 space-y-0.5">
              {Object.entries(ledger.byModel).map(([m, v]) => (
                <li key={m} className="flex justify-between">
                  <span>{m}</span>
                  <span>{v.tokens.toLocaleString()} tokens ({v.calls})</span>
                </li>
              ))}
            </ul>
            {ledger.unknownUsageCalls > 0 && <p>Usage was not returned for {ledger.unknownUsageCalls} calls; no dollar estimate is inferred.</p>}
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function labelForTab(t: CopilotSuggestion['tab']): string {
  switch (t) {
    case 'connect-data':
      return 'Connect data'
    case 'use-cases':
      return 'Use cases'
    case 'blueprints':
      return 'Blueprints'
    case 'commitments':
      return 'Mutual commitments'
    case 'estate':
      return 'Technology estate'
  }
}
