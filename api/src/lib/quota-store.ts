import { createHash } from "crypto";
import type { TableClient, TableEntity, TransactionAction } from "@azure/data-tables";
import { getTableClient, storageStatus } from "./storage-clients";
import { AIProviderError } from "./ai-provider";

export interface QuotaCharge {
  requests?: number;
  tokens?: number;
  images?: number;
  ocrPages?: number;
  agentRuns?: number;
}

export interface QuotaLimits {
  requests: number;
  tokens: number;
  images: number;
  ocrPages: number;
  agentRuns: number;
  requestsPerMinute: number;
}

export interface QuotaCounter extends TableEntity {
  day: string;
  minute: number;
  requests: number;
  tokens: number;
  images: number;
  ocrPages: number;
  agentRuns: number;
  minuteRequests: number;
  etag?: string;
}

export class QuotaExceededError extends AIProviderError {
  constructor(public readonly retryAfter: number, message = "Daily AI quota reached. Please try again after the quota resets.") {
    super("QUOTA_EXCEEDED", message, false, 429);
    this.name = "QuotaExceededError";
  }
}

function limit(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${key} must be a positive integer.`);
  return value;
}

export function quotaLimits(user: boolean, env: NodeJS.ProcessEnv = process.env): QuotaLimits {
  const prefix = user ? "AI_USER_" : "AI_";
  return {
    requests: limit(env, `${prefix}DAILY_REQUEST_LIMIT`, user ? 200 : 2000),
    tokens: limit(env, `${prefix}DAILY_TOKEN_LIMIT`, user ? 200_000 : 2_000_000),
    images: limit(env, `${prefix}DAILY_IMAGE_LIMIT`, user ? 3 : 15),
    ocrPages: limit(env, `${prefix}DAILY_OCR_PAGE_LIMIT`, user ? 50 : 200),
    agentRuns: limit(env, `${prefix}DAILY_AGENT_LIMIT`, user ? 5 : 20),
    requestsPerMinute: limit(env, `${prefix}REQUESTS_PER_MINUTE`, user ? 20 : 100),
  };
}

export function advanceQuota(
  previous: QuotaCounter | undefined,
  rowKey: string,
  charge: QuotaCharge,
  limits: QuotaLimits,
  now: Date,
): QuotaCounter {
  const day = now.toISOString().slice(0, 10);
  const minute = Math.floor(now.getTime() / 60_000);
  const sameDay = previous?.day === day;
  const next: QuotaCounter = {
    partitionKey: "usage",
    rowKey,
    day,
    minute,
    requests: sameDay ? previous.requests : 0,
    tokens: sameDay ? previous.tokens : 0,
    images: sameDay ? previous.images : 0,
    ocrPages: sameDay ? previous.ocrPages : 0,
    agentRuns: sameDay ? previous.agentRuns : 0,
    minuteRequests: previous?.minute === minute ? previous.minuteRequests : 0,
  };
  const dailyRetry = Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now.getTime()) / 1000);
  for (const key of ["requests", "tokens", "images", "ocrPages", "agentRuns"] as const) {
    const amount = charge[key] ?? 0;
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Quota charges must be non-negative integers.");
    next[key] += amount;
    if (next[key] > limits[key]) throw new QuotaExceededError(dailyRetry);
  }
  next.minuteRequests += charge.requests ?? 0;
  if (next.minuteRequests > limits.requestsPerMinute) {
    throw new QuotaExceededError(60 - Math.floor(now.getTime() / 1000) % 60, "Request rate limit reached. Please wait before trying again.");
  }
  return next;
}

export interface QuotaRepository {
  read(rowKey: string): Promise<QuotaCounter | undefined>;
  commit(previous: Array<QuotaCounter | undefined>, next: QuotaCounter[]): Promise<boolean>;
}

export async function reserveQuota(
  userId: string,
  charge: QuotaCharge,
  repository: QuotaRepository = getRepository(),
  now = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const keys = ["global", `user-${createHash("sha256").update(userId).digest("hex")}`];
  for (let attempt = 0; attempt < 6; attempt++) {
    const previous = await Promise.all(keys.map((key) => repository.read(key)));
    const next = keys.map((key, index) => advanceQuota(previous[index], key, charge, quotaLimits(index === 1, env), now));
    // Both counters share one partition: either both reservations commit, or neither does.
    if (await repository.commit(previous, next)) return;
    await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
  }
  throw new Error("Quota storage is busy. Please retry later.");
}

let repository: QuotaRepository | undefined;
let tableReady: Promise<void> | undefined;

function getRepository(): QuotaRepository {
  if (repository) return repository;
  const client: TableClient = getTableClient("id8quotas");
  async function ready(): Promise<void> {
    tableReady ??= client.createTable().then(() => undefined).catch((error: unknown) => {
      if (storageStatus(error) !== 409) {
        tableReady = undefined;
        throw error;
      }
    });
    await tableReady;
  }
  repository = {
    async read(rowKey) {
      await ready();
      try {
        return await client.getEntity<QuotaCounter>("usage", rowKey);
      } catch (error) {
        if (storageStatus(error) === 404) return undefined;
        throw error;
      }
    },
    async commit(previous, next) {
      const actions: TransactionAction[] = next.map((entity, index) => previous[index]
        ? ["update", entity, "Replace", { etag: previous[index]!.etag }]
        : ["create", entity]);
      try {
        await client.submitTransaction(actions);
        return true;
      } catch (error) {
        if (storageStatus(error) === 409 || storageStatus(error) === 412) return false;
        throw error;
      }
    },
  };
  return repository;
}
