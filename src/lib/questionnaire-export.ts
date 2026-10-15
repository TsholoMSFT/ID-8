/**
 * Dependency-free serialization + download helpers for questionnaire responses.
 * Shared by the customer thank-you screen and the consultant retrieval view.
 * Produces JSON and human-readable Markdown; PDF is achieved via browser print.
 */
import type { DiscoveryQuestion, DiscoveryResponse, BusinessFunction } from './types'

export interface ResponsesExportInput {
  companyName: string
  email?: string
  primaryStakeholder?: string
  businessFunction?: BusinessFunction | string
  submittedAt?: number
  industry?: string
  questions: DiscoveryQuestion[]
  responses: DiscoveryResponse[]
}

function slugify(value: string): string {
  return (value || 'questionnaire')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'questionnaire'
}

/** Render a single response (text or ranking) as a readable string. */
export function formatAnswer(response: DiscoveryResponse, _question?: DiscoveryQuestion): string {
  if (response.ranking && Object.keys(response.ranking).length > 0) {
    const ordered = Object.entries(response.ranking).sort((a, b) => a[1] - b[1])
    const lines = ordered.map(([item, rank]) => `${rank}. ${item}`).join('\n')
    return response.comment ? `${lines}\n\nNotes: ${response.comment}` : lines
  }
  return response.answer?.trim() || '(no answer)'
}

export function buildResponsesMarkdown(input: ResponsesExportInput): string {
  const byId = new Map(input.questions.map((q) => [q.id, q]))
  const lines: string[] = []
  lines.push(`# Discovery Questionnaire — ${input.companyName}`)
  lines.push('')
  const meta: string[] = []
  if (input.primaryStakeholder) meta.push(`**Primary stakeholder:** ${input.primaryStakeholder}`)
  if (input.email) meta.push(`**Email:** ${input.email}`)
  if (input.businessFunction) meta.push(`**Business function:** ${input.businessFunction}`)
  if (input.industry) meta.push(`**Industry:** ${input.industry}`)
  if (input.submittedAt) meta.push(`**Submitted:** ${new Date(input.submittedAt).toLocaleString()}`)
  if (meta.length) {
    lines.push(meta.join('  \n'))
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  input.responses.forEach((r, i) => {
    const q = byId.get(r.questionId)
    lines.push(`## ${i + 1}. ${q?.question ?? r.questionId}`)
    lines.push('')
    lines.push(formatAnswer(r, q))
    lines.push('')
  })
  return lines.join('\n')
}

export function buildResponsesJson(input: ResponsesExportInput): string {
  const byId = new Map(input.questions.map((q) => [q.id, q]))
  return JSON.stringify(
    {
      companyName: input.companyName,
      email: input.email,
      primaryStakeholder: input.primaryStakeholder,
      businessFunction: input.businessFunction,
      industry: input.industry,
      submittedAt: input.submittedAt ?? Date.now(),
      responses: input.responses.map((r) => ({
        questionId: r.questionId,
        question: byId.get(r.questionId)?.question ?? null,
        answer: r.answer,
        ranking: r.ranking,
        comment: r.comment,
      })),
    },
    null,
    2,
  )
}

function triggerDownload(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadResponsesJson(input: ResponsesExportInput): void {
  triggerDownload(`ID-8-discovery-${slugify(input.companyName)}.json`, 'application/json', buildResponsesJson(input))
}

export function downloadResponsesMarkdown(input: ResponsesExportInput): void {
  triggerDownload(`ID-8-discovery-${slugify(input.companyName)}.md`, 'text/markdown', buildResponsesMarkdown(input))
}
