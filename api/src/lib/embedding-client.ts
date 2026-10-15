import { AIProviderError, classifyAIResponseError, resolveAIProviderConfig } from "./ai-provider";
import { getAoaiAuthHeaders } from "./iq-credential";
import { EMBEDDING_DIMENSIONS, getEmbeddingDeployment, validateEmbeddingVectors } from "./embedding-config";
import { reserveAIUsage } from "./request-policy";

export async function embedTexts(inputs: string[], fetchImpl: typeof fetch = fetch): Promise<{ vectors: number[][]; model: string; usage?: unknown }> {
  if (!inputs.length || inputs.length > 16 || inputs.some((text) => typeof text !== "string" || !text.trim())) {
    throw new AIProviderError("INVALID_REQUEST", "Provide 1-16 non-empty texts for embedding.", false, 400);
  }
  const bytes = inputs.reduce((sum, text) => sum + Buffer.byteLength(text, "utf8"), 0);
  if (bytes > 32_000) throw new AIProviderError("INVALID_REQUEST", "Embedding input exceeds the combined 32,000-byte limit.", false, 400);
  const config = resolveAIProviderConfig("gpt-4o-mini");
  const headers = await getAoaiAuthHeaders(config.apiKey, config.authMode);
  if (!headers) throw new AIProviderError("AI_AUTH_FAILED", "Embedding authentication is unavailable.", false, 503);
  await reserveAIUsage({ tokens: bytes });
  const deployment = getEmbeddingDeployment();
  const version = process.env.AZURE_OPENAI_EMBEDDING_API_VERSION || "2024-10-21";
  const response = await fetchImpl(`${config.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/embeddings?api-version=${version}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ input: inputs, dimensions: EMBEDDING_DIMENSIONS }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw classifyAIResponseError(response.status, `Embedding provider returned HTTP ${response.status}.`);
  }
  const data = await response.json() as { data?: Array<{ embedding: number[]; index: number }>; model?: string; usage?: unknown };
  const rows = data.data?.slice().sort((a, b) => a.index - b.index);
  if (!rows || rows.length !== inputs.length || rows.some((row, index) => row.index !== index)) {
    throw new AIProviderError("INVALID_MODEL_OUTPUT", "Embedding provider returned an incomplete batch.", false, 502);
  }
  const vectors = rows.map((row) => row.embedding);
  validateEmbeddingVectors(vectors);
  console.log(`AI embedding deployment=${deployment} dimensions=${EMBEDDING_DIMENSIONS} usage=${JSON.stringify(data.usage || {})}`);
  return { vectors, model: data.model || deployment, usage: data.usage };
}

const queryCache = new Map<string, { expiresAt: number; vector: number[] }>();
const pendingQueries = new Map<string, Promise<number[]>>();

export async function embedSearchQuery(query: string): Promise<number[]> {
  const key = `${process.env.AZURE_OPENAI_ENDPOINT}:${getEmbeddingDeployment()}:${query}`;
  const hit = queryCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.vector;
  const pending = pendingQueries.get(key);
  if (pending) return pending;
  const work = embedTexts([query]).then(({ vectors }) => {
    if (queryCache.size >= 128) queryCache.delete(queryCache.keys().next().value!);
    queryCache.set(key, { expiresAt: Date.now() + 60 * 60_000, vector: vectors[0] });
    return vectors[0];
  });
  pendingQueries.set(key, work);
  try {
    return await work;
  } finally {
    pendingQueries.delete(key);
  }
}
