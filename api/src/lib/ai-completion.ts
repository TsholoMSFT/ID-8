import { randomUUID } from "crypto";
import { getOutputTokenLimit, getReasoningEffort, selectCompletionModel, validateAIInput, type AITask } from "./ai-cost-controls";
import {
  AIProviderError,
  classifyAIResponseError,
  resolveAIProviderConfig,
  type AICloudEnvironment,
  type AIModel,
} from "./ai-provider";
import { tryFoundryLocalChat } from "./foundry-local-client";
import { getAoaiAuthHeaders } from "./iq-credential";
import { reserveAIUsage } from "./request-policy";
import { cachedCompletion } from "./completion-cache";

const GPT5_OR_O_SERIES_RE = /(^|[^a-z])(gpt-?5|o[134])([^a-z]|$)/i;
const PROVIDER_TIMEOUT_MS = 35_000;

export interface AICompletionRequest {
  prompt: string;
  model?: AIModel;
  task?: AITask;
  expectJson?: boolean;
  systemPrompt?: string;
  cloudEnvironment?: AICloudEnvironment;
  correlationId?: string;
  timeoutMs?: number;
}

export interface AICompletionResult {
  content: string;
  provider: "azure-openai" | "foundry-local";
  source: "azure-openai" | "foundry-local";
  model: string;
  deployment?: string;
  correlationId: string;
  usage?: unknown;
  cached?: boolean;
}

export interface AICompletionLogger {
  log(message: string): void;
  warn(message: string): void;
}

export async function completeAI(
  request: AICompletionRequest,
  logger?: AICompletionLogger,
  fetchImpl: typeof fetch = fetch,
): Promise<AICompletionResult> {
  const {
    prompt,
    model = "phi-4-mini-instruct",
    task = "general",
    expectJson = false,
    systemPrompt,
    cloudEnvironment,
    correlationId = randomUUID(),
  } = request;

  try {
    validateAIInput(prompt, systemPrompt);
  } catch (error) {
    throw new AIProviderError("INVALID_REQUEST", error instanceof Error ? error.message : "Invalid AI input.", false, 400);
  }

  try {
    const localResponse = await tryFoundryLocalChat({ prompt, task, expectJson, systemPrompt });
    if (localResponse) {
      logger?.log(`AI correlationId=${correlationId} provider=foundry-local model=${localResponse.model} task=${task}`);
      return { ...localResponse, provider: "foundry-local", correlationId };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Foundry Local error";
    logger?.warn(`Foundry Local unavailable; falling back to Azure OpenAI: ${message}`);
  }

  const selectedModel = selectCompletionModel(model, expectJson, process.env.AI_ALLOW_PREMIUM === "true");
  const config = resolveAIProviderConfig(selectedModel, cloudEnvironment);
  const outputTokenLimit = getOutputTokenLimit(task);
  const reasoningEffort = getReasoningEffort(task, config.supportsMinimalReasoning);
  const cacheKey = JSON.stringify({ responsePolicyVersion: 2, endpoint: config.endpoint, deployment: config.deployment, version: config.apiVersion, task, prompt, systemPrompt, expectJson, outputTokenLimit, reasoningEffort });
  return cachedCompletion(cacheKey, async () => {
  const authHeaders = await getAoaiAuthHeaders(config.apiKey, config.authMode);
  if (!authHeaders) {
    throw new AIProviderError(
      "AI_AUTH_FAILED",
      config.authMode === "entra-id"
        ? "Entra ID authentication failed. Sign in locally or configure the Function App managed identity."
        : "AI key authentication is selected, but the configured key could not be used.",
      false,
      503,
    );
  }

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  await reserveAIUsage({ tokens: Buffer.byteLength(prompt + (systemPrompt || ""), "utf8") + outputTokenLimit + 64 });
  const requestBody: Record<string, unknown> = { messages };
  if (GPT5_OR_O_SERIES_RE.test(config.deployment) || config.supportsMinimalReasoning) {
    requestBody.max_completion_tokens = outputTokenLimit;
  } else {
    requestBody.max_tokens = outputTokenLimit;
    requestBody.temperature = 0.7;
  }
  if (reasoningEffort) requestBody.reasoning_effort = reasoningEffort;
  if (expectJson) requestBody.response_format = { type: "json_object" };

  logger?.log(`AI correlationId=${correlationId} auth=${config.authMode} model=${model} deployment=${config.deployment} cloud=${config.cloud} task=${task} maxOutputTokens=${outputTokenLimit} reasoningEffort=${reasoningEffort || "provider-default"}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(request.timeoutMs ?? PROVIDER_TIMEOUT_MS, PROVIDER_TIMEOUT_MS));
  let response: Response;
  try {
    response = await fetchImpl(
      `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AIProviderError("PROVIDER_TIMEOUT", "AI provider request timed out.", true, 504);
    }
    throw new AIProviderError("PROVIDER_ERROR", "AI provider could not be reached.", true, 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw classifyAIResponseError(response.status, errorData.error?.message || response.statusText);
  }

  const data = await response.json() as {
    model?: string;
    choices?: Array<{ finish_reason?: string | null; message?: { content?: string } }>;
    usage?: unknown;
  };
  const finishReason = data.choices?.[0]?.finish_reason;
  logger?.log(`AI usage correlationId=${correlationId} deployment=${config.deployment} finishReason=${finishReason || "unknown"} usage=${JSON.stringify(data.usage)}`);
  if (finishReason === "length") {
    throw new AIProviderError(
      "OUTPUT_TOKEN_LIMIT",
      "AI reached its response token limit before completing the analysis. Try a shorter source or a smaller batch.",
      false,
      502,
    );
  }
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new AIProviderError("INVALID_MODEL_OUTPUT", "AI provider returned no content.", false, 502);
  }

  return {
    content,
    model: data.model || config.deployment,
    deployment: config.deployment,
    provider: "azure-openai",
    source: "azure-openai",
    usage: data.usage,
    correlationId,
  };
  }, logger);
}