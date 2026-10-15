import assert from "node:assert/strict";
import test from "node:test";
import { checkAzureAIReadiness, clearAIReadinessCache } from "./ai-readiness";

const keyEnvironment = {
  AZURE_OPENAI_AUTH_TYPE: "key",
  AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
  AZURE_OPENAI_API_KEY: "test-key",
  AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI: "mini-deployment",
};

test("reports ready when the selected deployment accepts a minimal request", async () => {
  clearAIReadinessCache();
  let requestUrl = "";
  const result = await checkAzureAIReadiness({
    env: keyEnvironment,
    correlationId: "ready-1",
    bypassCache: true,
    probe: true,
    getAuthHeaders: async () => ({ "api-key": "test-key" }),
    fetchImpl: async (input) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.deployment, "mini-deployment");
  assert.match(requestUrl, /mini-deployment\/chat\/completions/);
});

test("classifies a disabled subscription without treating it as retryable", async () => {
  clearAIReadinessCache();
  const result = await checkAzureAIReadiness({
    env: keyEnvironment,
    correlationId: "disabled-1",
    bypassCache: true,
    probe: true,
    getAuthHeaders: async () => ({ "api-key": "test-key" }),
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: "ReadOnlyDisabledSubscription" },
    }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.code, "SUBSCRIPTION_DISABLED");
  assert.equal(result.retryable, false);
});

test("reports explicit authentication failure before calling the provider", async () => {
  clearAIReadinessCache();
  let called = false;
  const result = await checkAzureAIReadiness({
    env: {
      AZURE_OPENAI_AUTH_TYPE: "entra-id",
      AZURE_OPENAI_ENDPOINT: "https://example.services.ai.azure.com",
      AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI: "mini-deployment",
    },
    correlationId: "auth-1",
    bypassCache: true,
    probe: true,
    getAuthHeaders: async () => null,
    fetchImpl: async () => {
      called = true;
      return new Response(null, { status: 200 });
    },
  });

  assert.equal(called, false);
  assert.equal(result.code, "AI_AUTH_FAILED");
  assert.equal(result.retryable, false);
});

test("automatic readiness is configuration-only and never authenticates or invokes inference", async () => {
  let calls = 0;
  const result = await checkAzureAIReadiness({
    env: keyEnvironment,
    getAuthHeaders: async () => { calls++; return {}; },
    fetchImpl: async () => { calls++; return new Response(); },
  });
  assert.equal(result.status, "configured");
  assert.equal(calls, 0);
});