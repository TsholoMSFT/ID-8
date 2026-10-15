import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendStatusBadge } from './BackendStatusBadge'

describe('non-billable backend status', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('polls configuration only every 15 minutes and never probes AI automatically', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.endsWith('/health') ? { ok: true } : { status: 'configured', correlationId: 'configured' },
    ), { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<BackendStatusBadge />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(14 * 60_000) })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.every(([url]) => !url.includes('refresh=true'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Click to test/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(fetchMock.mock.calls.some(([url]) => url.includes('refresh=true'))).toBe(true)
  })

  it('does not poll while the page is hidden', async () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, status: 'configured' }), {
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<BackendStatusBadge />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    hidden.mockReturnValue(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
