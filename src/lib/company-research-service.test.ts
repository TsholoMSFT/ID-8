import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AITask } from './openai-service'

const mocks = vi.hoisted(() => ({
  callAIForTask: vi.fn<(task: AITask, prompt: string, options?: { expectJson?: boolean; systemPrompt?: string }) => Promise<string>>(),
}))

vi.mock('./openai-service', () => ({ callAIForTask: mocks.callAIForTask }))
vi.mock('./attachment-text', () => ({ extractTextFromAttachments: vi.fn() }))

import { extractInsightsFromText, rssItemsToText } from './company-research-service'
import { buildCompanyInsightPrompt } from './company-research-prompt'

const sampleInsight = {
  category: 'strategy',
  title: 'Digital service efficiency',
  summary: 'The business is investing in more efficient digital services.',
  relevanceToAI: 'Automate repetitive service work with human oversight.',
  potentialUseCases: ['Grounded service assistance'],
  confidence: 'medium',
}

describe('company research extraction contract', () => {
  beforeEach(() => { mocks.callAIForTask.mockReset() })

  it('normalizes a structured insight and preserves source attribution', async () => {
    mocks.callAIForTask.mockResolvedValue(JSON.stringify({ insights: [sampleInsight] }))
    const result = await extractInsightsFromText('Business service strategy.', 'ABSA', 'Regulatory Filings')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ ...sampleInsight, source: 'Regulatory Filings' })
    expect(mocks.callAIForTask).toHaveBeenCalledWith('extraction', expect.stringContaining('ABSA'), expect.objectContaining({ expectJson: true }))
  })

  it('uses the same bounded filings prompt as the live diagnostic', async () => {
    const items = Array.from({ length: 45 }, (_, index) => ({
      title: `ABSA filing ${index + 1}`, description: 'Business-relevant filing.', pubDate: '2026-10-15', link: 'https://example.invalid',
    }))
    const text = rssItemsToText(items, 12)
    mocks.callAIForTask.mockResolvedValue(JSON.stringify({ insights: [sampleInsight] }))
    await extractInsightsFromText(text, 'ABSA', 'Regulatory Filings')
    expect(mocks.callAIForTask.mock.calls[0][1]).toBe(buildCompanyInsightPrompt(text, 'ABSA', 'Regulatory Filings'))
    expect(text).toContain('ABSA filing 12')
    expect(text).not.toContain('ABSA filing 13')
  })

  it('does not call the provider for blank source content', async () => {
    expect(await extractInsightsFromText('   ', 'ABSA')).toEqual([])
    expect(mocks.callAIForTask).not.toHaveBeenCalled()
  })

  it('surfaces provider failures rather than returning an empty success', async () => {
    mocks.callAIForTask.mockRejectedValue(new Error('AI provider returned no content.'))
    await expect(extractInsightsFromText('Relevant filings.', 'ABSA')).rejects.toThrow('AI provider returned no content.')
    expect(mocks.callAIForTask).toHaveBeenCalledTimes(1)
  })

  it('rejects a malformed extraction payload rather than presenting no insights as success', async () => {
    mocks.callAIForTask.mockResolvedValue('{"unexpected":"payload"}')
    await expect(extractInsightsFromText('Relevant filings.', 'ABSA')).rejects.toThrow('did not contain an insights list')
  })
})
