/**
 * Standalone blueprint export — embeds a rendered Mermaid SVG into a PDF
 * and produces a CSV of components for downstream analysis.
 *
 * The PDF output is intentionally focused: cover page with metadata,
 * one rasterised image of the diagram, and a tabular component listing.
 * Heavy reporting lives in `pdf-export.ts`; this helper is wired into
 * the BlueprintDiagram toolbar.
 */
import { jsPDF } from 'jspdf'
import type { Blueprint, BlueprintPathKind, BlueprintResult } from '@/lib/solution-blueprint/types'
import { BLUEPRINT_LAYER_LABELS } from '@/lib/solution-blueprint/types'

function pickBlueprint(result: BlueprintResult, path: BlueprintPathKind): Blueprint {
  return path === 'best-fit' ? result.bestFit : result.estateOptimized
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'blueprint'
}

/**
 * Rasterise an SVG string to a PNG data URL using an offscreen canvas.
 *
 * Inline SVG strings work because we never load a cross-origin resource;
 * if the SVG references external images (it doesn't, today) the canvas
 * would be tainted and `toDataURL` would throw.
 */
async function svgStringToPngDataUrl(svgString: string, scale = 2): Promise<{ dataUrl: string; width: number; height: number }> {
  // Make sure xmlns is present so the browser parses it as SVG.
  let svg = svgString
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = (e) => reject(e instanceof Event ? new Error('image load failed') : e)
      i.src = url
    })

    // Determine an intrinsic size — Mermaid SVGs reliably set width/height attrs
    // or a viewBox. Fall back to natural size.
    const tmp = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
    const viewBox = tmp.getAttribute('viewBox')
    let w = img.naturalWidth
    let h = img.naturalHeight
    if ((!w || !h) && viewBox) {
      const [, , vw, vh] = viewBox.split(/[\s,]+/).map(Number)
      if (vw && vh) {
        w = vw
        h = vh
      }
    }
    if (!w || !h) {
      w = 1200
      h = 800
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(w * scale)
    canvas.height = Math.ceil(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface BlueprintPdfExportOptions {
  result: BlueprintResult
  path: BlueprintPathKind
  /** Rendered Mermaid SVG markup for the chosen path. */
  svg: string
  fileName?: string
}

export async function exportBlueprintToPDF(opts: BlueprintPdfExportOptions): Promise<void> {
  const { result, path, svg, fileName } = opts
  const blueprint = pickBlueprint(result, path)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setProperties({ creator: 'ID-8', title: 'ID-8 Solution Blueprint' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12

  // ── Cover ─────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(80, 50, 180)
  doc.text('Solution Blueprint', margin, margin + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(40, 40, 40)
  doc.text(result.useCase.name, margin, margin + 14)

  doc.setFontSize(9)
  doc.setTextColor(90, 90, 110)
  const subParts = [
    path === 'best-fit' ? 'Path A — Best fit' : 'Path B — Estate-optimized',
    result.archetype ? `Archetype: ${result.archetype.name}` : null,
    `Reuse: ${Math.round(blueprint.reuseRatio * 100)}%`,
    `Gaps: ${blueprint.gapCount}`,
    `Components: ${blueprint.components.length}`,
  ].filter(Boolean)
  doc.text(subParts.join('   •   '), margin, margin + 19)

  // ── Diagram image ─────────────────────────────────────────────────────────
  let imageY = margin + 24
  try {
    const { dataUrl, width, height } = await svgStringToPngDataUrl(svg, 2)
    const availW = pageW - margin * 2
    const availH = pageH - imageY - margin
    const ratio = Math.min(availW / width, availH / height)
    const drawW = width * ratio
    const drawH = height * ratio
    doc.addImage(dataUrl, 'PNG', margin + (availW - drawW) / 2, imageY, drawW, drawH)
  } catch (e) {
    doc.setTextColor(180, 60, 60)
    doc.setFontSize(10)
    doc.text(`Diagram render failed: ${(e as Error).message ?? e}`, margin, imageY + 6)
  }

  // ── Components table (next page) ─────────────────────────────────────────
  doc.addPage()
  let y = margin
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(40, 40, 40)
  doc.text('Components', margin, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.setFillColor(80, 50, 180)
  doc.rect(margin, y - 4, pageW - margin * 2, 6, 'F')
  const cols = [
    { label: 'Layer', x: margin + 2, w: 38 },
    { label: 'Capability', x: margin + 42, w: 60 },
    { label: 'Service', x: margin + 104, w: 60 },
    { label: 'Vendor', x: margin + 166, w: 24 },
    { label: 'Status', x: margin + 192, w: 24 },
    { label: 'Rationale', x: margin + 218, w: pageW - margin - 220 },
  ]
  cols.forEach(c => doc.text(c.label, c.x, y))
  y += 4

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  const rows = [...blueprint.components].sort(
    (a, b) => a.layer.localeCompare(b.layer) || a.capability.localeCompare(b.capability),
  )

  for (const c of rows) {
    if (y > pageH - margin) {
      doc.addPage()
      y = margin
    }
    const status = c.gap ? 'GAP' : c.reused ? 'REUSED' : 'NET-NEW'
    const cells = [
      BLUEPRINT_LAYER_LABELS[c.layer] ?? c.layer,
      c.capabilityName,
      c.service?.name ?? '—',
      c.service?.vendor ?? '—',
      status,
      c.rationale ?? '',
    ]
    let rowH = 4
    cells.forEach((value, i) => {
      const col = cols[i]
      const lines = doc.splitTextToSize(String(value ?? ''), col.w - 2)
      doc.text(lines, col.x, y)
      rowH = Math.max(rowH, lines.length * 4)
    })
    y += rowH + 1
    doc.setDrawColor(230, 230, 235)
    doc.line(margin, y - 0.5, pageW - margin, y - 0.5)
  }

  const out = fileName ?? `ID-8-${slugify(result.useCase.name)}-${path}.pdf`
  doc.save(out)
}

export function exportBlueprintToCsv(result: BlueprintResult, path: BlueprintPathKind, fileName?: string): void {
  const blueprint = pickBlueprint(result, path)
  const header = ['layer', 'capability', 'capability_name', 'service_id', 'service_name', 'vendor', 'reused', 'gap', 'rationale']
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = blueprint.components.map(c => [
    c.layer,
    c.capability,
    c.capabilityName,
    c.service?.id ?? '',
    c.service?.name ?? '',
    c.service?.vendor ?? '',
    c.reused ? 'true' : 'false',
    c.gap ? 'true' : 'false',
    c.rationale ?? '',
  ])
  const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName ?? `ID-8-${slugify(result.useCase.name)}-${path}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
