/**
 * Seeds the private Blob knowledge index with regulatory frameworks + solution-blueprint
 * archetypes so semantic lookups (LearnMorePopover, archetype inference) have grounded
 * content even before customer-specific docs are ingested.
 *
 * Run: cd api && npx tsx scripts/seed-search.ts
 *
 * Required env:
 *   AZURE_STORAGE_CONNECTION_STRING
 *   AZURE_OPENAI_ENDPOINT        e.g. https://karabo-ai-hub.openai.azure.com/
 *   AZURE_OPENAI_API_KEY
 *   AZURE_OPENAI_EMBEDDING_DEPLOYMENT  defaults to text-embedding-3-small
 */
import { getBlobServiceClient } from '../src/lib/storage-clients'
import { KNOWLEDGE_CONTAINER, KNOWLEDGE_BLOB, parseKnowledgeIndex } from '../src/lib/knowledge-index'
import { REGULATION_REGISTRY } from '../../src/lib/regulatory-engine'
import { ARCHETYPES } from '../../src/lib/solution-blueprint/archetypes'
import { EMBEDDING_DIMENSIONS, getEmbeddingDeployment, validateEmbeddingVectors } from '../src/lib/embedding-config'

interface KnowledgeDoc {
  id: string
  title: string
  content: string
  source: string
  category: string
  url: string
  embedding: number[]
}

const aoaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT
const aoaiKey = process.env.AZURE_OPENAI_API_KEY
const embedDeployment = getEmbeddingDeployment()
const apiVersion = process.env.AZURE_OPENAI_EMBEDDING_API_VERSION || '2024-10-21'

if (!aoaiEndpoint || !aoaiKey) {
  console.error('Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY. Storage must also be configured.')
  process.exit(1)
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const url = `${aoaiEndpoint!.replace(/\/$/, '')}/openai/deployments/${embedDeployment}/embeddings?api-version=${apiVersion}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': aoaiKey! },
    body: JSON.stringify({ input: inputs, dimensions: EMBEDDING_DIMENSIONS }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Embeddings failed (${r.status}): ${t}`)
  }
  const data = (await r.json()) as { data: Array<{ embedding: number[]; index: number }> }
  const vectors = data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
  validateEmbeddingVectors(vectors)
  return vectors
}

function safeId(prefix: string, raw: string): string {
  return `${prefix}-${raw.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`
}

function regulationsToDocs(): Array<Omit<KnowledgeDoc, 'embedding'>> {
  return Object.values(REGULATION_REGISTRY).map((reg) => {
    const remediation = Object.entries(reg.remediationTemplates)
      .map(([level, items]) => `${level.toUpperCase()}: ${items?.join('; ') ?? ''}`)
      .join('\n')
    const content = [
      `${reg.displayName} (${reg.shortName}) — ${reg.jurisdiction}.`,
      reg.effectiveDate ? `Effective ${reg.effectiveDate}.` : '',
      reg.highRiskKeywords.length ? `High-risk triggers: ${reg.highRiskKeywords.join(', ')}.` : '',
      reg.unacceptableKeywords.length ? `Prohibited: ${reg.unacceptableKeywords.join(', ')}.` : '',
      reg.baselineKeywords?.length ? `Applies when: ${reg.baselineKeywords.join(', ')}.` : '',
      remediation ? `Remediation:\n${remediation}` : '',
    ]
      .filter(Boolean)
      .join(' ')
    return {
      id: safeId('reg', reg.code),
      title: reg.displayName,
      content,
      source: 'regulatory-framework',
      category: reg.jurisdiction,
      url: reg.url,
    }
  })
}

function archetypesToDocs(): Array<Omit<KnowledgeDoc, 'embedding'>> {
  return ARCHETYPES.map((a) => {
    const content = [
      a.description,
      `Required capabilities: ${a.requiredCapabilities.join(', ')}.`,
      a.recommendedCapabilities?.length ? `Recommended: ${a.recommendedCapabilities.join(', ')}.` : '',
      a.risks?.length ? `Risks: ${a.risks.join('; ')}.` : '',
      a.typicalKpis?.length ? `KPIs: ${a.typicalKpis.join(', ')}.` : '',
      a.pilotCostBandUsd ? `Pilot cost band: $${a.pilotCostBandUsd.min}-${a.pilotCostBandUsd.max}.` : '',
    ]
      .filter(Boolean)
      .join(' ')
    return {
      id: safeId('arch', a.id),
      title: a.name,
      content,
      source: 'solution-archetype',
      category: 'Solution Blueprint',
      url: '',
    }
  })
}

async function main() {
  const docs = [...regulationsToDocs(), ...archetypesToDocs()]
  console.log(`Preparing ${docs.length} documents (${regulationsToDocs().length} regulations + ${archetypesToDocs().length} archetypes).`)

  // Embed in batches of 16 to stay within AOAI request limits.
  const BATCH = 16
  const embedded: KnowledgeDoc[] = []
  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH)
    process.stdout.write(`Embedding ${i + 1}-${i + slice.length} of ${docs.length}... `)
    const vectors = await embedBatch(slice.map((d) => `${d.title}\n\n${d.content}`))
    slice.forEach((d, j) => embedded.push({ ...d, embedding: vectors[j] }))
    console.log('ok')
  }

  const container = getBlobServiceClient().getContainerClient(KNOWLEDGE_CONTAINER)
  await container.createIfNotExists()
  const index = parseKnowledgeIndex({ schemaVersion: 1, dimensions: EMBEDDING_DIMENSIONS, embeddingDeployment: embedDeployment, documents: embedded })
  const payload = JSON.stringify(index)
  await container.getBlockBlobClient(KNOWLEDGE_BLOB).upload(payload, Buffer.byteLength(payload), {
    conditions: process.argv.includes('--replace') ? undefined : { ifNoneMatch: '*' },
    blobHTTPHeaders: { blobContentType: 'application/json' },
  })
  console.log(`Done. Indexed ${embedded.length} documents.`)
}

main().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
