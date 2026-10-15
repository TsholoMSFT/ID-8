import assert from "node:assert/strict";
import { createHash } from "crypto";
import { managedSettings } from "./azure-admin";
import { getKnowledgeIndex, rankKnowledge } from "../src/lib/knowledge-index";
import { embedSearchQuery } from "../src/lib/embedding-client";
import { cachedCompletion } from "../src/lib/completion-cache";
import { requestScope } from "../src/lib/request-policy";
import { reserveQuota, QuotaExceededError } from "../src/lib/quota-store";
import { getTableClient } from "../src/lib/storage-clients";

async function main(): Promise<void> {
  const settings = await managedSettings();
  for (const key of ["AZURE_STORAGE_CONNECTION_STRING", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"]) {
    if (settings[key]) process.env[key] = settings[key];
  }
  process.env.AZURE_OPENAI_AUTH_TYPE = "key";
  console.log("Loading the private Blob knowledge index...");
  const index = await getKnowledgeIndex();
  console.log(`Validated ${index.documents.length} stored documents.`);
  assert.equal(index.documents.length, 56, "Migrated corpus count differs from the verified source export.");
  if (process.argv.includes("--inspect")) {
    console.log(JSON.stringify(index.documents.map(({ id, title }) => ({ id, title })), null, 2));
    return;
  }
  const scenarios = [
    { query: "South African personal information privacy law", target: /POPIA|Protection of Personal Information/i },
    { query: "ground answers using retrieval from enterprise documents", target: /RAG|retrieval.augmented/i },
    { query: "extract structured fields from invoices and scanned forms", target: /Document Intelligence Pipeline/i },
  ];
  const checks: Array<{ query: string; target: string; topFive: string[]; rank: number }> = [];
  for (const scenario of scenarios) {
    const expected = index.documents.find((document) => scenario.target.test(document.title || ""));
    if (!expected) throw new Error(`Verification scenario requires a reference document matching ${scenario.target}. Inspect the source corpus before changing the scenario.`);
    const vector = await embedSearchQuery(scenario.query);
    const hits = rankKnowledge(index, scenario.query, 5, undefined, vector);
    const rank = hits.findIndex((hit) => hit.id === expected.id);
    assert.notEqual(rank, -1, `Expected ${expected.id} in the top five results for "${scenario.query}".`);
    checks.push({ query: scenario.query, target: expected.id, topFive: hits.map((hit) => hit.id), rank: rank + 1 });
  }

  const validationUser = `deployment-verification-${Date.now()}`;
  let generated = 0;
  await requestScope.run({ userId: validationUser }, async () => {
    const generate = async () => {
      generated++;
      return {
        content: "Storage cache verification; no model inference.",
        provider: "azure-openai" as const, source: "azure-openai" as const, model: "storage-verification",
        correlationId: validationUser, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    };
    await cachedCompletion("storage-roundtrip", generate, console);
    const second = await cachedCompletion("storage-roundtrip", generate, console);
    assert.equal(second.cached, true);
    assert.equal(generated, 1);
  });
  const quotaEnv = { ...process.env, AI_USER_DAILY_TOKEN_LIMIT: "10" };
  await reserveQuota(validationUser, { tokens: 10 }, undefined, new Date(), quotaEnv);
  try {
    await assert.rejects(reserveQuota(validationUser, { tokens: 1 }, undefined, new Date(), quotaEnv), QuotaExceededError);
  } finally {
    await getTableClient("id8quotas").deleteEntity("usage", `user-${createHash("sha256").update(validationUser).digest("hex")}`);
  }
  console.log(JSON.stringify({
    documents: index.documents.length, provider: "blob-hybrid", semanticRecallAtFive: checks.length / scenarios.length,
    checks, privateCacheRoundtrip: "passed", actualTableQuotaBoundary: "passed",
    sourceDeletionPerformedByVerifier: false,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live knowledge verification failed.");
  if (error instanceof Error && "cause" in error && error.cause instanceof Error) console.error(error.cause.message);
  process.exitCode = 1;
});
