import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Clock, Play, Trash2, Users, Building2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { EnterpriseDiscoverySession } from '@/lib/types'

const PAUSED_SESSIONS_KEY = 'id8-paused-enterprise-sessions'

interface PausedSessionsListProps {
  onResume: (session: EnterpriseDiscoverySession) => void
}

export function PausedSessionsList({ onResume }: PausedSessionsListProps) {
  const [pausedSessions, setPausedSessions] = useState<EnterpriseDiscoverySession[]>([])

  // Load paused sessions from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PAUSED_SESSIONS_KEY)
      if (stored) {
        const sessions = JSON.parse(stored) as EnterpriseDiscoverySession[]
        // Filter to only show paused (not completed) sessions
        const paused = sessions.filter(s => s.isPaused && !s.completedAt)
        setPausedSessions(paused)
      }
    } catch (error) {
      console.error('Failed to load paused sessions:', error)
    }
  }, [])

  const handleDelete = (sessionId: string) => {
    try {
      const updated = pausedSessions.filter(s => s.id !== sessionId)
      localStorage.setItem(PAUSED_SESSIONS_KEY, JSON.stringify(updated))
      setPausedSessions(updated)
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const handleResume = (session: EnterpriseDiscoverySession) => {
    // Mark as no longer paused
    const resumedSession: EnterpriseDiscoverySession = {
      ...session,
      isPaused: false,
      pausedAt: undefined,
    }
    
    // Remove from paused list
    const updated = pausedSessions.filter(s => s.id !== session.id)
    localStorage.setItem(PAUSED_SESSIONS_KEY, JSON.stringify(updated))
    setPausedSessions(updated)
    
    // Trigger resume callback
    onResume(resumedSession)
  }

  const getStageLabel = (stageId: number): string => {
    const labels: Record<number, string> = {
      0: 'Start',
      1: 'Opportunity',
      2: 'Resources',
      3: 'Decision Process',
      4: 'Prioritise',
      5: 'Solution Scope',
      6: 'Validate',
      7: 'Commit',
      8: 'Communicate',
    }
    return labels[stageId] || `Stage ${stageId}`
  }

  const getCompletedStagesCount = (session: EnterpriseDiscoverySession): number => {
    return Object.values(session.stages).filter(s => s.status === 'completed').length
  }

  if (pausedSessions.length === 0) {
    return null
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" />
          <CardTitle className="text-lg text-amber-800">Paused Enterprise Sessions</CardTitle>
        </div>
        <CardDescription>
          Resume your in-progress discovery sessions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pausedSessions.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium truncate">
                  {session.clientName || 'Unnamed Client'}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <Badge variant="outline" className="text-xs">
                  Stage {session.currentStageId}: {getStageLabel(session.currentStageId)}
                </Badge>
                <span className="text-xs">
                  {getCompletedStagesCount(session)}/9 completed
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {session.attendees && session.attendees.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {session.attendees.length}
                  </span>
                )}
                {session.pausedAt && (
                  <span>
                    Paused {formatDistanceToNow(session.pausedAt, { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 ml-3">
              <Button
                size="sm"
                onClick={() => handleResume(session)}
                className="gap-1 bg-[#0078D4] hover:bg-[#106EBE]"
              >
                <Play className="h-3 w-3" />
                Resume
              </Button>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Paused Session?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the paused session for{' '}
                      <strong>{session.clientName || 'Unnamed Client'}</strong>.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(session.id)}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
