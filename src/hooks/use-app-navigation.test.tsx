import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppNavigation } from './use-app-navigation'

const remembered = { customerId: 'old-customer', sessionId: 'old-session' }

describe('browser-backed workspace navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?view=dashboard&step=research&customer=c1&session=s1')
  })

  it('restores the exact step and selection on refresh', () => {
    window.history.replaceState(null, '', '/?view=dashboard&step=export&customer=c2&session=s2')
    const { result } = renderHook(() => useAppNavigation(remembered))
    expect(result.current.location).toEqual({ view: 'dashboard', step: 'export', customerId: 'c2', sessionId: 's2' })
  })

  it('batches customer, session and view changes into one history entry', () => {
    const { result } = renderHook(() => useAppNavigation(remembered))
    const length = history.length
    act(() => {
      result.current.navigate({ customerId: 'c2' })
      result.current.navigate({ sessionId: 's2' })
      result.current.navigate({ view: 'dashboard', step: 'discover' })
    })
    expect(history.length).toBe(length + 1)
    expect(new URL(location.href).searchParams.get('customer')).toBe('c2')
    expect(new URL(location.href).searchParams.get('session')).toBe('s2')
  })

  it('restores both customer context and stage with browser Back and Forward', async () => {
    const { result, unmount } = renderHook(() => useAppNavigation(remembered))
    act(() => result.current.navigate({ step: 'discover' }))
    act(() => result.current.navigate({ customerId: 'c2', sessionId: 's2', step: 'plan' }))
    act(() => history.back())
    await waitFor(() => expect(result.current.location).toMatchObject({ step: 'discover', customerId: 'c1', sessionId: 's1' }))
    act(() => history.forward())
    await waitFor(() => expect(result.current.location).toMatchObject({ step: 'plan', customerId: 'c2', sessionId: 's2' }))
    unmount()
    const refreshed = renderHook(() => useAppNavigation(remembered))
    expect(refreshed.result.current.location).toMatchObject({ step: 'plan', customerId: 'c2', sessionId: 's2' })
  })

  it('does not create duplicate entries for a click on the current step', () => {
    const { result } = renderHook(() => useAppNavigation(remembered))
    const length = history.length
    act(() => result.current.navigate({ step: 'research' }))
    expect(history.length).toBe(length)
  })
})
