import { useLocalStorage } from './use-local-storage'
import { DiscoverySession } from '@/lib/types'
import { useCallback } from 'react'

function deduplicateSessions(sessions: DiscoverySession[]): DiscoverySession[] {
  return Array.from(new Map(sessions.map((session) => [session.id, session])).values())
}

export function useDiscovery() {
  const [sessions, setSessions] = useLocalStorage<DiscoverySession[]>('discovery-sessions', [])
  const uniqueSessions = deduplicateSessions(sessions || [])

  const addSession = useCallback((session: DiscoverySession) => {
    setSessions((currentSessions) => {
      const current = deduplicateSessions(currentSessions || [])
      const existingIndex = current.findIndex((item) => item.id === session.id)
      if (existingIndex === -1) return [...current, session]
      return current.map((item, index) => index === existingIndex ? { ...item, ...session } : item)
    })
  }, [setSessions])

  const updateSession = useCallback((sessionId: string, updates: Partial<DiscoverySession> | ((session: DiscoverySession) => Partial<DiscoverySession>)) => {
    setSessions((currentSessions) => deduplicateSessions(
      (currentSessions || []).map((session) => session.id === sessionId
        ? { ...session, ...(typeof updates === 'function' ? updates(session) : updates) } : session)
    ))
  }, [setSessions])

  const deleteSession = (sessionId: string) => {
    setSessions((currentSessions) => deduplicateSessions(
      (currentSessions || []).filter((session) => session.id !== sessionId)
    ))
  }

  const getSessionById = (sessionId: string): DiscoverySession | undefined => {
    return uniqueSessions.find((session) => session.id === sessionId)
  }

  const getLatestSession = (): DiscoverySession | undefined => {
    if (uniqueSessions.length === 0) return undefined
    return [...uniqueSessions].sort((a, b) => b.createdAt - a.createdAt)[0]
  }

  const clearSessions = () => {
    setSessions([])
  }

  return {
    sessions: uniqueSessions,
    addSession,
    updateSession,
    deleteSession,
    getSessionById,
    getLatestSession,
    clearSessions,
  }
}
