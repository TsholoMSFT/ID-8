import { createHash } from "crypto";
import { z } from "zod";
import type { AICompletionLogger, AICompletionResult } from "./ai-completion";
import { AIProviderError } from "./ai-provider";
import { requestScope } from "./request-policy";
import { getBlobServiceClient, storageStatus } from "./storage-clients";

const CACHE_TTL_MS = 15 * 60 * 1000;
const inFlight = new Map<string, Promise<AICompletionResult>>();
const entrySchema = z.object({
  expiresAt: z.number().finite(),
  result: z.object({
    content: z.string().min(1),
    model: z.string(),
    deployment: z.string().optional(),
    provider: z.enum(["azure-openai", "foundry-local"]),
    source: z.enum(["azure-openai", "foundry-local"]),
    correlationId: z.string(),
    usage: z.unknown().optional(),
    cached: z.boolean().optional(),
  }),
});

export interface CompletionCacheStore {
  read(key: string): Promise<AICompletionResult | undefined>;
  acquire(key: string): Promise<() => Promise<void>>;
  write(key: string, result: AICompletionResult): Promise<void>;
}

function blobStore(): CompletionCacheStore {
  const container = getBlobServiceClient().getContainerClient("ai-response-cache");
  const ready = container.createIfNotExists();
  return {
    async read(key) {
      await ready;
      try {
        const blob = container.getBlockBlobClient(`${key}.json`);
        const properties = await blob.getProperties();
        if (properties.contentLength && properties.contentLength > 1024 * 1024) throw new Error("AI response cache entry exceeds its size limit.");
        const buffer = await blob.downloadToBuffer(0, properties.contentLength, { conditions: { ifMatch: properties.etag } });
        const entry = entrySchema.parse(JSON.parse(buffer.toString("utf8")));
        return entry.expiresAt > Date.now() ? entry.result : undefined;
      } catch (error) {
        if (storageStatus(error) === 404) return undefined;
        throw error;
      }
    },
    async acquire(key) {
      await ready;
      const lock = container.getBlockBlobClient(`${key}.lock`);
      try {
        await lock.upload("", 0, { conditions: { ifNoneMatch: "*" } });
      } catch (error) {
        if (storageStatus(error) !== 409 && storageStatus(error) !== 412) throw error;
      }
      const lease = lock.getBlobLeaseClient();
      try {
        await lease.acquireLease(60);
      } catch (error) {
        if (storageStatus(error) === 409) {
          throw new AIProviderError("REQUEST_IN_PROGRESS", "This AI request is already running. Wait for it to finish before trying again.", false, 409);
        }
        throw error;
      }
      return async () => { await lease.releaseLease(); };
    },
    async write(key, result) {
      const payload = JSON.stringify({ expiresAt: Date.now() + CACHE_TTL_MS, result });
      await container.getBlockBlobClient(`${key}.json`).upload(payload, Buffer.byteLength(payload), {
        blobHTTPHeaders: { blobContentType: "application/json" },
      });
    },
  };
}

function cached(result: AICompletionResult): AICompletionResult {
  return { ...result, cached: true, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
}

export async function cachedCompletion(
  requestKey: string,
  generate: () => Promise<AICompletionResult>,
  logger?: AICompletionLogger,
  store?: CompletionCacheStore,
): Promise<AICompletionResult> {
  const scope = requestScope.getStore();
  if (!scope) return generate();
  const key = createHash("sha256").update(`${scope.userId}:${requestKey}`).digest("hex");
  const existing = inFlight.get(key);
  if (existing) return cached(await existing);
  const work = (async () => {
    const storage = store || blobStore();
    const hit = await storage.read(key);
    if (hit) return cached(hit);
    const release = await storage.acquire(key);
    try {
      // Another instance may have completed after the first read but before the lease.
      const completed = await storage.read(key);
      if (completed) return cached(completed);
      const result = await generate();
      await storage.write(key, result);
      return result;
    } finally {
      try {
        await release();
      } catch (error) {
        logger?.warn(`AI cache lease release failed: ${error instanceof Error ? error.message : "Storage error"}`);
      }
    }
  })();
  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}
