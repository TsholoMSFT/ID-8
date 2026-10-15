/**
 * RegulatoryAwarenessPanel
 *
 * Reusable component that fetches and displays recent regulatory enforcement
 * actions, violations, and news relevant to a use case's domain + jurisdictions.
 *
 * Uses the regulatory-feeds Azure Function (which reads from the
 * id8-regulatory-monitor Logic App blob cache, with Google News fallback).
 */

import { useState, useEffect, useCallback } from 'react'
import type { RegulatoryNewsItem, ViolationCase } from '@/lib/types'
import { fetchRegulatoryNews, findSimilarViolations } from '@/lib/regulatory-news-service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Newspaper,
  Warning,
  ArrowSquareOut,
  CaretDown,
  CaretUp,
  ArrowClockwise,
  ShieldWarning,
} from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { InlineDisclaimer } from '@/components/Disclaimer'

// ── Types ────────────────────────────────────────────────────────────

interface RegulatoryAwarenessPanelProps {
  /** Use case title + description for similarity matching */
  useCaseTitle: string
  useCaseDescription: string
  /** Jurisdictions to scope news results */
  jurisdictions: string[]
  /** Industry for additional filtering */
  industry?: string
  /** Compact mode for embedding in cards vs. full panel */
  compact?: boolean
  /** Maximum items to show */
  maxItems?: number
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

// ── Severity helpers ─────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  major: {
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    badge: 'destructive' as const,
    icon: '🔴',
  },
  moderate: {
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'secondary' as const,
    icon: '🟡',
  },
  minor: {
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'outline' as const,
    icon: '🔵',
  },
}

// ── Component ────────────────────────────────────────────────────────

