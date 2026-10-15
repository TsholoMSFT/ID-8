import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { AIProviderError, toAIErrorBody } from "../lib/ai-provider";
import { embedTexts } from "../lib/embedding-client";
import { EMBEDDING_DIMENSIONS } from "../lib/embedding-config";
import { makeCorsHeaders } from "../lib/xml-utils";

const corsHeaders = makeCorsHeaders("POST, OPTIONS");

async function embeddingsHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };
  const correlationId = randomUUID();
  try {
    let body: { input?: unknown };
    try {
      body = await request.json() as { input?: unknown };
    } catch {
      throw new AIProviderError("INVALID_REQUEST", "Invalid JSON request.", false, 400);
    }
    const inputs = typeof body?.input === "string" ? [body.input] : body?.input;
    if (!Array.isArray(inputs) || !inputs.every((value): value is string => typeof value === "string")) {
      throw new AIProviderError("INVALID_REQUEST", "input must be a string or an array of strings.", false, 400);
    }
    const result = await embedTexts(inputs);
    return { status: 200, headers: corsHeaders, jsonBody: { ...result, dimensions: EMBEDDING_DIMENSIONS } };
  } catch (error) {
    context.error(`Embeddings failed correlationId=${correlationId}:`, error);
    return { status: error instanceof AIProviderError ? error.status : 502, headers: corsHeaders, jsonBody: toAIErrorBody(error, correlationId) };
  }
}

app.http("embeddings", { route: "embeddings", methods: ["POST", "OPTIONS"], authLevel: "anonymous", handler: embeddingsHandler });
