import { describe, expect, it } from 'vitest'
import { estimateRunCost, portfolioRunCost } from './cost-engine'
import type { UseCase } from './types'

const search: Pick<UseCase, 'microsoftSolutions'> = {
  microsoftSolutions: [{ productFamily: 'azure-ai', services: ['azure-ai-search'], role: 'primary', justification: 'Knowledge retrieval' }],
}

describe('usage and explicitly shared platform costs', () => {
  it('does not invent a monthly platform fee when no hosted service is selected', () => {
    const result = estimateRunCost({})
    expect(result.totalMonthlyUSD).toBe(0)
    expect(result.assumptions.join(' ')).toContain('not yet quantified')
  })

  it('uses volume-based Functions pricing without an arbitrary fixed surcharge', () => {
    const workload: Pick<UseCase, 'microsoftSolutions'> = {
      microsoftSolutions: [{ productFamily: 'azure-ai', services: ['azure-functions'], role: 'primary', justification: 'HTTP API for AI features' }],
    }
    expect(estimateRunCost(workload, { monthlyTransactions: 0 }).totalMonthlyUSD).toBe(0)
    expect(estimateRunCost(workload, { monthlyTransactions: 50_000 }).totalMonthlyUSD).toBeLessThan(1)
  })

  it('offers Blob hybrid without dedicated Search capacity and states its limits', () => {
    const dedicated = estimateRunCost(search)
    const blob = estimateRunCost(search, { searchBackend: 'blob-hybrid' })
    expect(blob.totalMonthlyUSD).toBeLessThan(dedicated.totalMonthlyUSD)
    expect(blob.sharedPlatformCosts).toEqual([])
    expect(blob.assumptions.join(' ')).toContain('1,000 documents')
  })

  it('counts Search capacity once only for an explicitly shared platform group', () => {
    const first = estimateRunCost(search, { sharedPlatformId: 'customer-a-session' })
    const second = estimateRunCost(search, { sharedPlatformId: 'customer-a-session' })
    const result = portfolioRunCost([{ id: 'one', runCost: first }, { id: 'two', runCost: second }])
    expect(result.totalMonthlyUSD).toBe(first.totalMonthlyUSD)
    expect(result.sharedPlatformDeductionUSD).toBe(second.totalMonthlyUSD)
    expect(portfolioRunCost([{ id: 'one', runCost: estimateRunCost(search) }, { id: 'two', runCost: estimateRunCost(search) }]).totalMonthlyUSD).toBe(first.totalMonthlyUSD * 2)
  })

  it('never shares costs between different customer groups or regions', () => {
    const one = estimateRunCost(search, { sharedPlatformId: 'customer-a' })
    const two = estimateRunCost(search, { sharedPlatformId: 'customer-b' })
    expect(portfolioRunCost([{ id: 'one', runCost: one }, { id: 'two', runCost: two }]).sharedPlatformDeductionUSD).toBe(0)
  })
})
