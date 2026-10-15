import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z, ZodError } from "zod";
import { getEmbeddingDeployment } from "../lib/embedding-config";
import { embedSearchQuery } from "../lib/embedding-client";
import { getKnowledgeIndex, rankKnowledge } from "../lib/knowledge-index";
import { QuotaExceededError } from "../lib/quota-store";
import { makeCorsHeaders } from "../lib/xml-utils";

const corsHeaders = makeCorsHeaders("POST, OPTIONS");
const searchRequest = z.object({
  query: z.string().trim().min(1).max(1000),
  top: z.number().int().min(1).max(20).default(5),
  category: z.string().max(1000).optional(),
});

export async function searchKnowledgeHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };
  let input: z.infer<typeof searchRequest>;
  try {
    input = searchRequest.parse(await request.json());
  } catch (error) {
    context.warn("Knowledge search rejected invalid input.");
    return { status: 400, headers: corsHeaders, jsonBody: { error: error instanceof ZodError ? "Search requires a query of at most 1,000 characters and top between 1 and 20." : "Invalid JSON request." } };
  }
  try {
    const index = await getKnowledgeIndex();
    let vector: number[] | undefined;
    let message: string | undefined;
    if (index.embeddingDeployment === getEmbeddingDeployment() && index.documents.some((document) => document.embedding)) {
      try {
        vector = await embedSearchQuery(input.query);
      } catch (error) {
        if (error instanceof QuotaExceededError) throw error;
        context.warn("Knowledge vector lookup unavailable; using keyword ranking.", error);
        message = "Vector lookup is unavailable; results use keyword ranking.";
      }
    } else {
      message = "The index has no compatible embeddings; results use keyword ranking.";
    }
    const items = rankKnowledge(index, input.query, input.top, input.category, vector);
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { items, count: items.length, vector: Boolean(vector), provider: "blob-hybrid", message },
    };
  } catch (error) {
    context.error("Knowledge search failed:", error);
    return {
      status: error instanceof QuotaExceededError ? 429 : 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { error: error instanceof QuotaExceededError ? error.message : "Knowledge search is unavailable. Check the index configuration.", retryable: false },
    };
  }
}

app.http("searchKnowledge", {
  route: "search-knowledge",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: searchKnowledgeHandler,
});
