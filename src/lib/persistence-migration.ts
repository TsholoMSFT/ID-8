const MIGRATION_VERSION = 3
const MARKER_KEY = `id8:data-schema-v${MIGRATION_VERSION}`
const BACKUP_KEY = `id8:data-schema-v${MIGRATION_VERSION}:backup`
const LEGACY_MARKER_KEY = `karabo:data-schema-v${MIGRATION_VERSION}`

const JSON_STORAGE_KEYS = [
  'discovery-sessions',
  'use-cases',
  'enterprise-sessions',
  'id8-paused-enterprise-sessions-mvp',
  'id8-paused-enterprise-sessions',
  'id8-accounts',
  'id8-workloads',
  'opportunities',
  'csam-profiles',
  'engagements',
  'frontier-account-journeys',
  'id8-roadmaps',
  'solution-blueprint-usecases',
] as const

const REMOVED_KEYS = new Set([
  'costOfInaction',
  'expectedValue',
  'runCost',
  'costOptimizations',
  'manualCOI',
  'manualExpectedValue',
  'manualFinancials',
  'stockTicker',
  'earningsInsights',
  'roiExpectation',
  'financialImpacts',
  'committedValueUSD',
  'arrUSD',
  'expansionPipelineUSD',
  'sovereignCloudAssessment',
  'sovereignCloudTrackAssessment',
  'deploymentModel',
])

const REMOVED_QUESTION_IDS = new Set(['ai-sec-q6'])
const REMOVED_STORAGE_KEYS = ['duce-sessions', 'duce-user-mode', 'questionnaire-links'] as const

export function sanitizeLegacyData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        if (!item || typeof item !== 'object') return true
        const id = (item as Record<string, unknown>).id
        const questionId = (item as Record<string, unknown>).questionId
        return !REMOVED_QUESTION_IDS.has(String(id ?? questionId ?? ''))
      })
      .map(sanitizeLegacyData)
  }

  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !REMOVED_KEYS.has(key))
      .map(([key, nestedValue]) => [key, sanitizeLegacyData(nestedValue)]),
  )
}

interface MigrationBackup {
  values: Record<string, string>
  removedValues: Record<string, string>
}

export function runPersistenceMigration(storage: Storage = window.localStorage): boolean {
  if (storage.getItem(MARKER_KEY) === 'complete') return false
  if (storage.getItem(LEGACY_MARKER_KEY) === 'complete') {
    storage.setItem(MARKER_KEY, 'complete')
    return false
  }

  const backup: MigrationBackup = { values: {}, removedValues: {} }
  const migratedValues: Record<string, string> = {}

  for (const key of JSON_STORAGE_KEYS) {
    const raw = storage.getItem(key)
    if (raw === null) continue
    backup.values[key] = raw
    migratedValues[key] = JSON.stringify(sanitizeLegacyData(JSON.parse(raw)))
  }

  for (const key of REMOVED_STORAGE_KEYS) {
    const raw = storage.getItem(key)
    if (raw !== null) backup.removedValues[key] = raw
  }

  const customerDraftKeys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith('id8:q:')) customerDraftKeys.push(key)
  }
  for (const key of customerDraftKeys) {
    const raw = storage.getItem(key)
    if (raw !== null) backup.removedValues[key] = raw
  }

  storage.setItem(BACKUP_KEY, JSON.stringify(backup))
  try {
    Object.entries(migratedValues).forEach(([key, value]) => storage.setItem(key, value))
    Object.keys(backup.removedValues).forEach((key) => storage.removeItem(key))
    storage.setItem(MARKER_KEY, 'complete')
    return true
  } catch (error) {
    Object.entries(backup.values).forEach(([key, value]) => storage.setItem(key, value))
    Object.entries(backup.removedValues).forEach(([key, value]) => storage.setItem(key, value))
    storage.removeItem(MARKER_KEY)
    throw error
  }
}

export const persistenceMigrationKeys = {
  marker: MARKER_KEY,
  backup: BACKUP_KEY,
}