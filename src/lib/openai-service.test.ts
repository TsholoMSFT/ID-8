import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callOpenAI, clearAICache, getModelForTask } from './openai-service'

describe('AI transport cost controls', () => {
  beforeEach(() => clearAICache())
  afterEach(() => vi.unstubAllGlobals())

  it('uses the mini route for executive content by default', () => {
    expect(getModelForTask('executive')).toBe('gpt-4o-mini')
  })

  it('uses nano for strict structured tasks rather than Phi JSON mode', () => {
    expect(getModelForTask('extraction')).toBe('gpt-5-nano')
    expect(getModelForTask('formatting')).toBe('gpt-5-nano')
  })

  it('never automatically replays permanent failures or lost responses', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network response lost'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(callOpenAI('test transport failure')).rejects.toThrow('Could not reach')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces quota denial without retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'Daily AI quota reached', code: 'QUOTA_EXCEEDED', retryable: false,
    }), { status: 429, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(callOpenAI('quota test')).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', retryable: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reuses a successful browser response without additional network calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: 'cached result' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await callOpenAI('cache test')).toBe('cached result')
    expect(await callOpenAI('cache test')).toBe('cached result')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
