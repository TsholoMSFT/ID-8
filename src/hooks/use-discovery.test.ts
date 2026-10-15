import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DiscoverySession } from '@/lib/types'
import { useDiscovery } from './use-discovery'

const session: DiscoverySession = {
  id: 'discovery-1',
  customerId: 'customer-1',
  customerName: 'ABSA',
  name: 'ABSA Discovery',
  innovationHubLocation: 'Johannesburg, South Africa',
  solutionEngineer: 'Sam Patel',
  accountTeamRep: 'Alex Morgan',
  primaryStakeholder: 'Naledi Khumalo',
  responses: [],
  createdAt: 1,
}

describe('useDiscovery session identity', () => {
  beforeEach(() => {
    localStorage.removeItem('discovery-sessions')
  })

  it('exposes one session when persisted data contains a duplicate ID', () => {
    localStorage.setItem('discovery-sessions', JSON.stringify([
      session,
      { ...session, name: 'Updated ABSA Discovery' },
    ]))

    const { result } = renderHook(() => useDiscovery())

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].name).toBe('Updated ABSA Discovery')
  })

  it('upserts repeated additions and persists a single session', () => {
    const { result } = renderHook(() => useDiscovery())

    act(() => result.current.addSession(session))
    act(() => result.current.addSession({ ...session, name: 'Updated ABSA Discovery' }))

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].name).toBe('Updated ABSA Discovery')
    expect(JSON.parse(localStorage.getItem('discovery-sessions') || '[]')).toHaveLength(1)
  })

  it('synchronizes session changes between hook instances in the same tab', () => {
    const first = renderHook(() => useDiscovery())
    const second = renderHook(() => useDiscovery())

    act(() => first.result.current.addSession(session))

    expect(second.result.current.sessions).toHaveLength(1)

    act(() => second.result.current.deleteSession(session.id))

    expect(first.result.current.sessions).toHaveLength(0)
  })

  it('normalizes legacy duplicate IDs when deleting another session', () => {
    localStorage.setItem('discovery-sessions', JSON.stringify([
      session,
      { ...session, name: 'Updated ABSA Discovery' },
      { ...session, id: 'discovery-2', name: 'Temporary Discovery' },
    ]))
    const { result } = renderHook(() => useDiscovery())

    act(() => result.current.deleteSession('discovery-2'))

    expect(JSON.parse(localStorage.getItem('discovery-sessions') || '[]')).toEqual([
      expect.objectContaining({ id: session.id, name: 'Updated ABSA Discovery' }),
    ])
  })

  it('keeps research persistence callbacks stable when session data changes', () => {
    const { result } = renderHook(() => useDiscovery())
    const add = result.current.addSession
    const update = result.current.updateSession
    act(() => add(session))
    act(() => update(session.id, { companyResearchSummary: 'Saved evidence' }))
    expect(result.current.addSession).toBe(add)
    expect(result.current.updateSession).toBe(update)
    expect(result.current.sessions[0].companyResearchSummary).toBe('Saved evidence')
  })

  it('applies concurrent research updates against the latest owning session', () => {
    const { result } = renderHook(() => useDiscovery())
    act(() => result.current.addSession(session))
    act(() => {
      result.current.updateSession(session.id, (current) => ({ companyResearchSummary: `${current.companyResearchSummary ?? ''}first` }))
      result.current.updateSession(session.id, (current) => ({ companyResearchSummary: `${current.companyResearchSummary ?? ''},second` }))
    })
    expect(result.current.sessions[0].companyResearchSummary).toBe('first,second')
  })
})