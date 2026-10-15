import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function buildHandoffFiles(appUrl) {
  const destination = new URL(appUrl)
  if (destination.protocol !== 'https:' || !destination.hostname.endsWith('.azurestaticapps.net') || destination.pathname !== '/' || destination.search || destination.hash || destination.username || destination.password || destination.port) {
    throw new Error('ID8_APP_URL must be the approved HTTPS Static Web App origin.')
  }
  const script = `const target = new URL(${JSON.stringify(destination.href)});\ntarget.pathname = location.pathname;\ntarget.search = location.search;\ntarget.hash = location.hash;\ndocument.getElementById('continue').href = target.href;\nlocation.replace(target.href);\n`
  return {
    'index.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="application-name" content="ID-8"><title>ID-8 - New address</title><link rel="stylesheet" href="/handoff.css"></head><body><main><h1>ID-8</h1><p>ID-8 has moved to its new address.</p><p>Your server-side data is retained. The new browser workspace starts fresh.</p><a id="continue" href="${destination.href}">Continue to ID-8</a><noscript><p>Enable JavaScript or use the link above. Existing questionnaire links keep the same token at the new address.</p></noscript></main><script src="/handoff.js"></script></body></html>`,
    'handoff.css': 'body{margin:0;background:#0f172a;color:#f8fafc;font:18px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}main{max-width:38rem;padding:2rem}h1{font-size:3rem}a{color:#93c5fd}',
    'handoff.js': script,
    'staticwebapp.config.json': JSON.stringify({
      navigationFallback: { rewrite: '/index.html', exclude: ['/api/*', '/handoff.js', '/handoff.css'] },
      routes: [{ route: '/api/*', allowedRoles: ['id8-retired'] }],
      globalHeaders: { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'" },
    }, null, 2),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appUrl = process.env.ID8_APP_URL
  if (!appUrl) throw new Error('ID8_APP_URL is required; no handoff files were generated.')
  const directory = resolve('dist-legacy')
  await mkdir(directory, { recursive: true })
  for (const [name, content] of Object.entries(buildHandoffFiles(appUrl))) {
    await writeFile(resolve(directory, name), content)
  }
  console.log('Built the ID-8 legacy-address handoff without copying customer data or credentials.')
}
