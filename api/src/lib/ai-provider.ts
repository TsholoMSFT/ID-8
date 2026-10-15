export type AIAuthMode = "entra-id" | "key";

export type AICloudEnvironment =
  | "public"
  | "government"
  | "government-dod"
  | "china"
  | "eu-boundary";

export type AIModel = "gpt-4o" | "gpt-4o-mini" | "gpt-5-nano" | "phi-4-mini-instruct";

export type AIErrorCode =
  | "MIGRATION_IN_PROGRESS"
  | "INVALID_REQUEST"
  | "QUOTA_EXCEEDED"
  | "COST_CONTROL_UNAVAILABLE"
  | "REQUEST_IN_PROGRESS"
  | "AI_NOT_CONFIGURED"
  | "AI_AUTH_FAILED"
  | "SUBSCRIPTION_DISABLED"
  | "DEPLOYMENT_NOT_FOUND"
  | "RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "INVALID_MODEL_OUTPUT"
  | "OUTPUT_TOKEN_LIMIT"
  | "PROVIDER_ERROR";

export interface AIErrorBody {
  error: string;
  code: AIErrorCode;
  retryable: boolean;
  correlationId: string;
  details?: string;
}

export interface AIProviderConfig {
  authMode: AIAuthMode;
  endpoint: string;
  apiKey?: string;
  deployment: string;
  cloud: AICloudEnvironment;
  apiVersion: string;
  isAIHub: boolean;
  supportsMinimalReasoning: boolean;
}

const API_VERSIONS: Record<AICloudEnvironment, string> = {
  public: "2025-04-01-preview",
  government: "2024-10-21",
  "government-dod": "2024-10-21",
  china: "2024-10-21",
  "eu-boundary": "2025-04-01-preview",
};

const CLOUDS = new Set<AICloudEnvironment>(Object.keys(API_VERSIONS) as AICloudEnvironment[]);

export class AIProviderError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly status: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export function getAIAuthMode(env: NodeJS.ProcessEnv = process.env): AIAuthMode {
  const value = (env.AZURE_OPENAI_AUTH_TYPE || "entra-id").trim().toLowerCase();
  if (value === "entra-id" || value === "key") return value;
  throw new AIProviderError(
    "AI_NOT_CONFIGURED",
    "AZURE_OPENAI_AUTH_TYPE must be either entra-id or key.",
    false,
    503,
  );
}

export function getAICloudEnvironment(env: NodeJS.ProcessEnv = process.env): AICloudEnvironment {
  const value = (env.AZURE_CLOUD_ENVIRONMENT || "public").trim().toLowerCase() as AICloudEnvironment;
  if (CLOUDS.has(value)) return value;
  throw new AIProviderError(
    "AI_NOT_CONFIGURED",
    `Unsupported Azure cloud environment: ${value}`,
    false,
    503,
  );
}

