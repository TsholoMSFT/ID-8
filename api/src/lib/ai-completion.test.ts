import assert from "node:assert/strict";
import test from "node:test";
import { completeAI } from "./ai-completion";
import { AIProviderError } from "./ai-provider";

async function withProviderEnv(run: () => Promise<void>): Promise<void> {
  const values = {
    NODE_ENV: "production",
    AZURE_OPENAI_AUTH_TYPE: "key",
    AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
    AZURE_OPENAI_API_KEY: "test-key",
    AZURE_OPENAI_DEPLOYMENT_NANO: "structured-nano",
    AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI: "gpt-4o-mini",
    AI_HUB_ENDPOINT: "",
  };
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function providerResponse(finishReason: string, content: string): Response {
  return new Response(JSON.stringify({
    model: "test-model",
    choices: [{ finish_reason: finishReason, message: { content } }],
    usage: { prompt_tokens: 100, completion_tokens: 4000, completion_tokens_details: { reasoning_tokens: 4000 } },
  }), { headers: { "Content-Type": "application/json" } });
}

test("uses a bounded, minimal-reasoning profile for nano extraction with a custom deployment alias", async () => {
  await withProviderEnv(async () => {
    let body: Record<string, unknown> = {};
    const result = await completeAI({ prompt: "Extract business insights as JSON.", model: "gpt-5-nano", task: "extraction", expectJson: true }, undefined,
      async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return providerResponse("stop", '{"insights":[]}');
      });
    assert.equal(body.max_completion_tokens, 4000);
    assert.equal(body.reasoning_effort, "minimal");
    assert.equal("max_tokens" in body, false);
    assert.equal("temperature" in body, false);
    assert.equal(result.content, '{"insights":[]}');
  });
});

test("does not send nano-only reasoning controls to a fallback legacy mini deployment", async () => {
  await withProviderEnv(async () => {
    delete process.env.AZURE_OPENAI_DEPLOYMENT_NANO;
    let body: Record<string, unknown> = {};
    await completeAI({ prompt: "Extract insights.", model: "gpt-5-nano", task: "extraction" }, undefined, async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return providerResponse("stop", "Complete result");
    });
    assert.equal(body.max_tokens, 4000);
    assert.equal(body.temperature, 0.7);
    assert.equal("reasoning_effort" in body, false);
  });
});

test("reports exhausted budgets for both blank and partial output without retrying inference", async () => {
  await withProviderEnv(async () => {
    for (const content of ["", '{"insights":[']) {
      let calls = 0;
      const logs: string[] = [];
      await assert.rejects(completeAI({ prompt: "Extract insights.", model: "gpt-5-nano", task: "extraction" }, {
        log: (message) => { logs.push(message); }, warn: () => undefined,
      }, async () => {
        calls++;
        return providerResponse("length", content);
      }), (error: unknown) => error instanceof AIProviderError && error.code === "OUTPUT_TOKEN_LIMIT" && !error.retryable);
      assert.equal(calls, 1);
      assert.equal(logs.some((message) => message.includes("finishReason=length") && message.includes("reasoning_tokens")), true);
    }
  });
});

test("keeps genuinely empty completed output distinct from budget exhaustion", async () => {
  await withProviderEnv(async () => {
    await assert.rejects(completeAI({ prompt: "Extract insights.", task: "extraction" }, undefined,
      async () => providerResponse("stop", "")),
    (error: unknown) => error instanceof AIProviderError && error.code === "INVALID_MODEL_OUTPUT");
  });
});
