import { z } from "zod";
import { cosineSimilarity, EMBEDDING_DIMENSIONS } from "./embedding-config";
import { getBlobServiceClient, storageStatus } from "./storage-clients";

export const KNOWLEDGE_CONTAINER = "knowledge-index";
export const KNOWLEDGE_BLOB = "id8-knowledge.json";
export const MAX_INDEX_BYTES = 32 * 1024 * 1024;

const documentSchema = z.object({
  id: z.string().min(1).max(300),
  title: z.string().max(1000).optional(),
  content: z.string().max(100_000).optional(),
  source: z.string().max(1000).optional(),
  category: z.string().max(1000).optional(),
  url: z.string().max(4000).optional(),
  embedding: z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS).optional(),
});

const indexSchema = z.object({
  schemaVersion: z.literal(1),
  embeddingDeployment: z.string().min(1),
  dimensions: z.literal(EMBEDDING_DIMENSIONS),
  documents: z.array(documentSchema).min(1).max(1000),
});

export type KnowledgeDoc = z.infer<typeof documentSchema>;
export type KnowledgeIndex = z.infer<typeof indexSchema>;
export type KnowledgeHit = Omit<KnowledgeDoc, "embedding"> & { score: number };

export function parseKnowledgeIndex(input: unknown): KnowledgeIndex {
  const index = indexSchema.parse(input);
  const ids = new Set(index.documents.map((document) => document.id));
  if (ids.size !== index.documents.length) throw new Error("Knowledge index contains duplicate document IDs.");
  return index;
}

function terms(text: string): string[] {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

export function rankKnowledge(index: KnowledgeIndex, query: string, top = 5, category?: string, vector?: number[]): KnowledgeHit[] {
  const documents = index.documents.filter((document) => !category || document.category === category);
  if (!documents.length) return [];
  const queryTerms = [...new Set(terms(query))];
  const corpus = documents.map((document) => {
    const tokens = terms(`${document.title || ""} ${document.title || ""} ${document.title || ""} ${document.content || ""} ${document.category || ""}`);
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    return { document, frequencies, length: tokens.length };
  });
  const averageLength = corpus.reduce((sum, item) => sum + item.length, 0) / corpus.length || 1;
  const frequencies = new Map(queryTerms.map((term) => [term, corpus.filter((item) => item.frequencies.has(term)).length]));
  const lexical = corpus.map((item) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = item.frequencies.get(term) || 0;
      const containing = frequencies.get(term) || 0;
      const idf = Math.log(1 + (corpus.length - containing + 0.5) / (containing + 0.5));
      score += idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * item.length / averageLength));
    }
    return { document: item.document, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id));
  const semantic = vector
    ? documents.filter((document) => document.embedding).map((document) => ({
      document,
      score: cosineSimilarity(vector, document.embedding!),
    })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id))
    : [];
  const scores = new Map<string, { document: KnowledgeDoc; score: number }>();
  for (const ranking of [lexical, semantic]) {
    ranking.slice(0, 50).forEach(({ document }, rank) => {
      const hit = scores.get(document.id) || { document, score: 0 };
      hit.score += 1 / (60 + rank + 1);
      scores.set(document.id, hit);
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id))
    .slice(0, Math.min(20, Math.max(1, top))).map(({ document, score }) => {
      const { embedding: _embedding, ...fields } = document;
      return { ...fields, score };
    });
}

export interface IndexDownload {
  content: Buffer;
  etag?: string;
}

export class KnowledgeIndexCache {
  private cached?: { index: KnowledgeIndex; etag?: string; expiresAt: number };
  private pending?: Promise<KnowledgeIndex>;

  constructor(
    private readonly download: (etag?: string) => Promise<IndexDownload | null>,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<KnowledgeIndex> {
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.index;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const downloaded = await this.download(this.cached?.etag);
      if (downloaded) {
        if (downloaded.content.length > MAX_INDEX_BYTES) throw new Error("Knowledge index exceeds 32 MiB. Use a dedicated search engine for a larger corpus.");
        const index = parseKnowledgeIndex(JSON.parse(downloaded.content.toString("utf8")));
        this.cached = { index, etag: downloaded.etag, expiresAt: this.now() + 5 * 60_000 };
      } else if (this.cached) {
        this.cached.expiresAt = this.now() + 5 * 60_000;
      } else {
        throw new Error("Knowledge index returned no content.");
      }
      return this.cached.index;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
}

const cache = new KnowledgeIndexCache(async (etag) => {
  const blob = getBlobServiceClient().getContainerClient(KNOWLEDGE_CONTAINER).getBlobClient(KNOWLEDGE_BLOB);
  try {
    const properties = await blob.getProperties();
    if (properties.contentLength && properties.contentLength > MAX_INDEX_BYTES) throw new Error("Knowledge index exceeds 32 MiB.");
    if (etag && properties.etag === etag) return null;
    const content = await blob.downloadToBuffer(0, properties.contentLength, { conditions: { ifMatch: properties.etag } });
    return { content, etag: properties.etag };
  } catch (error) {
    if (storageStatus(error) === 404) throw new Error("Knowledge index is missing. Run the knowledge migration or seeding script.");
    throw error;
  }
});

export function getKnowledgeIndex(): Promise<KnowledgeIndex> {
  return cache.get();
}
