import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { buildHandoffFiles } from './build-id8-handoff.mjs'

test('preserves questionnaire paths without allowing an external open redirect', () => {
  const files = buildHandoffFiles('https://new-id8.azurestaticapps.net/')
  let redirected
  runInNewContext(files['handoff.js'], {
    URL,
    document: { getElementById: () => ({ href: '' }) },
    location: { pathname: '//untrusted.example/q/token', search: '?source=old', hash: '#question', replace: (url) => { redirected = url } },
  })
  const destination = new URL(redirected)
  assert.equal(destination.origin, 'https://new-id8.azurestaticapps.net')
  assert.equal(destination.pathname, '//untrusted.example/q/token')
  assert.equal(destination.search, '?source=old')
})

test('the retired site displays ID-8 and denies all legacy metered API access', () => {
  const files = buildHandoffFiles('https://new-id8.azurestaticapps.net/')
  assert.match(files['index.html'], /<h1>ID-8<\/h1>/)
  const config = JSON.parse(files['staticwebapp.config.json'])
  assert.deepEqual(config.routes, [{ route: '/api/*', allowedRoles: ['id8-retired'] }])
  assert.equal(Object.values(files).some((content) => /karabo/i.test(content)), false)
})

test('rejects unapproved schemes and non-Azure origins', () => {
  assert.throws(() => buildHandoffFiles('http://new-id8.azurestaticapps.net/'), /approved HTTPS/)
  assert.throws(() => buildHandoffFiles('https://untrusted.example/'), /approved HTTPS/)
  assert.throws(() => buildHandoffFiles('https://user:password@new-id8.azurestaticapps.net/'), /approved HTTPS/)
})
