import readXlsxFile from 'read-excel-file'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'

// Configure PDF.js worker (browser)
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export type AttachmentTextSource =
  | 'text'
  | 'word'
  | 'excel'
  | 'pdf'
  | 'ocr'
  | 'unsupported'

export interface AttachmentTextResult {
  fileName: string
  mimeType: string
  source: AttachmentTextSource
  text: string
  warnings: string[]
}

export interface ExtractAttachmentsOptions {
  maxFileBytes?: number
  maxCombinedChars?: number
  enableOcr?: boolean
  ocrEndpoint?: string
}

const DEFAULTS: Required<ExtractAttachmentsOptions> = {
  maxFileBytes: 10 * 1024 * 1024,
  maxCombinedChars: 60_000,
  enableOcr: true,
  ocrEndpoint: '/api/ocr',
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + `\n\n[...truncated to ${maxChars.toLocaleString()} chars]`
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (textContent.items as any[])
      .filter((item) => item && typeof item.str === 'string')
      .map((item) => item.str as string)
    fullText += items.join(' ') + '\n\n'
  }

  return fullText.trim()
}

async function extractWordText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return (result.value || '').trim()
}

async function extractExcelText(file: File): Promise<string> {
  const rows = (await readXlsxFile(file)) as unknown[][]
  const MAX_ROWS = 2000
  const MAX_COLS = 50

  const safeRows = (rows || []).slice(0, MAX_ROWS).map((row) =>
    (Array.isArray(row) ? row : [])
      .slice(0, MAX_COLS)
      .map((cell) => String(cell ?? '').trim())
  )

  return safeRows.map((r) => r.join('\t')).join('\n').trim()
}

async function tryOcr(file: File, endpoint: string): Promise<string> {
  const form = new FormData()
  form.append('file', file, file.name)

  const response = await fetch(endpoint, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`OCR request failed (${response.status}): ${message || response.statusText}`)
  }

  const data = (await response.json()) as { text?: string }
  return (data.text || '').trim()
}

export async function extractTextFromAttachments(
  files: File[],
  options: ExtractAttachmentsOptions = {}
): Promise<{ results: AttachmentTextResult[]; combinedText: string; warnings: string[] }> {
  const cfg = { ...DEFAULTS, ...options }

  const warnings: string[] = []
  const results: AttachmentTextResult[] = []

  for (const file of files) {
    const fileWarnings: string[] = []

    if (file.size > cfg.maxFileBytes) {
      results.push({
        fileName: file.name,
        mimeType: file.type,
        source: 'unsupported',
        text: '',
        warnings: [`Skipped: file too large (max ${(cfg.maxFileBytes / (1024 * 1024)).toFixed(0)}MB).`],
      })
      continue
    }

    try {
      const lowerName = file.name.toLowerCase()

      // Plain text / markdown
      if (file.type.startsWith('text/') || lowerName.endsWith('.md') || lowerName.endsWith('.txt')) {
        const text = (await file.text()).trim()
        results.push({ fileName: file.name, mimeType: file.type, source: 'text', text, warnings: [] })
        continue
      }

      // Word
      if (
        file.type ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerName.endsWith('.docx')
      ) {
        const text = await extractWordText(file)
        results.push({ fileName: file.name, mimeType: file.type, source: 'word', text, warnings: [] })
        continue
      }

      // Excel
      if (
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        lowerName.endsWith('.xlsx') ||
        lowerName.endsWith('.xls')
      ) {
        const text = await extractExcelText(file)
        results.push({ fileName: file.name, mimeType: file.type, source: 'excel', text, warnings: [] })
        continue
      }

      // PDF
      if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
        const text = await extractPdfText(file)
        if (!text) {
          fileWarnings.push('No text found in PDF (may be scanned/image-only).')
          if (cfg.enableOcr) {
            try {
              const ocrText = await tryOcr(file, cfg.ocrEndpoint)
              fileWarnings.push('OCR processes only the first 10 pages under the server cost policy. Split longer scans into smaller files if needed.')
              results.push({
                fileName: file.name,
                mimeType: file.type,
                source: 'ocr',
                text: ocrText,
                warnings: ocrText ? fileWarnings : [...fileWarnings, 'OCR returned empty text.'],
              })
            } catch (err) {
              results.push({
                fileName: file.name,
                mimeType: file.type,
                source: 'pdf',
                text: '',
                warnings: [...fileWarnings, err instanceof Error ? err.message : String(err)],
              })
            }
          } else {
            results.push({ fileName: file.name, mimeType: file.type, source: 'pdf', text: '', warnings: fileWarnings })
          }
          continue
        }

        results.push({ fileName: file.name, mimeType: file.type, source: 'pdf', text, warnings: [] })
        continue
      }

      // Images
      if (file.type.startsWith('image/') || /\.(png|jpe?g|bmp|gif|tiff?)$/.test(lowerName)) {
        if (!cfg.enableOcr) {
          results.push({
            fileName: file.name,
            mimeType: file.type,
            source: 'unsupported',
            text: '',
            warnings: ['Image OCR is disabled.'],
          })
          continue
        }

        try {
          const text = await tryOcr(file, cfg.ocrEndpoint)
          results.push({ fileName: file.name, mimeType: file.type, source: 'ocr', text, warnings: [] })
        } catch (err) {
          results.push({
            fileName: file.name,
            mimeType: file.type,
            source: 'unsupported',
            text: '',
            warnings: [err instanceof Error ? err.message : String(err)],
          })
        }
        continue
      }

      results.push({
        fileName: file.name,
        mimeType: file.type,
        source: 'unsupported',
        text: '',
        warnings: ['Unsupported file type.'],
      })
    } catch (err) {
      results.push({
        fileName: file.name,
        mimeType: file.type,
        source: 'unsupported',
        text: '',
        warnings: [err instanceof Error ? err.message : String(err)],
      })
    }
  }

  const combinedRaw = results
    .filter((r) => r.text && r.text.trim())
    .map((r) => `---\nFILE: ${r.fileName}\nSOURCE: ${r.source}\n---\n${r.text.trim()}`)
    .join('\n\n')

  const combinedText = clampText(combinedRaw, cfg.maxCombinedChars)

  for (const r of results) {
    warnings.push(...r.warnings.map((w) => `${r.fileName}: ${w}`))
  }

  return { results, combinedText, warnings }
}
