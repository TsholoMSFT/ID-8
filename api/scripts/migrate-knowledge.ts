import { BlobServiceClient } from "@azure/storage-blob";
import { createHash } from "crypto";
import { z } from "zod";
import { armRequest, managedSettings, resourceRoot } from "./azure-admin";
import { EMBEDDING_DIMENSIONS } from "../src/lib/embedding-config";
import { embedTexts } from "../src/lib/embedding-client";
import { KNOWLEDGE_BLOB, KNOWLEDGE_CONTAINER, parseKnowledgeIndex, type KnowledgeDoc } from "../src/lib/knowledge-index";

const searchService = process.env.AZURE_SEARCH_SERVICE_NAME || "id8-search";
const searchEndpoint = `https://${searchService}.search.windows.net`;
const sourceFields = ["id", "title", "content", "source", "category", "url"] as const;
const sourceDocument = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
});

async function main(): Promise<void> {
  const settings = await managedSettings();
  if (!settings.AZURE_STORAGE_CONNECTION_STRING || !settings.AZURE_OPENAI_ENDPOINT || !settings.AZURE_OPENAI_API_KEY) {
    throw new Error("The managed API needs existing Storage and OpenAI key settings before migration.");
  }
  const keys = z.object({ primaryKey: z.string() }).parse(await armRequest(
    `${resourceRoot}/Microsoft.Search/searchServices/${searchService}/listAdminKeys?api-version=2023-11-01`, "POST",
  ));
  async function searchRequest(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${searchEndpoint}/${path}${path.includes("?") ? "&" : "?"}api-version=2024-07-01`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "api-key": keys.primaryKey, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Search export failed with HTTP ${response.status}. The source has not been modified.`);
    return response.json();
  }
  const indexes = z.object({ value: z.array(z.object({ name: z.string() }).passthrough()) }).parse(await searchRequest("indexes"));
  if (!indexes.value.length || indexes.value.some((index) => !index.name.startsWith("karabo-"))) {
    throw new Error("Migration requires explicit review: Search contains no indexes or contains non-KARABO indexes. Nothing was deleted.");
  }
  const documents: KnowledgeDoc[] = [];
  const exports: Array<{ name: string; schema: unknown; documents: unknown[]; count: number }> = [];
  for (const { name } of indexes.value) {
    const schema = await searchRequest(`indexes/${encodeURIComponent(name)}`);
    const stats = z.object({ documentCount: z.number().int().nonnegative() }).parse(await searchRequest(`indexes/${encodeURIComponent(name)}/stats`));
    if (stats.documentCount > 1000 || documents.length + stats.documentCount > 1000) throw new Error("The corpus exceeds the Blob retrieval limit of 1,000 documents.");
    const result = z.object({ value: z.array(z.unknown()) }).parse(await searchRequest(`indexes/${encodeURIComponent(name)}/docs/search`, {
      search: "*", top: 1000, select: sourceFields.join(","),
    }));
    if (result.value.length !== stats.documentCount) throw new Error(`Incomplete export of ${name}. Nothing was deleted.`);
    for (const raw of result.value) {
      const source = sourceDocument.parse(raw);
      documents.push({
        id: source.id,
        title: source.title ?? undefined,
        content: source.content ?? undefined,
        source: source.source ?? undefined,
        category: source.category ?? undefined,
        url: source.url ?? undefined,
      });
    }
    exports.push({ name, schema, documents: result.value, count: stats.documentCount });
  }
  if (!documents.length) throw new Error("The exported knowledge corpus is empty.");
  if (new Set(documents.map((document) => document.id)).size !== documents.length) {
    throw new Error("Source indexes have conflicting document IDs. Resolve them explicitly before migration.");
  }
  const service = BlobServiceClient.fromConnectionString(settings.AZURE_STORAGE_CONNECTION_STRING);
  const backups = service.getContainerClient("knowledge-backups");
  await backups.createIfNotExists();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `search-export-${stamp}.json`;
  const backup = JSON.stringify({ exportedAt: new Date().toISOString(), searchService, indexes: exports });
  await backups.getBlockBlobClient(backupName).upload(backup, Buffer.byteLength(backup), {
    conditions: { ifNoneMatch: "*" }, blobHTTPHeaders: { blobContentType: "application/json" },
  });

  process.env.AZURE_OPENAI_ENDPOINT = settings.AZURE_OPENAI_ENDPOINT;
  process.env.AZURE_OPENAI_API_KEY = settings.AZURE_OPENAI_API_KEY;
  process.env.AZURE_OPENAI_AUTH_TYPE = "key";
  // This deployment already exists. Its original 3,072-dimensional vectors were not retrievable.
  process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT = settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-3-large";
  const embedded: KnowledgeDoc[] = [];
  for (let offset = 0; offset < documents.length; offset += 8) {
    const batch = documents.slice(offset, offset + 8);
    const inputs = batch.map((document) => `${document.title || ""}\n\n${document.content || ""}`);
    if (inputs.reduce((sum, text) => sum + Buffer.byteLength(text), 0) > 32_000) throw new Error("An embedding batch is too large. Reduce its size before retrying.");
    const { vectors } = await embedTexts(inputs);
    batch.forEach((document, index) => embedded.push({ ...document, embedding: vectors[index] }));
  }
  const index = parseKnowledgeIndex({
    schemaVersion: 1,
    embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    dimensions: EMBEDDING_DIMENSIONS,
    documents: embedded,
  });
  const payload = JSON.stringify(index);
  const container = service.getContainerClient(KNOWLEDGE_CONTAINER);
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(KNOWLEDGE_BLOB);
  if (await blob.exists()) {
    const old = await blob.downloadToBuffer();
    await backups.getBlockBlobClient(`blob-index-before-${stamp}.json`).upload(old, old.length, { conditions: { ifNoneMatch: "*" } });
  }
  await blob.upload(payload, Buffer.byteLength(payload), { blobHTTPHeaders: { blobContentType: "application/json" } });
  const verified = await blob.downloadToBuffer();
  const checksum = createHash("sha256").update(payload).digest("hex");
  if (createHash("sha256").update(verified).digest("hex") !== checksum) throw new Error("Blob checksum verification failed. Keep Search.");
  const copied = parseKnowledgeIndex(JSON.parse(verified.toString("utf8")));
  for (const document of documents) {
    const copy = copied.documents.find((candidate) => candidate.id === document.id);
    if (!copy || sourceFields.some((field) => copy[field] !== document[field])) throw new Error("Content verification failed. Keep Search.");
  }
  console.log(JSON.stringify({
    status: "migrated-and-verified",
    indexes: exports.map(({ name, count }) => ({ name, count })),
    documents: copied.documents.length,
    embeddingDeployment: index.embeddingDeployment,
    dimensions: index.dimensions,
    blob: `${KNOWLEDGE_CONTAINER}/${KNOWLEDGE_BLOB}`,
    backup: `knowledge-backups/${backupName}`,
    sha256: checksum,
    sourceDeleted: false,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Knowledge migration failed.");
  process.exitCode = 1;
});
