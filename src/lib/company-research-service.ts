/**
 * Company Research Service
 * Extracts and summarizes company information from various sources:
 * - Pasted text (news articles, website content)
 * - Uploaded documents (TXT, MD, CSV, JSON)
 * - RSS feeds (via Azure Logic Apps + Blob Storage)
 */

import { callAIForTask } from './openai-service'
import { parseJsonLenient } from './lenient-json'
import { extractTextFromAttachments } from './attachment-text'
import type { EntityType } from './types'
import { buildCompanyInsightPrompt, researchItemsToText, type ResearchFeedItem } from './company-research-prompt'

// ============================================================================
// TYPES
// ============================================================================

export interface CompanyInsight {
  id: string
  category: 'strategy' | 'financial' | 'technology' | 'market' | 'operations' | 'culture' | 'news'
  title: string
  summary: string
  relevanceToAI: string
  potentialUseCases: string[]
  source: string
  confidence: 'high' | 'medium' | 'low'
  extractedDate: string
}

export interface CompanyResearchContext {
  companyName: string
  industry?: string
  insights: CompanyInsight[]
  rawSources: CompanySource[]
  summary?: string
  lastUpdated: string
}

export interface CompanySource {
  id: string
  type: 'text' | 'url' | 'document' | 'rss'
  title: string
  content: string
  url?: string
  fileName?: string
  addedAt: string
}

export type RSSFeedItem = ResearchFeedItem

export interface FetchRSSFromBlobStorageResult {
  items: RSSFeedItem[]
  message?: string
  blobName?: string
  lastModified?: string
  totalBlobs?: number
  diagnostics?: {
    sizeBytes?: number
    hasRss?: boolean
    hasChannel?: boolean
    hasAtomFeed?: boolean
    itemTagCount?: number
    entryTagCount?: number
  }
}

export interface RSSFeedConfig {
  name: string
  urlTemplate: string
  description: string
}

// ============================================================================
// INSIGHT EXTRACTION
// ============================================================================

/**
 * Entity-aware guidance injected into the extraction prompt so research works
 * for non-listed entities (private companies, government, non-profits) without
 * assuming public-market data.
 */
function buildEntityResearchGuidance(entityType: EntityType | undefined, companyName: string): string {
  switch (entityType) {
    case 'private-company':
      return `\nENTITY CONTEXT: ${companyName} is a PRIVATELY HELD company with no public stock listing — do not assume market-cap, share-price, or analyst-rating data. Base insights on operational, strategic, technology, hiring, and news signals.`
    case 'government':
      return `\nENTITY CONTEXT: ${companyName} is a GOVERNMENT / PUBLIC-SECTOR organization — frame insights around public-service outcomes, citizen/constituent impact, regulatory mandates, and budget allocation (not revenue or profit).`
    case 'non-profit':
      return `\nENTITY CONTEXT: ${companyName} is a NON-PROFIT / NGO — frame insights around mission impact, beneficiaries and donors, grants and funding, and operational efficiency (not profit).`
    default:
      return ''
  }
}

/**
 * Extract business insights from text content using AI
 */
