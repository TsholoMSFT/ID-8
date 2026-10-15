import { FoundryLocalManager } from 'foundry-local-sdk'

const DEFAULT_ENDPOINT = 'http://127.0.0.1:5764'
const DEFAULT_MODEL = 'phi-4-mini-instruct'

function getOption(name, fallback) {
  const prefix = `--${name}=`
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  return value?.trim() || fallback
}

function requireLoopbackEndpoint(value) {
  const url = new URL(value)
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'http:' || !isLoopback) {
    throw new Error('Foundry Local must bind to an HTTP loopback endpoint')
  }
  return url.toString().replace(/\/$/, '')
}

const endpoint = requireLoopbackEndpoint(getOption('endpoint', process.env.FOUNDRY_LOCAL_ENDPOINT || DEFAULT_ENDPOINT))
const modelAlias = getOption('model', process.env.FOUNDRY_LOCAL_MODEL || DEFAULT_MODEL)
const listOnly = process.argv.includes('--list')

console.log('Initializing Foundry Local...')
const manager = await FoundryLocalManager.createAsync({
  appName: 'id8-foundry-local',
  logLevel: 'info',
  webServiceUrls: endpoint,
})

if (listOnly) {
  const models = await manager.catalog.getModels()
  for (const model of models) console.log(`${model.alias}\t${model.id}`)
  process.exit(0)
}

let currentExecutionProvider = ''
await manager.downloadAndRegisterEps((name, percent) => {
  if (name !== currentExecutionProvider) {
    if (currentExecutionProvider) process.stdout.write('\n')
    currentExecutionProvider = name
  }
  process.stdout.write(`\rExecution provider ${name}: ${percent.toFixed(1)}%`)
})
if (currentExecutionProvider) process.stdout.write('\n')

let model
try {
  model = await manager.catalog.getModel(modelAlias)
} catch (error) {
  const available = await manager.catalog.getModels()
  const aliases = available.map((candidate) => candidate.alias).sort().join(', ')
  throw new Error(`Foundry Local model alias "${modelAlias}" is unavailable. Available aliases: ${aliases}`, { cause: error })
}

await model.download((percent) => {
  process.stdout.write(`\rModel ${modelAlias}: ${percent.toFixed(1)}%`)
})
process.stdout.write('\n')
await model.load()
manager.startWebService()

console.log(`Foundry Local ready: endpoint=${manager.urls[0] || endpoint}/v1 model=${model.id}`)
console.log('Set FOUNDRY_LOCAL_ENABLED=true in api/local.settings.json to route development chat locally first.')

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  console.log('\nStopping Foundry Local...')
  if (manager.isWebServiceRunning) manager.stopWebService()
  await model.unload()
  process.exit(0)
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)
process.stdin.resume()