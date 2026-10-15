import assert from "node:assert/strict";
import test from "node:test";
import {
  AIProviderError,
  classifyAIResponseError,
  getAIAuthMode,
  resolveAIProviderConfig,
  toAIErrorBody,
} from "./ai-provider";

test("requires an explicit supported authentication mode", () => {
  assert.equal(getAIAuthMode({ AZURE_OPENAI_AUTH_TYPE: "key" }), "key");
  assert.equal(getAIAuthMode({ AZURE_OPENAI_AUTH_TYPE: "entra-id" }), "entra-id");
  assert.throws(
    () => getAIAuthMode({ AZURE_OPENAI_AUTH_TYPE: "password" }),
    (error: unknown) => error instanceof AIProviderError && error.code === "AI_NOT_CONFIGURED",
  );
});

test("resolves key and Entra configurations without silently crossing auth modes", () => {
  const keyConfig = resolveAIProviderConfig("gpt-4o-mini", "public", {
    AZURE_OPENAI_AUTH_TYPE: "key",
    AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/",
    AZURE_OPENAI_API_KEY: "test-key",
    AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI: "mini-deployment",
  });
  assert.equal(keyConfig.endpoint, "https://example.openai.azure.com");
  assert.equal(keyConfig.apiKey, "test-key");
  assert.equal(keyConfig.deployment, "mini-deployment");

  const entraConfig = resolveAIProviderConfig("gpt-4o-mini", "public", {
    AZURE_OPENAI_AUTH_TYPE: "entra-id",
    AZURE_OPENAI_ENDPOINT: "https://example.services.ai.azure.com",
    AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI: "mini-deployment",
  });
  assert.equal(entraConfig.authMode, "entra-id");
  assert.equal(entraConfig.apiKey, undefined);

  assert.throws(
    () => resolveAIProviderConfig("gpt-4o-mini", "public", {
      AZURE_OPENAI_AUTH_TYPE: "key",
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
    }),
    (error: unknown) => error instanceof AIProviderError && error.code === "AI_NOT_CONFIGURED",
  );
});

test("classifies permanent and transient provider failures", () => {
  assert.equal(classifyAIResponseError(401, "Unauthorized").code, "AI_AUTH_FAILED");
  assert.equal(classifyAIResponseError(403, "ReadOnlyDisabledSubscription").code, "SUBSCRIPTION_DISABLED");
  assert.equal(classifyAIResponseError(404, "Deployment not found").code, "DEPLOYMENT_NOT_FOUND");
  assert.equal(classifyAIResponseError(429, "Rate limited").retryable, true);
  assert.equal(classifyAIResponseError(500, "Internal error").retryable, true);
  assert.equal(classifyAIResponseError(400, "Bad request").retryable, false);
});

test("declares minimal-reasoning support only for an explicitly resolved nano deployment", () => {
  const env = {
    AZURE_OPENAI_AUTH_TYPE: "key",
    AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
    AZURE_OPENAI_API_KEY: "test-key",
    AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI: "gpt-4o-mini",
  };
  assert.equal(resolveAIProviderConfig("gpt-5-nano", "public", env).supportsMinimalReasoning, false);
  assert.equal(resolveAIProviderConfig("gpt-5-nano", "public", {
    ...env, AZURE_OPENAI_DEPLOYMENT_NANO: "structured-nano",
  }).supportsMinimalReasoning, true);
  assert.equal(resolveAIProviderConfig("gpt-4o-mini", "public", env).supportsMinimalReasoning, false);
});

test("emits a stable safe error body", () => {
  const body = toAIErrorBody(
    new AIProviderError("AI_AUTH_FAILED", "The selected identity is not authorized.", false, 403),
    "correlation-123",
  );
  assert.deepEqual(body, {
    error: "The selected identity is not authorized.",
    code: "AI_AUTH_FAILED",
    retryable: false,
    correlationId: "correlation-123",
    details: undefined,
  });
});