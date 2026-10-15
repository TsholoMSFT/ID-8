import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { makeCorsHeaders, safeErrorMessage } from '../lib/xml-utils'

const corsHeaders = makeCorsHeaders('POST, OPTIONS')

const DOC_INTELLIGENCE_ENDPOINT = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
const DOC_INTELLIGENCE_KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY

// The analyze URL below targets the v4.0 `documentintelligence/...` path, which
// requires the 2024-11-30 (GA) API version. (The older `2023-07-31` GA used the
// `formrecognizer/...` path and is incompatible with this route.)
const API_VERSION = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION || '2024-11-30'

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function getHeaderCaseInsensitive(headers: Headers, name: string): string | null {
  const direct = headers.get(name)
  if (direct) return direct
  // Some environments vary casing
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === name.toLowerCase()) return value
  }
  return null
}

function extractContentFromReadResult(result: any): string {
  const content = result?.analyzeResult?.content
  if (typeof content === 'string' && content.trim()) return content.trim()

  // Fallback: try to stitch lines if content is absent
  const lines: string[] = []
  const pages = result?.analyzeResult?.pages
  if (Array.isArray(pages)) {
    for (const page of pages) {
      const pageLines = page?.lines
      if (Array.isArray(pageLines)) {
        for (const line of pageLines) {
          if (line?.content) lines.push(String(line.content))
        }
      }
    }
  }

  return lines.join('\n').trim()
}

async function ocrHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders }
  }

  if (req.method !== 'POST') {
    return {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      jsonBody: { error: 'Method not allowed' },
    }
  }

  if (!DOC_INTELLIGENCE_ENDPOINT || !DOC_INTELLIGENCE_KEY) {
    return {
      status: 501,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      jsonBody: {
        error: 'OCR is not configured on the server',
        details:
          'Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY in the Function App settings.',
      },
    }
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as any

    if (!file || typeof file.arrayBuffer !== 'function') {
      return {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        jsonBody: { error: "Missing 'file' in multipart/form-data" },
      }
    }

    const contentType = typeof file.type === 'string' && file.type ? file.type : 'application/octet-stream'

    const MAX_BYTES = 10 * 1024 * 1024
    const size = typeof file.size === 'number' ? file.size : undefined
    if (typeof size === 'number' && size > MAX_BYTES) {
      return {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        jsonBody: { error: 'File too large', details: 'Max 10MB per file.' },
      }
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    const analyzeUrl = `${DOC_INTELLIGENCE_ENDPOINT}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${API_VERSION}&pages=1-10`

    context.log(`OCR analyze start: ${file.name || '(unnamed)'} (${contentType})`) 

    const start = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': DOC_INTELLIGENCE_KEY,
        'Content-Type': contentType,
      },
      body: bytes,
      signal: AbortSignal.timeout(10_000),
    })

    if (start.status !== 202) {
      const details = await start.text().catch(() => '')
      return {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        jsonBody: {
          error: 'Document Intelligence analyze request failed',
          details: details || start.statusText,
        },
      }
    }

    const operationLocation =
      getHeaderCaseInsensitive(start.headers, 'operation-location') ||
      getHeaderCaseInsensitive(start.headers, 'Operation-Location')

    if (!operationLocation) {
      return {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        jsonBody: { error: 'Missing operation-location header from Document Intelligence' },
      }
    }

    const maxAttempts = 20
    const delayMs = 750

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const poll = await fetch(operationLocation, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': DOC_INTELLIGENCE_KEY,
        },
        signal: AbortSignal.timeout(5_000),
      })

      const payload = (await poll.json().catch(() => ({}))) as any
      const status = String(payload?.status || '').toLowerCase()

      if (status === 'succeeded') {
        const text = extractContentFromReadResult(payload)
        return {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          jsonBody: { text },
        }
      }

      if (status === 'failed') {
        return {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          jsonBody: { error: 'OCR failed', details: payload?.error || payload },
        }
      }

      if (attempt < maxAttempts) {
        await sleep(delayMs)
      }
    }

    return {
      status: 504,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      jsonBody: { error: 'OCR timed out' },
    }
  } catch (error: any) {
    context.error('OCR function error:', error)
    return {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      jsonBody: { error: safeErrorMessage(error) },
    }
  }
}

app.http('ocr', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'ocr',
  handler: ocrHandler,
})
