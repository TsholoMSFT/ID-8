import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  makeCorsHeaders,
  safeErrorMessage,
  streamToString,
  parseRSSItems,
  type RSSItem,
} from "../lib/xml-utils";
import { embedTexts } from "../lib/embedding-client";
import {
  EMBEDDING_DIMENSIONS,
  cosineSimilarity,
  getEmbeddingDeployment,
  isValidEmbeddingVector,
  validateEmbeddingVectors,
} from "../lib/embedding-config";

/**
 * Semantic ("grounded") search over the cached company-news corpus.
 *
 * A cost-effective alternative to Azure AI Search: it reuses the
 * already-deployed `text-embedding-3-small` model and the existing
 * `kaaborsstorage` blob account, so there is **no standing monthly cost** —
 * just fractions-of-a-cent embedding tokens and pennies of blob storage.
 *
 * Pipeline:
 *   1. Resolve target news blobs (one company, or newest-per-company corpus-wide).
 *   2. For each blob, load a cached embedding index ({blob}.idx.json) or build it
 *      once (embed each item via text-embedding-3-small, then cache it).
 *   3. Embed the query, cosine-rank items across all targets, return the top-k.
 *
 * Always returns HTTP 200 with a diagnostic `message` on degraded paths
 * (no storage, no embeddings auth, no cached news) and transparently falls
 * back to keyword scoring when embeddings are unavailable.
 */

const corsHeaders = makeCorsHeaders("GET, OPTIONS");
const NEWS_CONTAINER = "rss-feeds";
const INDEX_CONTAINER = "news-index";
const MAX_ITEMS_PER_BLOB = 120;
const MAX_CORPUS_BLOBS = 16;
const EMBED_TEXT_MAXLEN = 800;
const NEWS_INDEX_SCHEMA_VERSION = 2;

function getStorageConnectionString(): string | undefined {
  return (process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage)?.trim();
}

function companyPrefix(company: string): string {
  return company
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function itemText(item: RSSItem): string {
  return `${item.title}. ${item.description}`.slice(0, EMBED_TEXT_MAXLEN);
}

/** Batch-embed texts via the configured embedding model. Returns null when auth/endpoint is unavailable. */
async function embed(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  const vectors: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += 16) {
    vectors.push(...(await embedTexts(texts.slice(offset, offset + 16))).vectors);
  }
  validateEmbeddingVectors(vectors);
  return vectors;
}

function keywordScore(terms: string[], item: RSSItem): number {
  if (terms.length === 0) return 0;
  const text = `${item.title} ${item.description}`.toLowerCase();
  let hits = 0;
  for (const t of terms) if (text.includes(t)) hits++;
  return hits / terms.length;
}

interface NewsIndex {
  schemaVersion: number;
  blobName: string;
  company: string;
  model: string;
  dimensions: number;
  items: RSSItem[];
  vectors: number[][];
}

interface BlobRef {
  name: string;
  company: string;
  lastModified: Date;
}

/**
 * Load a cached embedding index for a news blob, or build + cache it.
 * Returns the items with their vectors. `vectors` is empty when embeddings
 * are unavailable (the caller then falls back to keyword scoring).
 */
async function getOrBuildIndex(
  svc: BlobServiceClient,
  ref: BlobRef,
  context: InvocationContext,
): Promise<{ items: RSSItem[]; vectors: number[][]; model: string }> {
  const newsContainer = svc.getContainerClient(NEWS_CONTAINER);
  const indexContainer = svc.getContainerClient(INDEX_CONTAINER);
  const idxName = `${ref.name}.idx.json`;
  const deployment = getEmbeddingDeployment();

  // Try cache first.
  try {
    const idxBlob = indexContainer.getBlobClient(idxName);
    if (await idxBlob.exists()) {
      const dl = await idxBlob.download();
      if (dl.readableStreamBody) {
        const json = await streamToString(dl.readableStreamBody);
        const cached = JSON.parse(json) as NewsIndex;
        const cacheMatches =
          cached.schemaVersion === NEWS_INDEX_SCHEMA_VERSION &&
          cached.model === deployment &&
          cached.dimensions === EMBEDDING_DIMENSIONS &&
          cached.items?.length &&
          cached.vectors?.length === cached.items.length &&
          cached.vectors.every(isValidEmbeddingVector);
        if (cacheMatches) {
          return { items: cached.items, vectors: cached.vectors, model: cached.model };
        }
        context.log(`news-search: rebuilding stale embedding cache ${idxName}`);
      }
    }
  } catch (e: any) {
    context.warn(`news-search: index cache read failed for ${idxName}: ${e?.message ?? "unknown"}`);
  }

  // Build: download the news blob, parse, embed.
  const newsBlob = newsContainer.getBlobClient(ref.name);
  const dl = await newsBlob.download();
  if (!dl.readableStreamBody) return { items: [], vectors: [], model: "" };
  const xml = await streamToString(dl.readableStreamBody);
  const items = parseRSSItems(xml).slice(0, MAX_ITEMS_PER_BLOB);
  if (items.length === 0) return { items: [], vectors: [], model: "" };

  const vectors = await embed(items.map(itemText));
  if (!vectors) {
    // Embeddings unavailable — return items without vectors (keyword fallback upstream).
    return { items, vectors: [], model: "" };
  }

  // Persist cache (best-effort).
  try {
    await indexContainer.createIfNotExists();
    const payload: NewsIndex = {
      schemaVersion: NEWS_INDEX_SCHEMA_VERSION,
      blobName: ref.name,
      company: ref.company,
      model: deployment,
      dimensions: EMBEDDING_DIMENSIONS,
      items,
      vectors,
    };
    const body = JSON.stringify(payload);
    await indexContainer
      .getBlockBlobClient(idxName)
      .upload(body, Buffer.byteLength(body), {
        blobHTTPHeaders: { blobContentType: "application/json" },
      });
  } catch (e: any) {
    context.warn(`news-search: index cache write failed for ${idxName}: ${e?.message ?? "unknown"}`);
  }

  return { items, vectors, model: deployment };
}