export async function extractInsightsFromText(
  content: string,
  companyName: string,
  sourceTitle: string = 'Pasted Content',
  entityType?: EntityType
): Promise<CompanyInsight[]> {
  if (!content.trim()) {
    return []
  }

  const getInsightsArray = (parsed: any): any[] | undefined => {
    if (Array.isArray(parsed)) return parsed
    if (!parsed || typeof parsed !== 'object') return undefined

    const directCandidates = [parsed.insights, parsed.Insights, parsed.items, parsed.results]
    for (const candidate of directCandidates) {
      if (Array.isArray(candidate)) return candidate
      if (candidate && typeof candidate === 'object') {
        const nestedCandidates = [candidate.insights, candidate.items, candidate.results, candidate.data]
        for (const nested of nestedCandidates) {
          if (Array.isArray(nested)) return nested
        }
      }
    }

    return undefined
  }

  const entityGuidance = buildEntityResearchGuidance(entityType, companyName)

  const prompt = buildCompanyInsightPrompt(content, companyName, sourceTitle, entityGuidance)

  try {
    const raw = await callAIForTask('extraction', prompt, {
      expectJson: true,
      systemPrompt: 'Return only strict JSON. No markdown. No prose outside JSON.',
    })

    const parsed = parseJsonLenient<any>(raw)

    const insightsRaw = getInsightsArray(parsed)

    if (!insightsRaw) {
      throw new Error('The AI response did not contain an insights list.')
    }

    return insightsRaw.map((insight: any) => {
      const potentialUseCases = Array.isArray(insight?.potentialUseCases)
        ? insight.potentialUseCases
        : typeof insight?.potentialUseCases === 'string'
          ? [insight.potentialUseCases]
          : []

      return {
      id: crypto.randomUUID(),
      category: insight.category || 'news',
      title: (insight.title || 'Untitled Insight').toString().trim(),
      summary: (insight.summary || '').toString().trim(),
      relevanceToAI: (insight.relevanceToAI || '').toString().trim(),
      potentialUseCases,
      source: sourceTitle,
      confidence: insight.confidence || 'medium',
      extractedDate: new Date().toISOString(),
      }
    })
  } catch (error) {
    console.error('Failed to extract insights:', error)
    throw new Error(`Failed to extract insights: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// ============================================================================
// FILE HANDLING
// ============================================================================

/**
 * Extract text from uploaded files.
 * Plain text (.txt, .md, .csv, .json) is read directly; rich documents
 * (.pdf, .docx, .xlsx) and images are parsed client-side where possible and
 * fall back to the server-side Document Intelligence OCR endpoint (/api/ocr)
 * via src/lib/attachment-text.ts.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase()

  switch (extension) {
    case 'txt':
    case 'md':
    case 'csv':
      return await file.text()

    case 'json': {
      const jsonContent = await file.text()
      try {
        const parsed = JSON.parse(jsonContent)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return jsonContent
      }
    }

    case 'pdf':
    case 'docx':
    case 'doc':
    case 'xlsx':
    case 'xls':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'gif':
    case 'tiff':
    case 'bmp': {
      const { results, combinedText, warnings } = await extractTextFromAttachments([file])
      const text = combinedText.trim()
      if (!text) {
        const reason = results[0]?.warnings?.join(' ') || warnings.join(' ') || 'No extractable text found.'
        throw new Error(`Could not extract text from ${file.name}. ${reason}`)
      }
      return text
    }

    default:
      throw new Error(`Unsupported file type: .${extension}. Supported types: .txt, .md, .csv, .json, .pdf, .docx, .xlsx, images.`)
  }
}

// ============================================================================
// RESEARCH SUMMARY
// ============================================================================

/**
 * Generate a research summary for the discovery session
 */
export async function generateResearchSummary(
  companyName: string,
  insights: CompanyInsight[]
): Promise<string> {
  if (insights.length === 0) {
    return `No research data available for ${companyName}. Add company information to generate insights.`
  }

  const insightsSummary = insights
    .map(i => `- [${i.category.toUpperCase()}] ${i.title}: ${i.summary}`)
    .join('\n')

  const prompt = `You are preparing an executive briefing for an AI discovery session with ${companyName}.

EXTRACTED INSIGHTS:
${insightsSummary}

TASK: Write a concise research summary (3-4 paragraphs) that:
1. Summarizes the company's current situation and strategic priorities
2. Highlights technology and digital transformation initiatives
3. Identifies key pain points and opportunities for AI/automation
4. Suggests areas to explore during the discovery session

Write in a professional, actionable tone. Focus on insights relevant to Microsoft AI solutions.`

  try {
    const result = await callAIForTask('analysis', prompt)
    return result
  } catch (error) {
    console.error('Failed to generate summary:', error)
    return `Research summary generation failed. ${insights.length} insights available for review.`
  }
}

// ============================================================================
// RSS FEED HANDLING
// ============================================================================

/**
 * Fetch RSS feed items from Azure Blob Storage
 * (Logic App stores fetched RSS as XML in blob storage)
 * @param apiEndpoint - Base API URL (default: '/api')
 * @param companyName - Optional company name to filter RSS feeds
 */
export async function fetchRSSFromBlobStorage(
  apiEndpoint: string = '/api',
  companyName?: string
): Promise<FetchRSSFromBlobStorageResult> {
  try {
    const url = new URL(`${apiEndpoint}/rss-feeds`, window.location.origin);
    if (companyName) {
      url.searchParams.set('company', companyName);
    }
    
    const response = await fetch(url.toString())

    // Never throw on non-2xx — backend already returns 200 with diagnostics in
    // every recoverable failure mode. A non-2xx here means the proxy or runtime
    // itself failed; surface that as an inline empty-state, not a red toast.
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const contentType = response.headers.get('content-type') || ''
      // A 404 that returns the SPA's index.html means the request never reached
      // the Functions backend — show a clear reason instead of dumping raw HTML.
      const looksLikeHtml = contentType.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(text)
      const detail = looksLikeHtml
        ? 'The research backend is offline or not deployed.'
        : text.slice(0, 200).trim()
      return {
        items: [],
        message: `RSS service unavailable (HTTP ${response.status})${detail ? `. ${detail}` : ''}`,
      }
    }

    const data = await response.json().catch(() => ({} as any))

    const items = Array.isArray(data?.items) ? (data.items as RSSFeedItem[]) : []

    return {
      items,
      message: typeof data?.message === 'string' ? data.message : undefined,
      blobName: typeof data?.blobName === 'string' ? data.blobName : undefined,
      lastModified: typeof data?.lastModified === 'string' ? data.lastModified : undefined,
      totalBlobs: typeof data?.totalBlobs === 'number' ? data.totalBlobs : undefined,
      diagnostics: data?.diagnostics && typeof data.diagnostics === 'object' ? data.diagnostics : undefined,
    }
  } catch (error) {
    console.error('Failed to fetch RSS from blob storage:', error)
    return {
      items: [],
      message: error instanceof Error ? error.message : 'Failed to fetch RSS from blob storage',
    }
  }
}

// ============================================================================
// SEMANTIC NEWS SEARCH (blob-backed vector search; no Azure AI Search needed)
// ============================================================================

export interface NewsSearchResultItem {
  title: string
  description: string
  link: string
  pubDate: string
  score: number
}

export interface NewsSearchResponse {
  query: string
  company: string | null
  method?: 'vector' | 'keyword'
  model?: string
  totalIndexed?: number
  companiesSearched?: number
  results: NewsSearchResultItem[]
  message?: string
}

/**
 * Semantic search over the cached company-news corpus via /api/news-search.
 * Backed by text-embedding-3-small + blob storage (a low-cost alternative to
 * Azure AI Search). Never throws on a recoverable failure — returns an empty
 * result set with a diagnostic message instead.
 *
 * @param companyName - Scope the search to one company (omit for corpus-wide).
 * @param query - The natural-language query to rank news by.
 * @param options - apiEndpoint (default '/api') and k (max results, default 8).
 */
export async function searchCompanyNews(
  companyName: string,
  query: string,
  options: { apiEndpoint?: string; k?: number } = {}
): Promise<NewsSearchResponse> {
  const apiEndpoint = options.apiEndpoint ?? '/api'
  const k = options.k ?? 8
  try {
    const url = new URL(`${apiEndpoint}/news-search`, window.location.origin)
    if (companyName?.trim()) url.searchParams.set('company', companyName.trim())
    url.searchParams.set('q', query.trim())
    url.searchParams.set('k', String(k))

    const response = await fetch(url.toString())
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const contentType = response.headers.get('content-type') || ''
      const looksLikeHtml = contentType.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(text)
      const detail = looksLikeHtml ? 'The research backend is offline or not deployed.' : text.slice(0, 200).trim()
      return {
        query,
        company: companyName?.trim() || null,
        results: [],
        message: `News search unavailable (HTTP ${response.status})${detail ? `. ${detail}` : ''}`,
      }
    }

    const data = await response.json().catch(() => ({} as any))
    return {
      query: typeof data?.query === 'string' ? data.query : query,
      company: typeof data?.company === 'string' ? data.company : (companyName?.trim() || null),
      method: data?.method === 'vector' || data?.method === 'keyword' ? data.method : undefined,
      model: typeof data?.model === 'string' ? data.model : undefined,
      totalIndexed: typeof data?.totalIndexed === 'number' ? data.totalIndexed : undefined,
      companiesSearched: typeof data?.companiesSearched === 'number' ? data.companiesSearched : undefined,
      results: Array.isArray(data?.results) ? (data.results as NewsSearchResultItem[]) : [],
      message: typeof data?.message === 'string' ? data.message : undefined,
    }
  } catch (error) {
    console.error('Failed to search company news:', error)
    return {
      query,
      company: companyName?.trim() || null,
      results: [],
      message: error instanceof Error ? error.message : 'Failed to search company news',
    }
  }
}

// ============================================================================
// REGULATORY FILINGS (SEC EDGAR + JSE/SENS via /api/filings-feeds)
// ============================================================================

export interface FetchFilingsResult {
  items: RSSFeedItem[]
  source?: string
  company?: string
  blobName?: string
  lastModified?: string
  totalBlobs?: number
  message?: string
}

/**
 * Fetch recent regulatory filings (SEC EDGAR + JSE/SENS announcements) for a
 * company via /api/filings-feeds. The backend serves cached filings from blob
 * storage (populated by the id8-filings-monitor Logic App) and falls back to
 * a live SEC EDGAR + JSE news query when no cache exists. Never throws on a
 * recoverable failure — returns an empty item list with a diagnostic message.
 *
 * @param companyName - Company to fetch filings for.
 * @param apiEndpoint - Base API URL (default '/api').
 */
export async function fetchCompanyFilings(
  companyName: string,
  apiEndpoint: string = '/api'
): Promise<FetchFilingsResult> {
  try {
    const url = new URL(`${apiEndpoint}/filings-feeds`, window.location.origin)
    if (companyName?.trim()) url.searchParams.set('company', companyName.trim())

    const response = await fetch(url.toString())
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const contentType = response.headers.get('content-type') || ''
      const looksLikeHtml = contentType.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(text)
      const detail = looksLikeHtml
        ? 'The research backend is offline or not deployed.'
        : text.slice(0, 200).trim()
      return {
        items: [],
        message: `Filings service unavailable (HTTP ${response.status})${detail ? `. ${detail}` : ''}`,
      }
    }

    const data = await response.json().catch(() => ({} as any))
    return {
      items: Array.isArray(data?.items) ? (data.items as RSSFeedItem[]) : [],
      source: typeof data?.source === 'string' ? data.source : undefined,
      company: typeof data?.company === 'string' ? data.company : undefined,
      blobName: typeof data?.blobName === 'string' ? data.blobName : undefined,
      lastModified: typeof data?.lastModified === 'string' ? data.lastModified : undefined,
      totalBlobs: typeof data?.totalBlobs === 'number' ? data.totalBlobs : undefined,
      message: typeof data?.message === 'string' ? data.message : undefined,
    }
  } catch (error) {
    console.error('Failed to fetch company filings:', error)
    return {
      items: [],
      message: error instanceof Error ? error.message : 'Failed to fetch company filings',
    }
  }
}

/**
 * Parse RSS XML content into feed items
 */
export function parseRSSXml(xmlContent: string): RSSFeedItem[] {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlContent, 'text/xml')
    
    // Check for parsing errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      console.error('RSS XML parse error:', parseError.textContent)
      return []
    }

    const items = doc.querySelectorAll('item')
    
    return Array.from(items).map(item => ({
      title: item.querySelector('title')?.textContent || 'Untitled',
      description: stripHtml(item.querySelector('description')?.textContent || ''),
      link: item.querySelector('link')?.textContent || '',
      pubDate: item.querySelector('pubDate')?.textContent || new Date().toISOString(),
    }))
  } catch (error) {
    console.error('Failed to parse RSS:', error)
    return []
  }
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Convert RSS items to extractable text for insight generation
 */
export function rssItemsToText(items: RSSFeedItem[], maxItems: number = 10): string {
  return researchItemsToText(items, maxItems)
}

// ============================================================================
// PUBLIC SECTOR / NON-LISTED ENTITY INTELLIGENCE (via /api/public-sector)
// ============================================================================

export interface PublicSectorPortal {
  name: string
  url: string
  description?: string
}

export interface FetchPublicSectorResult {
  items: RSSFeedItem[]
  portals: PublicSectorPortal[]
  entity?: string
  entityType?: string
  isPublicSector?: boolean
  source?: string
  message?: string
}

/**
 * Fetch public-sector intelligence for a NON-LISTED entity (government
 * department, agency, provincial / municipal government, state-owned
 * enterprise) via /api/public-sector. Aggregates Parliamentary Monitoring Group
 * oversight records, public-sector-tuned South-African news and authoritative
 * open-government portal links — the cases the SEC/JSE filings path and the
 * ticker-based financials path cannot serve. Never throws on a recoverable
 * failure — returns an empty list with a diagnostic message.
 *
 * @param entity - Entity to research (e.g. 'SASSA', 'Western Cape Government').
 * @param apiEndpoint - Base API URL (default '/api').
 */
export async function fetchPublicSectorSignals(
  entity: string,
  apiEndpoint: string = '/api'
): Promise<FetchPublicSectorResult> {
  try {
    const url = new URL(`${apiEndpoint}/public-sector`, window.location.origin)
    if (entity?.trim()) url.searchParams.set('entity', entity.trim())

    const response = await fetch(url.toString())
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const contentType = response.headers.get('content-type') || ''
      const looksLikeHtml = contentType.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(text)
      const detail = looksLikeHtml
        ? 'The research backend is offline or not deployed.'
        : text.slice(0, 200).trim()
      return {
        items: [],
        portals: [],
        message: `Public-sector service unavailable (HTTP ${response.status})${detail ? `. ${detail}` : ''}`,
      }
    }

    const data = await response.json().catch(() => ({} as any))
    return {
      items: Array.isArray(data?.items) ? (data.items as RSSFeedItem[]) : [],
      portals: Array.isArray(data?.portals) ? (data.portals as PublicSectorPortal[]) : [],
      entity: typeof data?.entity === 'string' ? data.entity : undefined,
      entityType: typeof data?.entityType === 'string' ? data.entityType : undefined,
      isPublicSector: typeof data?.isPublicSector === 'boolean' ? data.isPublicSector : undefined,
      source: typeof data?.source === 'string' ? data.source : undefined,
      message: typeof data?.message === 'string' ? data.message : undefined,
    }
  } catch (error) {
    console.error('Failed to fetch public-sector signals:', error)
    return {
      items: [],
      portals: [],
      message: error instanceof Error ? error.message : 'Failed to fetch public-sector signals',
    }
  }
}

// ============================================================================
// COMPANY PROFILE (works for public AND private / non-listed companies)
// ============================================================================

export interface CompanyProfileRegistryRecord {
  registry: string
  name: string
  companyNumber?: string
  jurisdiction?: string
  status?: string
  companyType?: string
  incorporatedOn?: string
  registeredAddress?: string
  sicCodes?: string[]
  url?: string
}

export interface CompanyProfileFormDFiling {
  issuer: string
  filedAt?: string
  accessionNo?: string
  cik?: string
  url?: string
}

export interface CompanyProfile {
  query: { company: string; country?: string }
  identity: {
    name: string
    aliases?: string[]
    description?: string
    website?: string
    industry?: string
    founded?: string
    headquarters?: string
    employees?: number
  }
  isPublic: boolean
  ticker?: { symbol: string; exchange?: string }
  registry: CompanyProfileRegistryRecord[]
  privatePlacements: CompanyProfileFormDFiling[]
  sources: { name: string; url?: string }[]
  diagnostics: Record<string, string>
  fetchedAt: string
}

export interface FetchCompanyProfileResult {
  profile?: CompanyProfile
  message?: string
}

/**
 * Resolve a company by NAME (+ optional ISO country code) via the unified
 * /api/company-profile aggregator. Works for listed and non-listed companies
 * and never throws — backend failures are surfaced as an inline message.
 */
export async function fetchCompanyProfile(
  companyName: string,
  options: { country?: string; apiEndpoint?: string } = {}
): Promise<FetchCompanyProfileResult> {
  const { country, apiEndpoint = '/api' } = options
  if (!companyName || companyName.trim().length < 2) {
    return { message: 'Enter a company name (at least 2 characters).' }
  }
  try {
    const url = new URL(`${apiEndpoint}/company-profile`, window.location.origin)
    url.searchParams.set('company', companyName.trim())
    if (country) url.searchParams.set('country', country)

    const response = await fetch(url.toString())
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const contentType = response.headers.get('content-type') || ''
      const looksLikeHtml = contentType.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(text)
      const detail = looksLikeHtml ? 'The research backend is offline or not deployed.' : text.slice(0, 200).trim()
      return { message: `Company profile service unavailable (HTTP ${response.status})${detail ? `. ${detail}` : ''}` }
    }
    const data = (await response.json()) as CompanyProfile
    return { profile: data }
  } catch (error) {
    console.error('Failed to fetch company profile:', error)
    return { message: error instanceof Error ? error.message : 'Failed to fetch company profile' }
  }
}

/**
 * Flatten a CompanyProfile into text suitable for AI insight extraction.
 */
export function companyProfileToText(profile: CompanyProfile): string {
  const id = profile.identity
  const lines: string[] = []
  lines.push(`COMPANY: ${id.name}`)
  if (id.description) lines.push(`DESCRIPTION: ${id.description}`)
  if (id.industry) lines.push(`INDUSTRY: ${id.industry}`)
  if (id.headquarters) lines.push(`HEADQUARTERS: ${id.headquarters}`)
  if (id.founded) lines.push(`FOUNDED: ${id.founded}`)
  if (typeof id.employees === 'number') lines.push(`EMPLOYEES: ${id.employees.toLocaleString()}`)
  if (id.website) lines.push(`WEBSITE: ${id.website}`)
  lines.push(
    `LISTING STATUS: ${
      profile.isPublic
        ? 'Public' + (profile.ticker ? ` (${profile.ticker.symbol}${profile.ticker.exchange ? ' on ' + profile.ticker.exchange : ''})` : '')
        : 'Private / non-listed'
    }`
  )
  if (profile.registry.length) {
    lines.push('\nREGISTRY RECORDS:')
    for (const r of profile.registry.slice(0, 5)) {
      lines.push(
        `- [${r.registry}] ${r.name}${r.companyNumber ? ` (No. ${r.companyNumber})` : ''}${r.status ? ` \u2014 ${r.status}` : ''}` +
          `${r.jurisdiction ? `, ${r.jurisdiction}` : ''}${r.incorporatedOn ? `, inc. ${r.incorporatedOn}` : ''}` +
          `${r.sicCodes?.length ? `, SIC ${r.sicCodes.join('/')}` : ''}`
      )
    }
  }
  if (profile.privatePlacements.length) {
    lines.push('\nSEC FORM D (PRIVATE PLACEMENTS):')
    for (const f of profile.privatePlacements.slice(0, 5)) {
      lines.push(`- ${f.issuer}${f.filedAt ? ` filed ${f.filedAt}` : ''}`)
    }
  }
  return lines.join('\n')
}

// ============================================================================
// SUGGESTED RSS FEEDS
// ============================================================================

export const SUGGESTED_RSS_FEEDS: RSSFeedConfig[] = [
  {
    name: 'Google News (Company)',
    urlTemplate: 'https://news.google.com/rss/search?q={company}+when:7d&hl=en-US&gl=US&ceid=US:en',
    description: 'Google News results for the company (last 7 days)',
  },
  {
    name: 'Google News (Company + AI)',
    urlTemplate: 'https://news.google.com/rss/search?q={company}+AI+OR+artificial+intelligence&hl=en-US&gl=US&ceid=US:en',
    description: 'Company news related to AI initiatives',
  },
  {
    name: 'Google News (Company + Digital Transformation)',
    urlTemplate: 'https://news.google.com/rss/search?q={company}+digital+transformation&hl=en-US&gl=US&ceid=US:en',
    description: 'Company digital transformation news',
  },
]

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create empty research context
 */
export function createEmptyResearchContext(companyName: string): CompanyResearchContext {
  return {
    companyName,
    insights: [],
    rawSources: [],
    lastUpdated: new Date().toISOString(),
  }
}

/**
 * Get category color for UI
 */
export function getCategoryColor(category: CompanyInsight['category']): string {
  const colors: Record<string, string> = {
    strategy: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    financial: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    technology: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    market: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    operations: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    culture: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
    news: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  }
  return colors[category] || colors.news
}

/**
 * Format insights for use case generation context
 */
export function formatInsightsForContext(insights: CompanyInsight[]): string {
  if (insights.length === 0) return ''
  
  return `
COMPANY RESEARCH INSIGHTS:
${insights.map(i => `
[${i.category.toUpperCase()}] ${i.title}
${i.summary}
AI Relevance: ${i.relevanceToAI}
Suggested Use Cases: ${i.potentialUseCases.join(', ')}
`).join('\n')}
`
}
