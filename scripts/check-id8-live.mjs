const value = process.env.ID8_APP_URL
if (!value) throw new Error('ID8_APP_URL is required.')
const origin = new URL(value)
if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.azurestaticapps.net')) throw new Error('Unexpected ID-8 deployment origin.')

for (const route of ['/api/health', '/api/ai-readiness']) {
  let passed = false
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(new URL(route, origin), { signal: AbortSignal.timeout(20_000) })
      if (response.ok) {
        const body = await response.json()
        if (route === '/api/health' ? body.ok === true && body.application === 'ID-8' : body.status === 'configured') {
          passed = true
          break
        }
      }
      console.warn(`ID-8 ${route}: HTTP ${response.status} or unexpected response; retrying a read-only probe.`)
    } catch (error) {
      console.warn(`ID-8 ${route}: ${error instanceof Error ? error.message : 'Read-only probe failed'}`)
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  if (!passed) throw new Error(`ID-8 deployment check failed: ${route}`)
  console.log(`ID-8 ${route}: passed without inference.`)
}
