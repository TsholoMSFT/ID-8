/**
 * Client wrapper for the /api/image endpoint (gpt-image-1-mini).
 * Provides high-level helpers for executive cover art, journey milestone
 * illustrations, and blueprint concept sketches, plus a small localStorage
 * cache so repeated renders are instant and free.
 */

const STYLE_PROMPT =
  'Microsoft modern, abstract gradient, executive presentation aesthetic, clean, professional, no text, no logos, soft lighting, depth of field'

const CACHE_PREFIX = 'id8-img-cache:v2:'
const CACHE_BUDGET_BYTES = 5 * 1024 * 1024 // 5 MB

export interface GeneratedImage {
  b64: string
  url?: string
  revisedPrompt?: string
}

export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024'

interface ImageRequest {
  prompt: string
  size?: ImageSize
  quality?: 'low' | 'medium' | 'high'
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function readCache(key: string): GeneratedImage | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as GeneratedImage
  } catch {
    return null
  }
}

function writeCache(key: string, value: GeneratedImage): void {
  try {
    const payload = JSON.stringify(value)
    if (payload.length > CACHE_BUDGET_BYTES) return
    // Best-effort eviction: if quota exceeded, drop one cached entry and retry.
    try {
      localStorage.setItem(CACHE_PREFIX + key, payload)
    } catch {
      const victim = Object.keys(localStorage).find((k) => k.startsWith(CACHE_PREFIX))
      if (victim) localStorage.removeItem(victim)
      try {
        localStorage.setItem(CACHE_PREFIX + key, payload)
      } catch {
        /* give up silently */
      }
    }
  } catch {
    /* ignore */
  }
}

async function generateImage(req: ImageRequest): Promise<GeneratedImage> {
  const cacheKey = await sha256(JSON.stringify(req))
  const cached = readCache(cacheKey)
  if (cached) return cached

  const res = await fetch('/api/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.detail || j?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(`Image generation failed (${res.status}): ${detail}`)
  }
  const data = (await res.json()) as { images: GeneratedImage[] }
  const image = data.images?.[0]
  if (!image?.b64) throw new Error('Image generation returned no data')
  writeCache(cacheKey, image)
  return image
}

function compose(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(', ')
}

export interface HeroImageOptions {
  industry?: string
  customerName?: string
  theme?: string
}

export async function generateHeroImage(opts: HeroImageOptions = {}): Promise<GeneratedImage> {
  const subject = compose(
    'wide cinematic hero composition',
    opts.industry && `${opts.industry} industry context`,
    opts.theme && `theme: ${opts.theme}`,
    opts.customerName && `evoking enterprise transformation for ${opts.customerName}`,
    'flowing abstract data ribbons, blue and teal accents'
  )
  return generateImage({
    prompt: `${subject}. ${STYLE_PROMPT}.`,
    size: '1536x1024',
    quality: 'low',
  })
}

export interface JourneyMilestoneOptions {
  phase: string
  useCase?: string
  industry?: string
}

export async function generateJourneyMilestone(opts: JourneyMilestoneOptions): Promise<GeneratedImage> {
  const subject = compose(
    `square illustration symbolizing the "${opts.phase}" phase of a customer journey`,
    opts.useCase && `for the use case: ${opts.useCase}`,
    opts.industry && `${opts.industry} industry`,
    'soft geometric shapes, gradient backdrop'
  )
  return generateImage({
    prompt: `${subject}. ${STYLE_PROMPT}.`,
    size: '1024x1024',
    quality: 'low',
  })
}

export interface BlueprintSketchOptions {
  capabilities: string[]
  industry?: string
}

export async function generateBlueprintSketch(opts: BlueprintSketchOptions): Promise<GeneratedImage> {
  const caps = opts.capabilities.slice(0, 6).join(', ')
  const subject = compose(
    'isometric concept sketch of a modular solution architecture',
    `key capabilities: ${caps}`,
    opts.industry && `${opts.industry} industry`,
    'connected nodes, subtle grid, depth, layered translucent panels'
  )
  return generateImage({
    prompt: `${subject}. ${STYLE_PROMPT}.`,
    size: '1536x1024',
    quality: 'low',
  })
}
