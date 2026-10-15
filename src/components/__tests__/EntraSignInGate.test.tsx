import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EntraSignInGate } from '../EntraSignInGate'

describe('workspace authentication boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    history.replaceState(null, '', '/')
  })

  it('returns signed-out users to the exact workspace after Microsoft sign-in', async () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ clientPrincipal: null }))))
    history.replaceState(null, '', '/?view=dashboard&step=plan&customer=c1&session=s1')
    render(<EntraSignInGate><p>Protected workspace</p></EntraSignInGate>)
    const link = await screen.findByRole('link', { name: 'Sign in with Microsoft' })
    const destination = new URL(link.getAttribute('href') ?? '', location.origin)
    expect(destination.pathname).toBe('/.auth/login/aad')
    expect(destination.searchParams.get('post_login_redirect_uri')).toBe('/?view=dashboard&step=plan&customer=c1&session=s1')
    expect(screen.queryByText('Protected workspace')).not.toBeInTheDocument()
  })

  it('still requires the authenticated Microsoft Entra principal in production', async () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ clientPrincipal: {
      identityProvider: 'github', userRoles: ['authenticated'],
    } }))))
    render(<EntraSignInGate><p>Protected workspace</p></EntraSignInGate>)
    await screen.findByRole('link', { name: 'Sign in with Microsoft' })
    expect(screen.queryByText('Protected workspace')).not.toBeInTheDocument()
  })
})
