/**
 * BackendStatusBadge
 * ----------------------------------------------------------------------------
 * Polls configuration without inference while the page is visible.
 *   • online   — green dot
 *   • degraded — amber dot (HTTP 200 but body reports issues)
 *   • offline  — red dot, fires a one-shot toast on transition online→offline
 *
 * Click to force a re-check.
 */

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { getAIReadiness, type AIReadiness } from '@/lib/openai-service'

type Status = 'unknown' | 'online' | 'degraded' | 'offline'

const POLL_MS = 15 * 60_000

function apiBase(): string {
  return (window as any).__API_BASE__ || ''
}

export function BackendStatusBadge() {
  const [status, setStatus] = useState<Status>('unknown')
  const [aiReadiness, setAIReadiness] = useState<AIReadiness | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const prev = useRef<Status>('unknown')

  const check = async (testAI = false) => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(`${apiBase()}/api/health`, { signal: ctrl.signal })
      clearTimeout(t)
      if (!res.ok) {
        setStatus('offline')
        setAIReadiness(null)
      } else {
        const body = await res.json().catch(() => ({}))
        const ok = body?.status === 'healthy' || body?.ok === true || body?.status === 'ok'
        const degraded = body?.status === 'degraded' || (Array.isArray(body?.issues) && body.issues.length > 0)
        setStatus(degraded ? 'degraded' : ok ? 'online' : 'online')
        try {
          const readiness = await getAIReadiness(testAI)
          setAIReadiness(readiness)
          if (readiness.status === 'unavailable') setStatus('degraded')
        } catch {
          setAIReadiness(null)
          setStatus('degraded')
        }
      }
    } catch {
      setStatus('offline')
      setAIReadiness(null)
    } finally {
      setLastChecked(new Date())
    }
  }

  useEffect(() => {
    void check()
    const poll = () => { if (!document.hidden) void check() }
    const id = setInterval(poll, POLL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [])

  useEffect(() => {
    if (prev.current === 'online' && status === 'offline') {
      toast.warning('Karabo backend is unreachable — running in offline mode')
    }
    if (prev.current === 'offline' && status === 'online') {
      toast.success('Karabo backend reconnected')
    }
    prev.current = status
  }, [status])

  const dot = status === 'online' ? 'bg-emerald-500'
    : status === 'degraded' ? 'bg-amber-500'
    : status === 'offline' ? 'bg-rose-500'
    : 'bg-muted-foreground'

  const label = status === 'online' ? 'Online'
    : status === 'degraded' && aiReadiness?.status === 'unavailable' ? 'AI unavailable'
    : status === 'degraded' ? 'Degraded'
    : status === 'offline' ? 'Offline'
    : 'Checking…'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void check(true)}
            aria-label={`Backend status: ${label}. Click to test the AI connection.`}
            className="inline-flex"
          >
            <Badge variant="outline" className="gap-1.5 cursor-pointer text-[10px] py-0 h-5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
              {label}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-[11px] space-y-0.5">
            <div>Backend: <strong>{label}</strong></div>
            {status !== 'offline' && (
              <div>AI: <strong>{aiReadiness?.status === 'ready' ? 'Test passed' : aiReadiness?.status === 'configured' ? 'Configured (not tested)' : 'Unavailable'}</strong></div>
            )}
            {aiReadiness?.code && <div className="text-muted-foreground">{aiReadiness.code}</div>}
            {lastChecked && <div>Last check: {lastChecked.toLocaleTimeString()}</div>}
            <div className="text-muted-foreground">Checks configuration every 15 minutes while visible</div>
            <div className="text-muted-foreground">Click to run a small, metered AI connection test</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
