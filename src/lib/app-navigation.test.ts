import { describe, expect, it, vi } from 'vitest'
import { appLocationUrl, readAppLocation, suggestedWorkspaceStep, WORKSPACE_STEPS } from './app-navigation'
import type { DiscoverySession, UseCase } from './types'

const session: DiscoverySession = {
  id: 's1', customerId: 'c1', customerName: 'ABSA', name: 'ABSA workspace',
  innovationHubLocation: '', solutionEngineer: '', accountTeamRep: '', primaryStakeholder: '',
  responses: [], createdAt: 1,
}
const useCase: UseCase = {
  id: 'u1', discoverySessionId: 's1', title: 'Service assistant', description: '', impact: 5, feasibility: 5,
  rice: { reach: 100, users: 100, period: 'quarter', impact: 1, confidence: 50, effort: 1 }, kpis: [], createdAt: 1,
}
const selection = { customerId: 'remembered-customer', sessionId: 'remembered-session' }

describe('customer workspace locations', () => {
  it('uses URL customer and session together rather than mixing remembered selections', () => {
    expect(readAppLocation(new URL('https://id8.test/?view=dashboard&step=plan&customer=c1&session=s1'), selection))
      .toEqual({ view: 'dashboard', step: 'plan', customerId: 'c1', sessionId: 's1' })
  })

  it('does not fill a partial deep link with an unrelated remembered session', () => {
    expect(readAppLocation(new URL('https://id8.test/?view=dashboard&customer=c1'), selection).sessionId).toBeNull()
  })

  it('keeps the last selection available when opening Home', () => {
    expect(readAppLocation(new URL('https://id8.test/'), selection)).toMatchObject({ view: 'landing', ...selection })
  })

  it('preserves unrelated query parameters and hashes when navigating', () => {
    const url = appLocationUrl(new URL('https://id8.test/?release=latest#notes'), {
      view: 'dashboard', step: 'research', customerId: 'c1', sessionId: 's1',
    })
    expect(url).toBe('/?release=latest&view=dashboard&step=research&customer=c1&session=s1#notes')
  })

  it('retains the originating workspace step on specialist screens and removes app parameters on Home', () => {
    const specialized = appLocationUrl(new URL('https://id8.test/'), { view: 'solution-blueprint', step: 'plan', customerId: 'c1', sessionId: 's1' })
    expect(readAppLocation(new URL(specialized, 'https://id8.test'), selection).step).toBe('plan')
    expect(appLocationUrl(new URL(specialized, 'https://id8.test'), { view: 'landing', step: 'plan', ...selection })).toBe('/')
  })

  it('reports invalid navigation values instead of rendering a blank view', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readAppLocation(new URL('https://id8.test/?view=unknown&step=unknown'), selection))
      .toMatchObject({ view: 'landing', step: 'research' })
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('suggests a next step using only this session, without marking unfinished work complete', () => {
    expect(suggestedWorkspaceStep(session, [{ ...useCase, discoverySessionId: 'another-session' }])).toBe('research')
    expect(suggestedWorkspaceStep({ ...session, companyResearchSummary: 'Publicly sourced context' }, [])).toBe('discover')
    expect(suggestedWorkspaceStep(session, [useCase])).toBe('prioritize')
    expect(WORKSPACE_STEPS.map((step) => step.label)).toEqual(['Research', 'Discover', 'Prioritize', 'Plan', 'Export'])
  })
})