/** Resolve which news blobs to search: one company, or the newest blob per company corpus-wide. */
async function resolveTargets(
  svc: BlobServiceClient,
  company: string | null,
): Promise<BlobRef[]> {
  const container = svc.getContainerClient(NEWS_CONTAINER);
  if (!(await container.exists())) return [];

  const prefixFilter = company ? `${companyPrefix(company)}-news-` : undefined;
  // newest blob per company prefix
  const newestByCompany = new Map<string, BlobRef>();

  for await (const blob of container.listBlobsFlat()) {
    const name = blob.name;
    const marker = name.indexOf("-news-");
    if (marker <= 0) continue;
    if (prefixFilter && !name.toLowerCase().startsWith(prefixFilter)) continue;
    const comp = name.slice(0, marker);
    const lastModified = blob.properties.lastModified || new Date(0);
    const existing = newestByCompany.get(comp);
    if (!existing || lastModified > existing.lastModified) {
      newestByCompany.set(comp, { name, company: comp, lastModified });
    }
  }

  const refs = Array.from(newestByCompany.values()).sort(
    (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
  );
  // Company-scoped → just that company's newest. Corpus-wide → bound the fan-out.
  return company ? refs.slice(0, 1) : refs.slice(0, MAX_CORPUS_BLOBS);
}

async function newsSearchHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: corsHeaders };

  const ok = (jsonBody: unknown): HttpResponseInit => ({
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    jsonBody,
  });

  const query = (req.query.get("q") || req.query.get("query") || "").trim();
  const company = (req.query.get("company") || "").trim() || null;
  const kRaw = parseInt(req.query.get("k") || "8", 10);
  const k = Math.max(1, Math.min(25, Number.isFinite(kRaw) ? kRaw : 8));

  if (!query) {
    return ok({ results: [], message: "Provide a search query via ?q=" });
  }

  const conn = getStorageConnectionString();
  if (!conn) {
    return ok({
      results: [],
      query,
      message: "News index storage not configured (set AZURE_STORAGE_CONNECTION_STRING).",
    });
  }

  try {
    const svc = BlobServiceClient.fromConnectionString(conn);
    const targets = await resolveTargets(svc, company);
    if (targets.length === 0) {
      return ok({
        results: [],
        query,
        company,
        message: company
          ? `No cached news found for "${company}". Run company research first, then retry.`
          : "No cached news found yet. The news monitor populates the index on a schedule.",
      });
    }

    // Gather items (+ vectors) across all target blobs.
    const allItems: RSSItem[] = [];
    const allVectors: number[][] = [];
    const companies = new Set<string>();
    let haveVectors = false;
    for (const ref of targets) {
      const { items, vectors } = await getOrBuildIndex(svc, ref, context);
      const hasVec = vectors.length === items.length && items.length > 0;
      for (let i = 0; i < items.length; i++) {
        allItems.push(items[i]);
        allVectors.push(hasVec ? vectors[i] : []);
        companies.add(ref.company);
      }
      if (hasVec) haveVectors = true;
    }

    if (allItems.length === 0) {
      return ok({ results: [], query, company, message: "Cached news contained no parsable items." });
    }

    // Score: vector cosine when embeddings are available, else keyword overlap.
    let method: "vector" | "keyword" = "keyword";
    let scored: Array<{ item: RSSItem; score: number; company: string }>;

    const queryVec = haveVectors ? await embed([query]) : null;
    if (haveVectors && queryVec && queryVec[0]) {
      method = "vector";
      const qv = queryVec[0];
      scored = allItems.map((item, i) => ({
        item,
        company: targets.length === 1 ? targets[0].company : "",
        score: allVectors[i].length ? cosineSimilarity(qv, allVectors[i]) : 0,
      }));
    } else {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      scored = allItems.map((item) => ({ item, company: "", score: keywordScore(terms, item) }));
    }

    const results = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((s) => ({
        title: s.item.title,
        description: s.item.description,
        link: s.item.link,
        pubDate: s.item.pubDate,
        score: Math.round(s.score * 1000) / 1000,
      }));

    return ok({
      query,
      company,
      method,
      model: method === "vector" ? getEmbeddingDeployment() : undefined,
      totalIndexed: allItems.length,
      companiesSearched: companies.size,
      results,
      message:
        method === "keyword"
          ? "Embeddings unavailable — returned keyword matches. Configure AZURE_OPENAI_* for semantic ranking."
          : undefined,
    });
  } catch (error) {
    context.error("news-search error:", error);
    return ok({
      results: [],
      query,
      company,
      message: `News search failed: ${safeErrorMessage(error, "unknown")}`,
    });
  }
}

app.http("news-search", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "news-search",
  handler: newsSearchHandler,
});