function normalizeEndpoint(value: string | undefined): string | null {
  const endpoint = value?.trim().replace(/\/$/, "");
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

function cloudEndpoint(cloud: AICloudEnvironment, env: NodeJS.ProcessEnv): string | null {
  if (cloud === "government" || cloud === "government-dod") {
    return normalizeEndpoint(env.AZURE_GOV_OPENAI_ENDPOINT) || normalizeEndpoint(env.AZURE_OPENAI_ENDPOINT);
  }
  if (cloud === "china") {
    return normalizeEndpoint(env.AZURE_CN_OPENAI_ENDPOINT) || normalizeEndpoint(env.AZURE_OPENAI_ENDPOINT);
  }
  return normalizeEndpoint(env.AZURE_OPENAI_ENDPOINT);
}

function cloudApiKey(cloud: AICloudEnvironment, env: NodeJS.ProcessEnv): string | undefined {
  if (cloud === "government" || cloud === "government-dod") {
    return env.AZURE_GOV_OPENAI_API_KEY?.trim() || env.AZURE_OPENAI_API_KEY?.trim() || undefined;
  }
  if (cloud === "china") {
    return env.AZURE_CN_OPENAI_API_KEY?.trim() || env.AZURE_OPENAI_API_KEY?.trim() || undefined;
  }
  return env.AZURE_OPENAI_API_KEY?.trim() || undefined;
}

function deploymentFor(model: AIModel, env: NodeJS.ProcessEnv): string {
  const deployments: Record<AIModel, string | undefined> = {
    "gpt-4o": env.AZURE_OPENAI_DEPLOYMENT_GPT4O,
    "gpt-4o-mini": env.AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI,
    "gpt-5-nano": env.AZURE_OPENAI_DEPLOYMENT_NANO || env.AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI,
    "phi-4-mini-instruct": env.AZURE_OPENAI_DEPLOYMENT_PHI || env.AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI,
  };
  return deployments[model]?.trim() || (model === "gpt-4o" ? "gpt-4o" : "gpt-4o-mini");
}

export function resolveAIProviderConfig(
  model: AIModel,
  requestedCloud?: AICloudEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): AIProviderConfig {
  const authMode = getAIAuthMode(env);
  const cloud = requestedCloud || getAICloudEnvironment(env);

  const useAIHub = (model === "phi-4-mini-instruct" || model === "gpt-5-nano") &&
    Boolean(normalizeEndpoint(env.AI_HUB_ENDPOINT));
  const endpoint = useAIHub ? normalizeEndpoint(env.AI_HUB_ENDPOINT) : cloudEndpoint(cloud, env);
  const apiKey = useAIHub ? env.AI_HUB_API_KEY?.trim() || undefined : cloudApiKey(cloud, env);

  if (!endpoint) {
    throw new AIProviderError(
      "AI_NOT_CONFIGURED",
      `No AI endpoint is configured for cloud environment: ${cloud}`,
      false,
      503,
    );
  }
  if (authMode === "key" && !apiKey) {
    throw new AIProviderError(
      "AI_NOT_CONFIGURED",
      "AI key authentication is selected, but no API key is configured.",
      false,
      503,
    );
  }

  const deployment = useAIHub
    ? (model === "phi-4-mini-instruct"
      ? env.AI_HUB_DEPLOYMENT_PHI || "Phi-4-mini-instruct"
      : env.AI_HUB_DEPLOYMENT_NANO || "gpt-5-nano")
    : deploymentFor(model, env);

  return {
    authMode,
    endpoint,
    apiKey,
    deployment,
    cloud: useAIHub ? "public" : cloud,
    apiVersion: API_VERSIONS[useAIHub ? "public" : cloud],
    isAIHub: useAIHub,
    supportsMinimalReasoning: model === "gpt-5-nano" && (useAIHub || Boolean(env.AZURE_OPENAI_DEPLOYMENT_NANO?.trim())),
  };
}

export function classifyAIResponseError(status: number, providerMessage: string): AIProviderError {
  const message = providerMessage.trim() || `AI provider returned HTTP ${status}.`;
  const lower = message.toLowerCase();

  if (lower.includes("readonlydisabledsubscription") || lower.includes("subscription") && lower.includes("disabled")) {
    return new AIProviderError("SUBSCRIPTION_DISABLED", message, false, status);
  }
  if (status === 401 || status === 403) {
    return new AIProviderError("AI_AUTH_FAILED", message, false, status);
  }
  if (status === 404 || lower.includes("deployment") && lower.includes("not found")) {
    return new AIProviderError("DEPLOYMENT_NOT_FOUND", message, false, status);
  }
  if (status === 408 || status === 504) {
    return new AIProviderError("PROVIDER_TIMEOUT", message, true, status);
  }
  if (status === 429) {
    return new AIProviderError("RATE_LIMITED", message, true, status);
  }
  return new AIProviderError("PROVIDER_ERROR", message, status >= 500, status);
}

export function toAIErrorBody(error: unknown, correlationId: string): AIErrorBody {
  const providerError = error instanceof AIProviderError
    ? error
    : new AIProviderError("PROVIDER_ERROR", "AI provider request failed.", true, 502);
  return {
    error: providerError.message,
    code: providerError.code,
    retryable: providerError.retryable,
    correlationId,
    details: providerError.details,
  };
}