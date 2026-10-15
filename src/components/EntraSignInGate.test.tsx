import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EntraSignInGate } from './EntraSignInGate'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('shows ID-8 branding on the production sign-in page', async () => {
  vi.stubEnv('DEV', false)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ clientPrincipal: null }), {
    headers: { 'Content-Type': 'application/json' },
  })))
  render(<EntraSignInGate><p>Authenticated application</p></EntraSignInGate>)
  expect(await screen.findByRole('link', { name: 'Sign in with Microsoft' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'ID-8' })).toBeInTheDocument()
  expect(screen.queryByText(/karabo/i)).not.toBeInTheDocument()
  expect(screen.queryByText('Authenticated application')).not.toBeInTheDocument()
})
