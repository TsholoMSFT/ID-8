import { beforeEach, describe, expect, it } from 'vitest'
import { persistenceMigrationKeys, runPersistenceMigration, sanitizeLegacyData } from './persistence-migration'

describe('persistence migration', () => {
  beforeEach(() => localStorage.clear())

  it('recursively removes financial and sovereign fields while preserving discovery data', () => {
    const migrated = sanitizeLegacyData({
      id: 'session-1',
      responses: [{ questionId: 'q1', answer: 'Keep this' }, { questionId: 'ai-sec-q6', answer: 'Remove this' }],
      useCases: [{ id: 'u1', title: 'Keep', costOfInaction: { totalAnnualCOI: 10 }, runCost: { totalAnnualUSD: 5 } }],
      sovereignCloudAssessment: { mandateLevel: 'required' },
      aiGovernanceAssessment: { overallScore: 70 },
      companyInsights: [{ title: 'Keep research' }],
    })

    expect(migrated).toEqual({
      id: 'session-1',
      responses: [{ questionId: 'q1', answer: 'Keep this' }],
      useCases: [{ id: 'u1', title: 'Keep' }],
      aiGovernanceAssessment: { overallScore: 70 },
      companyInsights: [{ title: 'Keep research' }],
    })
  })

  it('migrates known stores and removes DUCE and questionnaire local data once', () => {
    localStorage.setItem('use-cases', JSON.stringify([{ id: 'u1', expectedValue: { totalAnnualValue: 10 } }]))
    localStorage.setItem('frontier-account-journeys', JSON.stringify({
      c1: { id: 'journey-1', customerName: 'Contoso', expectedValue: { totalAnnualValue: 10 } },
    }))
    localStorage.setItem('duce-sessions', '{"session":{}}')
    localStorage.setItem('duce-user-mode', 'technical')
    localStorage.setItem('questionnaire-links', '[]')
    localStorage.setItem('id8:q:token', '{"answers":{}}')

    expect(runPersistenceMigration()).toBe(true)
    expect(JSON.parse(localStorage.getItem('use-cases') || '[]')).toEqual([{ id: 'u1' }])
    expect(JSON.parse(localStorage.getItem('frontier-account-journeys') || '{}')).toEqual({
      c1: { id: 'journey-1', customerName: 'Contoso' },
    })
    expect(localStorage.getItem('duce-sessions')).toBeNull()
    expect(localStorage.getItem('duce-user-mode')).toBeNull()
    expect(localStorage.getItem('questionnaire-links')).toBeNull()
    expect(localStorage.getItem('id8:q:token')).toBeNull()
    expect(localStorage.getItem(persistenceMigrationKeys.backup)).toBeTruthy()
    expect(runPersistenceMigration()).toBe(false)
  })

  it('does not replay schema cleanup when the completed migration has the former product prefix', () => {
    const currentData = JSON.stringify([{ id: 'u1', runCost: { totalMonthlyUSD: 15 }, expectedValue: { totalAnnualValue: 1000 } }])
    localStorage.setItem('karabo:data-schema-v3', 'complete')
    localStorage.setItem('use-cases', currentData)

    expect(runPersistenceMigration()).toBe(false)
    expect(localStorage.getItem(persistenceMigrationKeys.marker)).toBe('complete')
    expect(localStorage.getItem('use-cases')).toBe(currentData)
  })
})