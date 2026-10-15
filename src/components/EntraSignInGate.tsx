import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function EntraSignInGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'signed-out' | 'ready' | 'error'>(
    import.meta.env.DEV ? 'ready' : 'loading',
  )

  useEffect(() => {
    if (import.meta.env.DEV) return
    const controller = new AbortController()
    fetch('/.auth/me', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Sign-in status failed: HTTP ${response.status}`)
        const data = await response.json() as { clientPrincipal?: { identityProvider?: string; userRoles?: string[] } | null }
        setState(data.clientPrincipal?.identityProvider === 'aad' && data.clientPrincipal.userRoles?.includes('authenticated')
          ? 'ready'
          : 'signed-out')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error('Could not check Microsoft Entra sign-in:', error)
        setState('error')
      })
    return () => controller.abort()
  }, [])

  if (state === 'ready') return children
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-xl border bg-card p-8 space-y-4 text-center">
        <h1 className="text-2xl font-semibold">ID-8</h1>
        {state === 'loading' ? <p>Checking sign-in...</p> : state === 'error' ? (
          <>
            <p role="alert">Sign-in status could not be checked. Please retry.</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </>
        ) : (
          <>
            <p>Sign in with your Microsoft Entra account to access discovery and AI features.</p>
            <p className="text-sm text-muted-foreground">Public customer questionnaire links do not require sign-in.</p>
            <Button asChild><a href={`/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)}`}>Sign in with Microsoft</a></Button>
          </>
        )}
      </section>
    </main>
  )
}
