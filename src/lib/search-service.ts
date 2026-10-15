/**
 * Frontend shim for private Blob-backed hybrid knowledge lookups.
 */

const API_BASE = import.meta.env.VITE_API_ENDPOINT || '/api'

export interface KnowledgeHit {
  id: string
  title?: string
  content?: string
  source?: string
  category?: string
  url?: string
  score?: number
}

export interface SearchResult {
  items: KnowledgeHit[]
  count: number
  vector: boolean
  provider?: 'blob-hybrid'
  message?: string
}

export async function searchKnowledge(query: string, top = 5, category?: string): Promise<SearchResult> {
  const r = await fetch(`${API_BASE}/search-knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top, category }),
  })
  if (!r.ok) {
    throw new Error(`searchKnowledge failed: ${r.status}`)
  }
  return (await r.json()) as SearchResult
}

export async function embed(input: string | string[]): Promise<number[][]> {
  const r = await fetch(`${API_BASE}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  if (!r.ok) {
    throw new Error(`embed failed: ${r.status}`)
  }
  const data = (await r.json()) as { vectors: number[][] }
  return data.vectors
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}
