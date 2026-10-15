import assert from "node:assert/strict";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { managedAppUrl, managedSettings } from "./azure-admin";
import { completeAI } from "../src/lib/ai-completion";
import { requestScope } from "../src/lib/request-policy";
import { reserveQuota } from "../src/lib/quota-store";
import { getTableClient, storageStatus } from "../src/lib/storage-clients";
import { buildCompanyInsightPrompt, researchItemsToText } from "../../src/lib/company-research-prompt";

async function main(): Promise<void> {
  const appUrl = await managedAppUrl();
  const settings = await managedSettings();
  for (const [name, value] of Object.entries(settings)) process.env[name] = value;
  process.env.NODE_ENV = "production";
  const userId = `research-regression-${randomUUID()}`;
  const response = await fetch(`${appUrl}/api/filings-feeds?company=ABSA`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`ABSA filings returned HTTP ${response.status}.`);
  const feed = z.object({ items: z.array(z.object({
    title: z.string(), description: z.string(), pubDate: z.string(), link: z.string(),
  })) }).parse(await response.json());
  assert.ok(feed.items.length >= 12, "Expected the real filings workload, not a trivial health prompt.");
  const prompt = buildCompanyInsightPrompt(researchItemsToText(feed.items, 12), "ABSA", "Regulatory Filings");
  const realFetch = fetch;
  let providerCalls = 0;
  const captureFetch: typeof fetch = async (input, init) => {
    providerCalls++;
    const result = await realFetch(input, init);
    const data = await result.clone().json() as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
      usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
    };
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as {
      max_completion_tokens?: number; reasoning_effort?: string;
    } : undefined;
    console.log(JSON.stringify({
      providerStatus: result.status, finishReason: data.choices?.[0]?.finish_reason,
      visibleCharacters: data.choices?.[0]?.message?.content?.length,
      completionTokens: data.usage?.completion_tokens, reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
      outputLimit: body?.max_completion_tokens, reasoningEffort: body?.reasoning_effort,
    }));
    return result;
  };
  try {
    await reserveQuota(userId, { requests: 1 });
    const started = Date.now();
    const completion = await requestScope.run({ userId }, () => completeAI({
      prompt, model: "gpt-5-nano", task: "extraction", expectJson: true,
      systemPrompt: "Return only strict JSON. No markdown. No prose outside JSON.",
    }, console, captureFetch));
    const result = z.object({ insights: z.array(z.object({
      category: z.enum(["strategy", "financial", "technology", "market", "operations", "culture", "news"]),
      title: z.string().trim().min(1), summary: z.string().trim().min(1), relevanceToAI: z.string().trim().min(1),
      potentialUseCases: z.array(z.string().trim().min(1)).min(1).max(3),
      confidence: z.enum(["high", "medium", "low"]),
    })).min(3).max(8) }).parse(JSON.parse(completion.content));
    assert.equal(providerCalls, 1, "Extraction must not automatically replay a paid inference.");
    console.log(JSON.stringify({
      result: "passed", company: "ABSA", feedItems: feed.items.length, analyzedItems: 12,
      populatedInsights: result.insights.length, providerCalls, model: completion.model,
      elapsedSeconds: Math.round((Date.now() - started) / 100) / 10,
    }, null, 2));
  } finally {
    try {
      await getTableClient("id8quotas").deleteEntity("usage", `user-${createHash("sha256").update(userId).digest("hex")}`);
    } catch (error) {
      if (storageStatus(error) !== 404) throw error;
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Research extraction verification failed.");
  if (error instanceof Error && "cause" in error && error.cause instanceof Error) console.error(error.cause.message);
  process.exitCode = 1;
});
