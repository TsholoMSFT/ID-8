import assert from "node:assert/strict";
import test from "node:test";
import { advanceQuota, quotaLimits, QuotaExceededError, reserveQuota, type QuotaCounter, type QuotaRepository } from "./quota-store";

const now = new Date("2026-10-14T12:00:00Z");

test("enforces exact token/image/page limits and resets daily usage at midnight UTC", () => {
  const limits = { ...quotaLimits(true, {}), tokens: 10, images: 1, ocrPages: 10 };
  const first = advanceQuota(undefined, "user", { tokens: 10, images: 1, ocrPages: 10 }, limits, now);
  assert.throws(() => advanceQuota(first, "user", { tokens: 1 }, limits, now), QuotaExceededError);
  assert.throws(() => advanceQuota(first, "user", { images: 1 }, limits, now), QuotaExceededError);
  assert.throws(() => advanceQuota(first, "user", { ocrPages: 1 }, limits, now), QuotaExceededError);
  assert.equal(advanceQuota(first, "user", { tokens: 1 }, limits, new Date("2026-10-15T00:00:00Z")).tokens, 1);
});

test("minute rate limits do not reset the daily quota", () => {
  const limits = { ...quotaLimits(true, {}), requestsPerMinute: 1 };
  const first = advanceQuota(undefined, "user", { requests: 1 }, limits, now);
  assert.throws(() => advanceQuota(first, "user", { requests: 1 }, limits, now), QuotaExceededError);
  const next = advanceQuota(first, "user", { requests: 1 }, limits, new Date(now.getTime() + 60_000));
  assert.equal(next.requests, 2);
  assert.equal(next.minuteRequests, 1);
});

test("atomically enforces global and per-user limits under concurrent reservations", async () => {
  const rows = new Map<string, QuotaCounter>();
  let revision = 0;
  const repository: QuotaRepository = {
    async read(key) {
      const row = rows.get(key);
      return row ? { ...row } : undefined;
    },
    async commit(previous, next) {
      if (next.some((row, index) => rows.get(row.rowKey)?.etag !== previous[index]?.etag)) return false;
      for (const row of next) rows.set(row.rowKey, { ...row, etag: String(++revision) });
      return true;
    },
  };
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) =>
    reserveQuota(`user-${index}`, { tokens: 1 }, repository, now, { AI_DAILY_TOKEN_LIMIT: "5" })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
  assert.equal(rows.get("global")?.tokens, 5);
  assert.equal([...rows.values()].filter((row) => row.rowKey !== "global").reduce((sum, row) => sum + row.tokens, 0), 5);
});

test("does not authorize work when quota storage fails", async () => {
  await assert.rejects(reserveQuota("user", { tokens: 1 }, {
    read: async () => { throw new Error("Storage unavailable"); },
    commit: async () => true,
  }), /Storage unavailable/);
  assert.throws(() => quotaLimits(true, { AI_USER_DAILY_TOKEN_LIMIT: "invalid" }), /positive integer/);
});
