/**
 * MVP 5-Stage Enterprise Discovery Orchestrator
 * 
 * Consolidates the original 9-stage workflow into 5 streamlined stages:
 * - Stage 0: START (unchanged)
 * - Stage 1: OPPORTUNITY & RESOURCES (merged Stage 1 + 2)
 * - Stage 2: DECISION PROCESS (expanded Stage 3 with stakeholder mapping)
 * - Stage 3: SOLUTION SCOPE (collapsed Stage 5 sub-steps)
 * - Stage 4: COMMIT & COMMUNICATE (merged Stage 7 + 8)
 * 
 * Features:
 * - Auto-migration from legacy 9-stage sessions
 * - Progressive disclosure based on discovery type
 * - AI-assisted features (stakeholder suggestions, RICE, executive summary)
 * - Tab completion tracking with skip functionality
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Settings, Sparkles } from 'lucide-react'
import { StageNavigatorMVP } from './StageNavigatorMVP'
import { YellowLightsDashboard } from './YellowLightsDashboard'
import { SessionControlBar } from './SessionControlBar'
import { DiscoverySettingsDialog } from '@/components/DiscoverySettingsDialog'
import { Stage0Start } from './stages/Stage0Start'
import { Stage1OpportunityResources } from './stages/Stage1OpportunityResources'
import { Stage2DecisionProcess } from './stages/Stage2DecisionProcess'
import { Stage3SolutionScopeCollapsed } from './stages/Stage3SolutionScopeCollapsed'
import { Stage4CommitCommunicate } from './stages/Stage4CommitCommunicate'
import { exportEnterpriseDiscoveryToPDF } from '@/lib/enterprise-pdf-export'
import type { 
  EnterpriseDiscoverySession, 
  EnterpriseDiscoverySessionMVP, 
  StageStatus,
} from '@/lib/types'
import { migrateToMVPSession, isMVPSession } from '@/lib/types'
import { toast } from 'sonner'

const PAUSED_SESSIONS_KEY = 'id8-paused-enterprise-sessions-mvp'

// MVP Stage names
const MVP_STAGE_NAMES: Record<number, string> = {
  0: 'START',
  1: 'OPPORTUNITY & RESOURCES',
  2: 'DECISION PROCESS',
  3: 'SOLUTION SCOPE',
  4: 'COMMIT & COMMUNICATE',
}

interface EnterpriseDiscoveryOrchestratorMVPProps {
  initialSession?: EnterpriseDiscoverySession | EnterpriseDiscoverySessionMVP
  initialCustomerName?: string
  onSave: (session: EnterpriseDiscoverySessionMVP) => void
  onComplete: (session: EnterpriseDiscoverySessionMVP) => void
  onCancel: () => void
  onPause?: (session: EnterpriseDiscoverySessionMVP) => void
}

// Create empty MVP session
function createEmptyMVPSession(): EnterpriseDiscoverySessionMVP {
  return {
    id: `ent-mvp-${Date.now()}`,
    version: 'mvp-5-stage',
    clientName: '',
    attendees: [],
    sessionDate: Date.now(),
    discoveryType: 'new-opportunity',
    currentStageId: 0,
    stages: {
      0: { status: 'in-progress', data: null },
      1: { status: 'not-started', data: null },
      2: { status: 'not-started', data: null },
      3: { status: 'not-started', data: null },
      4: { status: 'not-started', data: null },
    },
    allYellowLights: [],
    isLiveMode: false,
    createdAt: Date.now(),
  }
}

export function EnterpriseDiscoveryOrchestratorMVP({
  initialSession,
  initialCustomerName,
  onSave,
  onComplete,
  onCancel,
  onPause,
}: EnterpriseDiscoveryOrchestratorMVPProps) {
  // Migrate legacy session on load
  const [session, setSession] = useState<EnterpriseDiscoverySessionMVP>(() => {
    if (!initialSession) {
      return createEmptyMVPSession()
    }
    
    // Check if already MVP format
    if (isMVPSession(initialSession)) {
      return initialSession as EnterpriseDiscoverySessionMVP
    }
    
    // Migrate from legacy 9-stage format
    console.log('Migrating legacy session to MVP format')
    toast.info('Session migrated to new 5-stage format', {
      description: 'Your data has been preserved in the streamlined workflow',
    })
    return migrateToMVPSession(initialSession as EnterpriseDiscoverySession)
  })
  
  const [lastSaved, setLastSaved] = useState<number | undefined>(session.lastSavedAt)
  const [isLiveMode, setIsLiveMode] = useState(session.isLiveMode || false)
  const [showSettings, setShowSettings] = useState(false)

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const updatedSession = { ...session, lastSavedAt: Date.now(), isLiveMode }
      onSave(updatedSession)
      setLastSaved(Date.now())
    }, 30000)
    return () => clearInterval(interval)
  }, [session, onSave, isLiveMode])

  // Save session to localStorage for pause/resume
  const saveToLocalStorage = useCallback((sessionToSave: EnterpriseDiscoverySessionMVP) => {
    try {
      const pausedSessions = JSON.parse(localStorage.getItem(PAUSED_SESSIONS_KEY) || '[]')
      const existingIndex = pausedSessions.findIndex((s: EnterpriseDiscoverySessionMVP) => s.id === sessionToSave.id)
      if (existingIndex >= 0) {
        pausedSessions[existingIndex] = sessionToSave
      } else {
        pausedSessions.push(sessionToSave)
      }
      localStorage.setItem(PAUSED_SESSIONS_KEY, JSON.stringify(pausedSessions))
    } catch (error) {
      console.error('Failed to save session to localStorage:', error)
    }
  }, [])

  // Handle pause session
  const handlePauseSession = useCallback(() => {
    const pausedSession: EnterpriseDiscoverySessionMVP = {
      ...session,
      isPaused: true,
      pausedAt: Date.now(),
      lastSavedAt: Date.now(),
      isLiveMode,
    }
    saveToLocalStorage(pausedSession)
    onSave(pausedSession)
    if (onPause) {
      onPause(pausedSession)
    } else {
      onCancel()
    }
  }, [session, isLiveMode, saveToLocalStorage, onSave, onPause, onCancel])

  // Handle end session with PDF export
  const handleEndSession = useCallback(async () => {
    const completedSession: EnterpriseDiscoverySessionMVP = {
      ...session,
      completedAt: Date.now(),
      lastSavedAt: Date.now(),
      isLiveMode,
    }
    
    // Export PDF (may need conversion for legacy export function)
    try {
      // For now, we'll use the existing export which may need adjustment
      // @ts-ignore - temporary compatibility
      const fileName = await exportEnterpriseDiscoveryToPDF(completedSession)
      toast.success('Discovery session completed!', {
        description: `PDF exported as ${fileName}`,
      })
    } catch (error) {
      console.error('Failed to export PDF:', error)
      toast.error('Failed to export PDF', {
        description: 'Session data was saved but PDF export failed.',
      })
    }
    
    onComplete(completedSession)
  }, [session, isLiveMode, onComplete])

  // Handle PDF export
  const handleExportPDF = useCallback(async () => {
    try {
      // @ts-ignore - temporary compatibility
      const fileName = await exportEnterpriseDiscoveryToPDF(session)
      toast.success('PDF exported successfully', {
        description: fileName,
      })
    } catch (error) {
      console.error('Failed to export PDF:', error)
      toast.error('Failed to export PDF')
    }
  }, [session])

  // Toggle live mode
  const handleToggleLiveMode = useCallback(() => {
    setIsLiveMode(prev => !prev)
    toast.info(isLiveMode ? 'Voice input disabled' : 'Voice input enabled', {
      description: isLiveMode ? 'Switched to keyboard input' : 'You can now speak your responses',
    })
  }, [isLiveMode])

  // Build stages array for navigator
  const stages = Object.entries(session.stages).map(([id, stage]) => ({
    id: Number(id),
    name: MVP_STAGE_NAMES[Number(id)] || `Stage ${id}`,
    status: stage.status,
  }))

  const currentStage = session.currentStageId
  const criticalYellowLights = session.allYellowLights.filter(
    (l) => !l.resolved && (l.severity === 'serious' || l.severity === 'deal-breaker')
  )

  const handleStageComplete = (stageId: number, data: any) => {
    const updated = { ...session }
    updated.stages[stageId as keyof typeof updated.stages] = {
      status: 'completed' as StageStatus,
      completedAt: Date.now(),
      data,
    }

    // Move to next stage if not at the end (Stage 4 is final)
    if (stageId < 4) {
      updated.currentStageId = stageId + 1
      updated.stages[(stageId + 1) as keyof typeof updated.stages].status = 'in-progress'
    } else {
      // Completed all stages
      updated.completedAt = Date.now()
      toast.success('Strategic Assessment Completed!')
      onComplete(updated)
      return
    }

    setSession(updated)
    onSave(updated)
    toast.success(`${MVP_STAGE_NAMES[stageId]} completed`)
  }

  const handleStageBack = (targetStageId: number) => {
    const updated = { ...session }
    updated.currentStageId = targetStageId
    updated.stages[targetStageId as keyof typeof updated.stages].status = 'in-progress'
    setSession(updated)
  }

  const handleResolveYellowLight = (id: string) => {
    const updated = { ...session }
    const light = updated.allYellowLights.find((l) => l.id === id)
    if (light) {
      light.resolved = true
      setSession(updated)
      onSave(updated)
      toast.success('Yellow light resolved')
    }
  }

  const handleStage0Complete = (data: any) => {
    const updated = { ...session }
    updated.clientName = data.clientName
    updated.attendees = data.attendees
    updated.sessionDate = data.sessionDate
    updated.discoveryType = data.discoveryType
    handleStageComplete(0, null)
  }

  const renderStage = () => {
    switch (currentStage) {
      case 0:
        return (
          <Stage0Start
            initialData={{
              clientName: session.clientName,
              attendees: session.attendees,
              sessionDate: session.sessionDate,
              discoveryType: session.discoveryType,
            }}
            initialCustomerName={initialCustomerName}
            onComplete={handleStage0Complete}
            onBack={onCancel}
            isLiveMode={isLiveMode}
          />
        )
      case 1:
        return (
          <Stage1OpportunityResources
            initialData={session.stages[1].data ?? undefined}
            discoveryType={session.discoveryType}
            onComplete={(data) => handleStageComplete(1, data)}
            onBack={() => handleStageBack(0)}
            isLiveMode={isLiveMode}
          />
        )
      case 2:
        return (
          <Stage2DecisionProcess
            initialData={session.stages[2].data ?? undefined}
            previousStageData={session.stages[1].data ?? undefined}
            onComplete={(data) => handleStageComplete(2, data)}
            onBack={() => handleStageBack(1)}
            isLiveMode={isLiveMode}
          />
        )
      case 3:
        return (
          <Stage3SolutionScopeCollapsed
            initialData={session.stages[3].data ?? undefined}
            previousStageData={session.stages[1].data ?? undefined}
            onComplete={(data) => handleStageComplete(3, data)}
            onBack={() => handleStageBack(2)}
            isLiveMode={isLiveMode}
          />
        )
      case 4:
        return (
          <Stage4CommitCommunicate
            initialData={session.stages[4].data ?? undefined}
            solutionScopeData={session.stages[3].data ?? undefined}
            opportunityResourcesData={session.stages[1].data ?? undefined}
            onComplete={(data) => handleStageComplete(4, data)}
            onBack={() => handleStageBack(3)}
            isLiveMode={isLiveMode}
            clientName={session.clientName}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-[#0078D4]">Strategic Assessment</h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              <Sparkles className="h-3 w-3" />
              MVP
            </span>
          </div>
          {session.clientName && (
            <p className="text-muted-foreground mt-1">
              {session.clientName} • {session.discoveryType.replace('-', ' ')}
            </p>
          )}
        </div>
        
        {/* Session Control Bar */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <SessionControlBar
            sessionId={session.id}
            clientName={session.clientName}
            currentStage={currentStage}
            isLiveMode={isLiveMode}
            onToggleLiveMode={handleToggleLiveMode}
            onPauseSession={handlePauseSession}
            onEndSession={handleEndSession}
            onExportPDF={handleExportPDF}
            lastSaved={lastSaved}
          />
        </div>
      </div>

      {/* Settings Dialog */}
      <DiscoverySettingsDialog open={showSettings} onOpenChange={setShowSettings} />

      {/* Stage Navigator (MVP 5-stage) */}
      <StageNavigatorMVP
        stages={stages}
        currentStageId={currentStage}
        onStageClick={(id) => {
          if (id <= currentStage || stages[id].status === 'completed') {
            handleStageBack(id)
          }
        }}
      />

      {/* Yellow Lights advisory (non-blocking — never gates progression or completion) */}
      {criticalYellowLights.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {criticalYellowLights.length} open concern{criticalYellowLights.length > 1 ? 's' : ''} flagged for review.
            These are advisory only and do not block completing the assessment.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3">{renderStage()}</div>

        {/* Sidebar - Yellow Lights */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <YellowLightsDashboard
              yellowLights={session.allYellowLights}
              onResolve={handleResolveYellowLight}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  )
}
