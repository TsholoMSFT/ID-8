import assert from "node:assert/strict";
import { createHash, randomUUID } from "crypto";
import { HttpRequest, HttpResponse, InvocationContext, type HttpHandler } from "@azure/functions";
import { z } from "zod";
import { managedSettings } from "./azure-admin";
import { guardHttpHandler } from "../src/lib/request-policy";
import { getTableClient, storageStatus } from "../src/lib/storage-clients";

const baseUrl = "https://wonderful-ground-05f749f0f.7.azurestaticapps.net";
const userId = `deployment-verification-${randomUUID()}`;
const principal = Buffer.from(JSON.stringify({
  identityProvider: "aad",
  userId,
  userDetails: "Deployment verification fixture",
  userRoles: ["anonymous", "authenticated"],
})).toString("base64");

async function invoke(
  handler: HttpHandler,
  route: string,
  method = "GET",
  body?: unknown,
  signedIn = true,
  params: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  // A local platform-identity fixture, not an attempt to authenticate to the deployed gateway.
  const request = new HttpRequest({
    url: `${baseUrl}/api/${route}`,
    method,
    params,
    headers: { "Content-Type": "application/json", ...(signedIn ? { "x-ms-client-principal": principal } : {}), ...extraHeaders },
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
  const response = await guardHttpHandler(handler)(request, new InvocationContext());
  if (!response) throw new Error("Handler returned no HTTP response.");
  return { status: response.status ?? 200, body: response instanceof HttpResponse ? await response.json() : response.jsonBody };
}

async function live(route: string, method = "GET", body?: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    redirect: "manual",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  return { status: response.status, body: text.startsWith("{") ? JSON.parse(text) : text };
}

async function main(): Promise<void> {
  const settings = await managedSettings();
  for (const [name, value] of Object.entries(settings)) process.env[name] = value;
  process.env.NODE_ENV = "production";
  delete process.env.KARABO_ALLOW_ANONYMOUS_LOCAL;
  const { chatHandler } = await import("../src/functions/chat");
  const { searchKnowledgeHandler } = await import("../src/functions/search-knowledge");
  const { createHandler, responsesHandler } = await import("../src/functions/questionnaire");
  let questionnaire: { linkToken: string; adminToken: string } | undefined;
  let submissionId: string | undefined;
  const checks: string[] = [];
  try {
    assert.equal((await invoke(chatHandler, "chat", "POST", { prompt: "Do not generate" }, false)).status, 401);
    assert.equal((await live("/api/chat", "POST", {})).status, 401);
    assert.equal((await live("/api/search-knowledge", "POST", { query: "privacy" })).status, 401);
    assert.equal((await live("/api/ai-readiness?refresh=true")).status, 401);
    assert.equal((await live("/api/questionnaire/missing/responses")).status, 401);
    const configuration = await live("/api/ai-readiness");
    assert.equal(configuration.status, 200);
    assert.equal(z.object({ status: z.literal("configured") }).parse(configuration.body).status, "configured");
    checks.push("Live configuration, anonymous AI/search/probe rejection, and questionnaire admin protection");

    const search = await invoke(searchKnowledgeHandler, "search-knowledge", "POST", {
      query: "South African personal information privacy law", top: 3,
    });
    assert.equal(search.status, 200);
    const retrieval = z.object({
      provider: z.literal("blob-hybrid"), vector: z.literal(true), count: z.number(),
      items: z.array(z.object({ id: z.string(), score: z.number() }).passthrough()),
    }).parse(search.body);
    assert.equal(retrieval.items[0].id, "reg-popia");
    assert.equal(retrieval.count, 3);
    assert.equal(retrieval.items.some((item) => "embedding" in item), false);
    checks.push("Authenticated search handler with real Blob index and query embeddings: POPIA ranked first");

    const prompt = `Return only a JSON object with one field "ok" set to true. Verification ID: ${userId}`;
    const completionSchema = z.object({
      content: z.string().min(1), deployment: z.string(), cached: z.boolean().optional(),
      usage: z.object({ total_tokens: z.number().nonnegative() }),
    });
    for (const model of ["phi-4-mini-instruct", "gpt-4o-mini"] as const) {
      const body = { prompt, model, task: "formatting", expectJson: true };
      const first = await invoke(chatHandler, "chat", "POST", body);
      assert.equal(first.status, 200, `Chat ${model} failed: ${JSON.stringify(first.body)}`);
      const generated = completionSchema.parse(first.body);
      assert.equal(z.object({ ok: z.literal(true) }).parse(JSON.parse(generated.content)).ok, true);
      assert.ok(generated.usage.total_tokens > 0);
      const second = await invoke(chatHandler, "chat", "POST", body);
      assert.equal(second.status, 200);
      const cached = completionSchema.parse(second.body);
      assert.equal(cached.cached, true);
      assert.equal(cached.usage.total_tokens, 0);
      checks.push(`Chat ${model} -> ${generated.deployment}: real JSON completion and cache hit with zero new tokens`);
    }

    const created = await invoke(createHandler, "questionnaire", "POST", {
      customerName: "KARABO deployment verification (synthetic)",
      industry: "Technology",
      track: "Verification",
      questions: [{ id: "verification-question", inputType: "text" }],
      expiresAt: Date.now() + 10 * 60_000,
    });
    assert.equal(created.status, 201);
    questionnaire = z.object({ linkToken: z.string(), adminToken: z.string() }).parse(created.body);
    const publicQuestionnaire = await live(`/api/questionnaire/${questionnaire.linkToken}`);
    assert.equal(publicQuestionnaire.status, 200);
    assert.equal("adminToken" in z.record(z.string(), z.unknown()).parse(publicQuestionnaire.body), false);
    const submitted = await live(`/api/questionnaire/${questionnaire.linkToken}/submit`, "POST", {
      email: "deployment-verification@example.invalid",
      responses: [{ questionId: "verification-question", answer: "Synthetic verification response." }],
    });
    assert.equal(submitted.status, 201);
    submissionId = z.object({ id: z.string() }).parse(submitted.body).id;
    const read = await invoke(responsesHandler, `questionnaire/${questionnaire.linkToken}/responses`, "GET", undefined, true, {
      token: questionnaire.linkToken,
    }, { "x-admin-token": questionnaire.adminToken });
    assert.equal(read.status, 200);
    assert.equal(z.object({ submissionCount: z.literal(1) }).parse(read.body).submissionCount, 1);
    checks.push("Synthetic questionnaire: protected local create/admin handlers, deployed public load/submit, private Table persistence");
    console.log(JSON.stringify({
      verificationMode: "Local authenticated handler fixtures against production dependencies plus unauthenticated live gateway checks",
      endToEndEntraLoginTested: false,
      checks,
      result: "passed",
    }, null, 2));
  } finally {
    if (questionnaire) {
      if (submissionId) await getTableClient("questionnairesubmissions").deleteEntity(questionnaire.linkToken, submissionId);
      await getTableClient("questionnairelinks").deleteEntity("link", questionnaire.linkToken);
    }
    const userRow = `user-${createHash("sha256").update(`aad:${userId}`).digest("hex")}`;
    try {
      await getTableClient("karaboquotas").deleteEntity("usage", userRow);
    } catch (error) {
      if (storageStatus(error) !== 404) throw error;
    }
    console.log("Deleted only synthetic questionnaire/submission and verification-user quota rows. Server cache expires through lifecycle policy.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Managed API verification failed.");
  if (error instanceof Error && "cause" in error && error.cause instanceof Error) console.error(error.cause.message);
  process.exitCode = 1;
});
