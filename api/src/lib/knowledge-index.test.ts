import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSIONS } from "./embedding-config";
import { KnowledgeIndexCache, MAX_INDEX_BYTES, parseKnowledgeIndex, rankKnowledge, type KnowledgeIndex } from "./knowledge-index";

function vector(index: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, position) => position === index ? 1 : 0);
}

const index: KnowledgeIndex = {
  schemaVersion: 1, dimensions: EMBEDDING_DIMENSIONS, embeddingDeployment: "text-embedding-3-small",
  documents: [
    { id: "privacy", title: "POPIA data protection", content: "South African personal information privacy regulation", category: "South Africa", embedding: vector(0) },
    { id: "fraud", title: "Fraud investigation", content: "Investigate financial crime and gather transaction evidence", category: "Finance", embedding: vector(1) },
    { id: "iot", title: "Factory sensors", content: "Industrial equipment telemetry", category: "Manufacturing", embedding: vector(2) },
  ],
};

test("ranks keyword hits, filters categories and never returns stored vectors", () => {
  const hits = rankKnowledge(index, "POPIA privacy", 5);
  assert.equal(hits[0].id, "privacy");
  assert.equal("embedding" in hits[0], false);
  assert.deepEqual(rankKnowledge(index, "privacy", 5, "Finance"), []);
  assert.deepEqual(rankKnowledge(index, "unmatched"), []);
});

test("hybrid retrieval includes semantic matches with no lexical overlap", () => {
  const hits = rankKnowledge(index, "suspicious payments", 1, undefined, vector(1));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, "fraud");
});

test("rejects duplicate IDs, non-finite/wrong-dimension embeddings and excessive corpus sizes", () => {
  assert.throws(() => parseKnowledgeIndex({ ...index, documents: [index.documents[0], index.documents[0]] }), /duplicate/);
  assert.throws(() => parseKnowledgeIndex({ ...index, documents: [{ id: "bad", embedding: [1, 2] }] }));
  assert.throws(() => parseKnowledgeIndex({ ...index, documents: [{ id: "bad", embedding: vector(1).map(() => NaN) }] }));
  assert.throws(() => parseKnowledgeIndex({ ...index, documents: Array.from({ length: 1001 }, (_, id) => ({ id: String(id) })) }));
});

test("shares concurrent downloads, caches for five minutes and revalidates using the ETag", async () => {
  let time = 0;
  let downloads = 0;
  const cache = new KnowledgeIndexCache(async (etag) => {
    downloads++;
    if (etag === "v1") return null;
    return { content: Buffer.from(JSON.stringify(index)), etag: "v1" };
  }, () => time);
  await Promise.all([cache.get(), cache.get(), cache.get()]);
  assert.equal(downloads, 1);
  await cache.get();
  assert.equal(downloads, 1);
  time = 300_001;
  assert.equal((await cache.get()).documents.length, 3);
  assert.equal(downloads, 2);
});

test("fails explicitly for an oversized or unavailable index", async () => {
  const oversized = new KnowledgeIndexCache(async () => ({ content: Buffer.alloc(MAX_INDEX_BYTES + 1) }));
  await assert.rejects(oversized.get(), /32 MiB/);
  const missing = new KnowledgeIndexCache(async () => { throw new Error("Storage unavailable"); });
  await assert.rejects(missing.get(), /Storage unavailable/);
});
