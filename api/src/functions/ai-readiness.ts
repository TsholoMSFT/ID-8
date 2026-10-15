import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { checkAzureAIReadiness } from "../lib/ai-readiness";
import { makeCorsHeaders } from "../lib/xml-utils";

const corsHeaders = makeCorsHeaders("GET, OPTIONS");

async function aiReadinessHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  const refresh = request.query.get("refresh") === "true";
  const readiness = await checkAzureAIReadiness({ probe: refresh });
  if (readiness.status === "unavailable") context.warn(`AI readiness correlationId=${readiness.correlationId} code=${readiness.code}`);

  return {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    jsonBody: readiness,
  };
}

app.http("ai-readiness", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "ai-readiness",
  handler: aiReadinessHandler,
});