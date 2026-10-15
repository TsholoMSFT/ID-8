import assert from "node:assert/strict";
import test from "node:test";
import type { AICompletionResult } from "./ai-completion";
import { cachedCompletion, type CompletionCacheStore } from "./completion-cache";
import { requestScope } from "./request-policy";

const result: AICompletionResult = {
  content: "Generated content", model: "mini", provider: "azure-openai", source: "azure-openai",
  correlationId: "original", usage: { total_tokens: 100 },
};

test("concurrent identical requests share one generation and report zero new tokens on cache hits", async () => {
  let generations = 0;
  const saved = new Map<string, AICompletionResult>();
  const storage: CompletionCacheStore = {
    read: async (key) => saved.get(key),
    acquire: async () => async () => undefined,
    write: async (key, value) => { saved.set(key, value); },
  };
  await requestScope.run({ userId: "user-one" }, async () => {
    const generate = async () => { generations++; return result; };
    const responses = await Promise.all([
      cachedCompletion("same", generate, undefined, storage),
      cachedCompletion("same", generate, undefined, storage),
    ]);
    assert.equal(generations, 1);
    assert.equal(responses[1].cached, true);
    assert.deepEqual(responses[1].usage, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
    await cachedCompletion("same", generate, undefined, storage);
    assert.equal(generations, 1);
  });
});

test("does not reuse cached customer content across users", async () => {
  const keys: string[] = [];
  const storage: CompletionCacheStore = {
    read: async (key) => { keys.push(key); return result; },
    acquire: async () => async () => undefined,
    write: async () => undefined,
  };
  for (const userId of ["one", "two"]) {
    await requestScope.run({ userId }, () => cachedCompletion("same-prompt", async () => result, undefined, storage));
  }
  assert.notEqual(keys[0], keys[1]);
});

test("rechecks the cache after acquiring a lease to prevent a cross-instance race", async () => {
  let reads = 0;
  let generations = 0;
  let releases = 0;
  await requestScope.run({ userId: "race" }, () => cachedCompletion("race", async () => {
    generations++;
    return result;
  }, undefined, {
    read: async () => ++reads === 1 ? undefined : result,
    acquire: async () => async () => { releases++; },
    write: async () => undefined,
  }));
  assert.equal(generations, 0);
  assert.equal(releases, 1);
});

test("never starts paid inference when cache storage fails", async () => {
  let generations = 0;
  await requestScope.run({ userId: "storage-failure" }, async () => {
    await assert.rejects(cachedCompletion("failure", async () => { generations++; return result; }, undefined, {
      read: async () => { throw new Error("Storage unavailable"); },
      acquire: async () => async () => undefined,
      write: async () => undefined,
    }), /Storage unavailable/);
  });
  assert.equal(generations, 0);
});
