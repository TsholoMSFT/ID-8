/**
 * Shared XML / RSS / Atom parsing utilities.
 * Used by rss-feeds and regulatory-feeds Azure Functions.
 */

// ── Security ────────────────────────────────────────────────────────────────

/**
 * Allowed CORS origin. In production (Azure SWA) the API is served from the same
 * origin so this is largely a no-op. During local dev, set ALLOWED_ORIGIN to
 * "http://localhost:5173" (or whatever Vite serves on).
 */
export function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN?.trim() || 'http://localhost:5173'
}

export function makeCorsHeaders(methods = 'GET, OPTIONS'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(),
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

/**
 * Return a safe error message for HTTP responses — never leak stack traces
 * or internal details to the client.
 */
export function safeErrorMessage(error: unknown, fallback = 'Internal server error'): string {
  // Surface the message when it's a known-safe, developer-written string.
  // For other errors, include a sanitized summary so callers can debug.
  if (error instanceof Error) {
    const msg = error.message
    // Whitelist specific prefixes we control
    if (
      msg.startsWith('HTTP ') ||
      msg.startsWith('Missing ') ||
      msg.startsWith('No ') ||
      msg.startsWith('OCR ') ||
      msg.startsWith('File ') ||
      msg.startsWith('Azure ') ||
      msg.startsWith('API ') ||
      msg.startsWith('Prompt ') ||
      msg.startsWith('Model ') ||
      msg.startsWith('Timeout')
    ) {
      return msg
    }
    // For unrecognised errors, return the fallback + a short hint (no stack traces)
    const hint = msg.length > 0 && msg.length < 200 ? msg : ''
    return hint ? `${fallback}: ${hint}` : fallback
  }
  return fallback
}

// ── Stream helpers ──────────────────────────────────────────────────────────

export async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

// ── Tag extraction ──────────────────────────────────────────────────────────

/**
 * Extract text content from an XML tag, handling CDATA blocks.
 */
export function extractTag(xml: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i')
  const cdataMatch = xml.match(cdataRegex)
  if (cdataMatch) return cdataMatch[1].trim()

  const regularRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const regularMatch = xml.match(regularRegex)
  if (regularMatch) return regularMatch[1].trim()

  return ''
}

/**
 * Atom feeds often use: <link href="https://..." rel="alternate" />
 */
export function extractLinkHref(xml: string): string {
  const match = xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i)
  return match ? match[1].trim() : ''
}

// ── HTML stripping ──────────────────────────────────────────────────────────

/**
 * Strip HTML tags and decode common entities.
 * Sufficient for RSS content that is rendered as plain text.
 */
export function stripHtml(html: string): string {
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

// ── RSS / Atom parsing ──────────────────────────────────────────────────────

export interface RSSItem {
  title: string
  description: string
  link: string
  pubDate: string
}

export interface RegulatoryFeedItem extends RSSItem {
  jurisdiction: string
  source: string
}

/**
 * Parse RSS 2.0 <item> and Atom <entry> blocks into a flat array.
 */
export function parseRSSBlocks(xml: string): Array<{ kind: 'rss' | 'atom'; xml: string }> {
  const blocks: Array<{ kind: 'rss' | 'atom'; xml: string }> = []
  const rssItemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
  const atomEntryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi
  let match: RegExpExecArray | null

  while ((match = rssItemRegex.exec(xml)) !== null) {
    blocks.push({ kind: 'rss', xml: match[1] })
  }
  while ((match = atomEntryRegex.exec(xml)) !== null) {
    blocks.push({ kind: 'atom', xml: match[1] })
  }

  return blocks
}

export function parseRSSItems(xml: string): RSSItem[] {
  return parseRSSBlocks(xml).map(block => ({
    title: extractTag(block.xml, 'title') || 'Untitled',
    description: stripHtml(
      extractTag(block.xml, 'description') ||
      extractTag(block.xml, 'summary') ||
      extractTag(block.xml, 'content:encoded') ||
      extractTag(block.xml, 'content')
    ),
    link: extractTag(block.xml, 'link') || extractLinkHref(block.xml) || '',
    pubDate:
      extractTag(block.xml, 'pubDate') ||
      extractTag(block.xml, 'published') ||
      extractTag(block.xml, 'updated') ||
      extractTag(block.xml, 'dc:date') ||
      new Date().toISOString(),
  }))
}

export function parseRegulatoryRSSItems(
  xml: string,
  jurisdiction: string,
  sourceName: string
): RegulatoryFeedItem[] {
  return parseRSSBlocks(xml).map(block => ({
    title: extractTag(block.xml, 'title') || 'Untitled',
    description: stripHtml(
      extractTag(block.xml, 'description') ||
      extractTag(block.xml, 'summary') ||
      extractTag(block.xml, 'content:encoded') ||
      extractTag(block.xml, 'content')
    ),
    link: extractTag(block.xml, 'link') || extractLinkHref(block.xml) || '',
    pubDate:
      extractTag(block.xml, 'pubDate') ||
      extractTag(block.xml, 'published') ||
      extractTag(block.xml, 'updated') ||
      new Date().toISOString(),
    jurisdiction,
    source: sourceName,
  }))
}
