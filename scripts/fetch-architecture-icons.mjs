#!/usr/bin/env node
// Download official Microsoft architecture icon packages, extract SVGs,
// rename to match service ids in `src/lib/diagram/azure-icons.ts`, and drop
// them into `src/assets/azure-icons/` where Vite's `import.meta.glob`
// auto-discovers them.
//
// Brand terms: https://learn.microsoft.com/en-us/azure/architecture/icons/
//   "Microsoft permits the use of these icons in architectural diagrams,
//    training materials, or documentation."
// ID-8 is a Microsoft solution-blueprint tool — this is the permitted use.

import { mkdir, rm, readdir, copyFile, writeFile, stat } from 'node:fs/promises'
import { createWriteStream, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import https from 'node:https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TARGET = join(ROOT, 'src', 'assets', 'azure-icons')

const SOURCES = [
  {
    name: 'azure',
    url: 'https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V23.zip',
  },
  {
    name: 'm365',
    url: 'https://download.microsoft.com/download/2/F/3/2F346655-1F7E-4F5E-BE78-82DA3D507F3A/2024-microsoft-365-content-icons.zip',
  },
]

// For each service id we list canonical fragment(s) (preferred) and
// optionally `avoid` substrings that disqualify a candidate. The picker
// scores every SVG against every rule and chooses the candidate whose
// normalized filename most closely matches (preferring exact stem match,
// then shortest filename = canonical service tile).
const NAME_RULES = [
  // M365 (filenames in 2024 M365 zip use space + underscore patterns,
  // e.g. "Building People_Teams_Light.svg")
  { id: 'm365-teams',           prefer: ['teams'],            avoid: ['notebook', 'channel', 'meeting', 'task', 'phone', 'shifts'] },
  { id: 'm365-copilot',         prefer: ['copilot'],          avoid: [] },
  { id: 'power-platform',       prefer: ['power-platform', 'powerplatform'], avoid: [] },

  // AI
  { id: 'azure-foundry',        prefer: ['ai-foundry', 'azure-ai-foundry'], avoid: [] },
  { id: 'azure-openai',         prefer: ['azure-openai', 'openai'], avoid: [] },
  { id: 'azure-content-safety', prefer: ['content-safety'],  avoid: [] },
  { id: 'azure-doc-intel',      prefer: ['document-intelligence', 'form-recognizers', 'form-recognizer'], avoid: [] },
  { id: 'azure-speech',         prefer: ['speech-services'], avoid: ['translator'] },
  { id: 'azure-ai-search',      prefer: ['ai-search', 'cognitive-search', 'search-services'], avoid: [] },

  // Compute & integration
  { id: 'azure-app-service',    prefer: ['app-services', 'app-service'],     avoid: ['certificates', 'domains', 'environment', 'plans'] },
  { id: 'azure-container-apps', prefer: ['container-apps'],   avoid: ['environments'] },
  { id: 'azure-functions',      prefer: ['function-apps'],    avoid: [] },
  { id: 'azure-logic-apps',     prefer: ['logic-apps'],       avoid: ['custom-connector', 'integration'] },
  { id: 'azure-event-hubs',     prefer: ['event-hubs'],       avoid: ['cluster'] },
  { id: 'azure-service-bus',    prefer: ['service-bus'],      avoid: ['business-process'] },
  { id: 'azure-aks',            prefer: ['kubernetes-services'], avoid: ['automatic', 'fleet', 'extension', 'snapshot', 'arc'] },
  { id: 'azure-front-door',     prefer: ['front-door'],       avoid: [] },
  { id: 'azure-vnet',           prefer: ['virtual-networks'], avoid: ['classic', 'manager', 'gateway'] },
  { id: 'azure-apim-ai-gateway',prefer: ['api-management-services'], avoid: [] },

  // Data
  { id: 'azure-sql',            prefer: ['sql-database', 'azure-sql'], avoid: ['edge', 'managed', 'server', 'data-warehouses', 'vm'] },
  { id: 'azure-cosmos',         prefer: ['azure-cosmos-db', 'cosmos-db'], avoid: [] },
  { id: 'azure-fabric',         prefer: ['microsoft-fabric'], avoid: ['service-fabric'] },
  { id: 'azure-data-factory',   prefer: ['data-factory', 'data-factories'], avoid: [] },
  { id: 'azure-purview',        prefer: ['purview'],          avoid: [] },
  { id: 'azure-storage',        prefer: ['storage-accounts'], avoid: ['classic', 'queue', 'table', 'blob', 'file', 'data-lake'] },

  // Identity — V23 doesn't ship a vanilla Entra ID brand mark; pick the
  // closest sub-feature icon. Note Microsoft's filename misspells "Privleged".
  { id: 'entra-id',             prefer: ['entra-id-protection', 'entra-identity-roles-and-administrators'], avoid: [] },
  { id: 'entra-external-id',    prefer: ['external-identities', 'entra-external-id'], avoid: [] },
  { id: 'entra-pim',            prefer: ['privileged-identity-management', 'entra-privleged-identity-management'], avoid: [] },

  // Security
  { id: 'azure-key-vault',      prefer: ['key-vaults'],       avoid: [] },
  { id: 'azure-ddos',           prefer: ['ddos-protection'],  avoid: [] },
  { id: 'defender-cloud',       prefer: ['microsoft-defender-for-cloud', 'defender-for-cloud'], avoid: ['iot', 'easm', 'manager', 'ot'] },
  { id: 'sentinel',             prefer: ['microsoft-sentinel', 'azure-sentinel'], avoid: [] },

  // Ops
  { id: 'azure-monitor',        prefer: ['monitor'],          avoid: ['pipeline', 'agent', 'health', 'workspace', 'alerts'] },
  { id: 'azure-cost-mgmt',      prefer: ['cost-management'],  avoid: [] },
  { id: 'azure-quota',          prefer: ['quotas'],           avoid: [] },
  { id: 'azure-backup',         prefer: ['backup-vault', 'recovery-services-vaults'], avoid: ['infrastructure'] },
]

function download(url, outFile) {
  return new Promise((resolve, reject) => {
    function get(u, depth = 0) {
      if (depth > 6) return reject(new Error('too many redirects'))
      https.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return get(res.headers.location, depth + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`))
        }
        const ws = createWriteStream(outFile)
        res.pipe(ws)
        ws.on('finish', () => ws.close(() => resolve()))
        ws.on('error', reject)
      }).on('error', reject)
    }
    get(url)
  })
}

function unzip(zipPath, destDir) {
  // PowerShell Expand-Archive ships with Windows.
  const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`
  execSync(cmd, { stdio: 'inherit' })
}

async function walkSvgs(dir) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walkSvgs(p)))
    else if (e.isFile() && extname(e.name).toLowerCase() === '.svg') out.push(p)
  }
  return out
}

function normalizeName(filename) {
  // Strip extension, leading numeric prefix ("00046-"), and "icon-service-".
  return filename
    .toLowerCase()
    .replace(/\.svg$/, '')
    .replace(/^[0-9]+-/, '')
    .replace(/^icon-service-/, '')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
}

// Score 0 = no match, higher = better. Exact stem match wins; otherwise prefer
// shorter stems and earlier substring positions.
function scoreCandidate(rule, stem) {
  if (rule.avoid && rule.avoid.some(a => stem.includes(a))) return 0
  let best = 0
  for (const p of rule.prefer) {
    if (stem === p) return 1000
    if (stem === p + 's' || stem + 's' === p) return 900
    if (stem.startsWith(p + '-') || stem.endsWith('-' + p)) {
      best = Math.max(best, 500 - stem.length)
    } else if (stem.includes(p)) {
      best = Math.max(best, 200 - stem.length)
    }
  }
  return Math.max(best, 0)
}

async function main() {
  await mkdir(TARGET, { recursive: true })
  const work = join(tmpdir(), `id8-icons-${Date.now()}`)
  await mkdir(work, { recursive: true })

  const claimed = new Map() // serviceId -> chosen filename (so we keep first match)
  const summary = []

  for (const src of SOURCES) {
    const zip = join(work, `${src.name}.zip`)
    const out = join(work, src.name)
    console.log(`[${src.name}] downloading ${src.url}`)
    await download(src.url, zip)
    const sz = (await stat(zip)).size
    console.log(`[${src.name}] ${(sz / 1024).toFixed(0)} KB → extracting`)
    await mkdir(out, { recursive: true })
    unzip(zip, out)

    const svgs = await walkSvgs(out)
    console.log(`[${src.name}] ${svgs.length} svgs found`)
    // For every rule, score every svg and remember the highest-scored
    // candidate not yet beaten by a previous source.
    for (const rule of NAME_RULES) {
      let best = { score: claimed.has(rule.id) ? claimed.get(rule.id).score : 0, file: null }
      for (const svg of svgs) {
        const stem = normalizeName(basename(svg))
        const s = scoreCandidate(rule, stem)
        if (s > best.score) best = { score: s, file: svg }
      }
      if (best.file) {
        const dest = join(TARGET, `${rule.id}.svg`)
        await copyFile(best.file, dest)
        claimed.set(rule.id, { score: best.score, source: basename(best.file) })
      }
    }
  }

  console.log('\nMapped:')
  const lines = []
  for (const [id, v] of claimed) lines.push(`${id.padEnd(26)} ←  ${v.source}  (score=${v.score})`)
  for (const line of lines.sort()) console.log('  ' + line)
  console.log(`\nTotal: ${claimed.size} icons placed in ${TARGET}`)

  await rm(work, { recursive: true, force: true })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
