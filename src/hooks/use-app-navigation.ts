import { useCallback, useEffect, useRef, useState } from 'react'
import { appLocationUrl, readAppLocation, type AppLocation } from '@/lib/app-navigation'

export function useAppNavigation(selection: Pick<AppLocation, 'customerId' | 'sessionId'>) {
  const initialSelection = useRef(selection)
  const [location, setLocation] = useState(() => readAppLocation(new URL(window.location.href), selection))
  const replaceHistory = useRef(true)

  useEffect(() => {
    const onPopState = () => {
      replaceHistory.current = true
      setLocation(readAppLocation(new URL(window.location.href), initialSelection.current))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const nextUrl = appLocationUrl(new URL(window.location.href), location)
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl !== currentUrl) {
      if (replaceHistory.current) window.history.replaceState(window.history.state, '', nextUrl)
      else window.history.pushState(window.history.state, '', nextUrl)
    }
    replaceHistory.current = false
  }, [location])

  const navigate = useCallback((updates: Partial<AppLocation>) => {
    setLocation((current) => {
      const next = { ...current, ...updates }
      return next.view === current.view && next.step === current.step &&
        next.customerId === current.customerId && next.sessionId === current.sessionId ? current : next
    })
  }, [])

  return { location, navigate }
}