export function RegulatoryAwarenessPanel({
  useCaseTitle,
  useCaseDescription,
  jurisdictions,
  industry,
  compact = false,
  maxItems = 5,
}: RegulatoryAwarenessPanelProps) {
  const [newsItems, setNewsItems] = useState<RegulatoryNewsItem[]>([])
  const [violations, setViolations] = useState<ViolationCase[]>([])
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [expanded, setExpanded] = useState(!compact)

  const fetchData = useCallback(async () => {
    setLoadState('loading')
    try {
      // Fetch news and violations in parallel
      const query = `${useCaseTitle} ${useCaseDescription}`.slice(0, 200)
      const [newsResult, violationResult] = await Promise.allSettled([
        fetchRegulatoryNews(jurisdictions, industry, query),
        findSimilarViolations(
          { title: useCaseTitle, description: useCaseDescription } as any,
          jurisdictions
        ),
      ])

      if (newsResult.status === 'fulfilled') {
        setNewsItems(newsResult.value.slice(0, maxItems))
      }
      if (violationResult.status === 'fulfilled') {
        setViolations(violationResult.value.slice(0, maxItems))
      }

      setLoadState('loaded')
    } catch (err) {
      console.error('RegulatoryAwarenessPanel: fetch error', err)
      setLoadState('error')
    }
  }, [useCaseTitle, useCaseDescription, jurisdictions, industry, maxItems])

  // Auto-fetch on mount
  useEffect(() => {
    fetchData()
  }, [fetchData])

  const hasContent = newsItems.length > 0 || violations.length > 0
  const totalItems = newsItems.length + violations.length

  // ── Compact mode: Just a badge + collapsible ────────────────────
  if (compact) {
    return (
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-xs hover:underline text-muted-foreground">
            <Newspaper size={14} />
            <span>
              {loadState === 'loading'
                ? 'Checking regulatory news...'
                : loadState === 'error'
                ? 'News unavailable'
                : hasContent
                ? `${totalItems} regulatory item${totalItems !== 1 ? 's' : ''}`
                : 'No recent regulatory items'}
            </span>
            {expanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-2">
            {violations.map((v) => (
              <CompactViolationItem key={v.id} violation={v} />
            ))}
            {newsItems.map((n) => (
              <CompactNewsItem key={n.id} item={n} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  // ── Full mode ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldWarning size={18} weight="duotone" className="text-amber-600" />
          <h4 className="text-sm font-semibold">Regulatory Awareness</h4>
          {hasContent && (
            <Badge variant="secondary" className="text-[10px]">
              {totalItems} item{totalItems !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchData}
          disabled={loadState === 'loading'}
          className="gap-1 text-xs"
        >
          <ArrowClockwise
            size={14}
            className={loadState === 'loading' ? 'animate-spin' : ''}
          />
          Refresh
        </Button>
      </div>

      {loadState === 'loading' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <ArrowClockwise size={14} className="animate-spin" />
          Fetching regulatory news and enforcement cases...
        </div>
      )}

      {loadState === 'error' && (
        <div className="flex items-center gap-2 text-xs text-amber-600 py-2">
          <Warning size={14} />
          Could not fetch regulatory news. The compliance assessment is still valid without live news.
        </div>
      )}

      {loadState === 'loaded' && !hasContent && (
        <p className="text-xs text-muted-foreground italic py-2">
          No recent regulatory enforcement actions or news found for this use case context.
        </p>
      )}

      <AnimatePresence>
        {/* Violations (AI-ranked) */}
        {violations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Similar Enforcement Cases
              </h5>
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2 pr-2">
                  {violations.map((v) => (
                    <ViolationCard key={v.id} violation={v} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </motion.div>
        )}

        {violations.length > 0 && newsItems.length > 0 && <Separator />}

        {/* News items */}
        {newsItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent Regulatory News
              </h5>
              <div className="space-y-2">
                {newsItems.map((n) => (
                  <NewsCard key={n.id} item={n} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <InlineDisclaimer
        text="Regulatory information is for awareness only and may not be current. Consult qualified legal professionals for compliance decisions."
        icon="legal"
        className="mt-3"
      />
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────

function ViolationCard({ violation }: { violation: ViolationCase }) {
  const cfg = SEVERITY_CONFIG[violation.severity]
  return (
    <div className={`rounded-lg border p-3 ${cfg.bg} ${cfg.border} space-y-1.5`}>
      <div className="flex items-start gap-2">
        <span>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h6 className={`text-xs font-semibold ${cfg.color} truncate`}>
              {violation.headline}
            </h6>
            {violation.sourceUrl && (
              <a
                href={violation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline flex-shrink-0"
                title="View source"
              >
                <ArrowSquareOut size={12} />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
            <span>{violation.jurisdiction}</span>
            <span>·</span>
            <span>{violation.framework}</span>
            {violation.penaltyAmount && (
              <>
                <span>·</span>
                <span className="font-medium text-red-600 dark:text-red-400">
                  {violation.penaltyAmount}
                </span>
              </>
            )}
            <span>·</span>
            <span>{violation.date}</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{violation.relevanceSummary}</p>
      {violation.lessonsLearned && (
        <p className="text-[11px] italic text-muted-foreground">
          💡 {violation.lessonsLearned}
        </p>
      )}
    </div>
  )
}

function NewsCard({ item }: { item: RegulatoryNewsItem }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border p-3 bg-muted/20">
      <Newspaper size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h6 className="text-xs font-medium truncate">{item.title}</h6>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline flex-shrink-0"
              title="View article"
            >
              <ArrowSquareOut size={12} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
          <span>{item.source}</span>
          <span>·</span>
          <span>{item.jurisdiction}</span>
          <span>·</span>
          <span>{item.publishedDate}</span>
        </div>
        {item.description && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
    </div>
  )
}

function CompactViolationItem({ violation }: { violation: ViolationCase }) {
  const cfg = SEVERITY_CONFIG[violation.severity]
  return (
    <div className={`flex items-center gap-2 text-[11px] rounded px-2 py-1 ${cfg.bg} ${cfg.border} border`}>
      <span>{cfg.icon}</span>
      <span className="truncate flex-1">{violation.headline}</span>
      {violation.sourceUrl && (
        <a href={violation.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500" title="Source">
          <ArrowSquareOut size={10} />
        </a>
      )}
    </div>
  )
}

function CompactNewsItem({ item }: { item: RegulatoryNewsItem }) {
  return (
    <div className="flex items-center gap-2 text-[11px] rounded px-2 py-1 bg-muted/20 border">
      <Newspaper size={10} className="text-muted-foreground flex-shrink-0" />
      <span className="truncate flex-1">{item.title}</span>
      {item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-500" title="Article">
          <ArrowSquareOut size={10} />
        </a>
      )}
    </div>
  )
}
