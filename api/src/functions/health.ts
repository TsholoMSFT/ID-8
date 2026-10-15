import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeCorsHeaders } from "../lib/xml-utils";
import { getFoundryLocalStatus } from "../lib/foundry-local-client";

const corsHeaders = makeCorsHeaders("GET, OPTIONS");

async function healthHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  // Never return secrets. Only booleans / safe metadata.
  const hasAzureWebJobsStorage = !!process.env.AzureWebJobsStorage?.trim();
  const hasExplicitStorageConn = !!process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();

  const hasOpenAIEndpoint = !!process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const hasOpenAIKey = !!process.env.AZURE_OPENAI_API_KEY?.trim();
  const hasGpt4oDeployment = !!process.env.AZURE_OPENAI_DEPLOYMENT_GPT4O?.trim();
  const hasGpt4oMiniDeployment = !!process.env.AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI?.trim();

  const hasDocIntelEndpoint = !!process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim();
  const hasDocIntelKey = !!process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim();
  const foundryLocal = getFoundryLocalStatus();

  return {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    jsonBody: {
      ok: true,
      timestamp: new Date().toISOString(),
      node: process.version,
      storage: {
        hasAzureWebJobsStorage,
        hasExplicitStorageConn,
        note: "rss-feeds accepts AZURE_STORAGE_CONNECTION_STRING (preferred) or AzureWebJobsStorage",
      },
      openai: {
        hasEndpoint: hasOpenAIEndpoint,
        hasKey: hasOpenAIKey,
        hasGpt4oDeployment,
        hasGpt4oMiniDeployment,
      },
      foundryLocal,
      documentIntelligence: {
        hasEndpoint: hasDocIntelEndpoint,
        hasKey: hasDocIntelKey,
      },
    },
  };
}

app.http("health", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "health",
  handler: healthHandler,
});
