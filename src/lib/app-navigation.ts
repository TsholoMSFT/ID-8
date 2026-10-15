import type { DiscoverySession, UseCase } from './types'

export const APP_VIEWS = [
  'landing', 'workspace-setup', 'dashboard', 'session-metadata', 'discovery-wizard',
  'discovery-results', 'session-comparison', 'live-discovery', 'solution-blueprint',
  'enterprise-discovery', 'notes-input', 'notes-workflow', 'portfolio', 'pipeline',
  'engagement-hub', 'customer-journey', 'csam-cockpit', 'questionnaire-builder', 'fy27-cockpit',
] as const

export type AppView = typeof APP_VIEWS[number]

export const WORKSPACE_STEPS = [
  { id: 'research', label: 'Research', description: 'Understand the customer and collect evidence.' },
  { id: 'discover', label: 'Discover', description: 'Turn customer needs into useful opportunities.' },
  { id: 'prioritize', label: 'Prioritize', description: 'Compare use cases and choose where to focus.' },
  { id: 'plan', label: 'Plan', description: 'Build an actionable customer journey.' },
  { id: 'export', label: 'Export', description: 'Review and share your work.' },
] as const

export type WorkspaceStep = typeof WORKSPACE_STEPS[number]['id']

export interface AppLocation {
  view: AppView
  step: WorkspaceStep
  customerId: string | null
  sessionId: string | null
}

export function isWorkspaceStep(value: string): value is WorkspaceStep {
  return WORKSPACE_STEPS.some((step) => step.id === value)
}

export function readAppLocation(
  url: URL,
  selection: Pick<AppLocation, 'customerId' | 'sessionId'>,
): AppLocation {
  const view = url.searchParams.get('view')
  const step = url.searchParams.get('step')
  const hasLocation = ['view', 'step', 'customer', 'session'].some((key) => url.searchParams.has(key))
  const validView = APP_VIEWS.find((candidate) => candidate === view)
  if (view && !validView) console.warn('Unrecognized ID-8 view in the URL; opening Home.')
  if (step && !isWorkspaceStep(step)) console.warn('Unrecognized ID-8 workspace step; opening Research.')
  return {
    view: validView ?? 'landing',
    step: step && isWorkspaceStep(step) ? step : 'research',
    customerId: hasLocation ? url.searchParams.get('customer') : selection.customerId,
    sessionId: hasLocation ? url.searchParams.get('session') : selection.sessionId,
  }
}

export function appLocationUrl(currentUrl: URL, location: AppLocation): string {
  const url = new URL(currentUrl)
  for (const key of ['view', 'step', 'customer', 'session']) url.searchParams.delete(key)
  if (location.view !== 'landing') {
    url.searchParams.set('view', location.view)
    url.searchParams.set('step', location.step)
    if (location.customerId) url.searchParams.set('customer', location.customerId)
    if (location.sessionId) url.searchParams.set('session', location.sessionId)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function suggestedWorkspaceStep(session: DiscoverySession, useCases: UseCase[]): WorkspaceStep {
  if (useCases.some((useCase) => useCase.discoverySessionId === session.id)) return 'prioritize'
  if (session.responses.length > 0 || session.companyInsights?.length || session.companyResearchSummary) return 'discover'
  return 'research'
}
