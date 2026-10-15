import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { z, ZodError } from "zod";
import { completeAI } from "../lib/ai-completion";
import { AIProviderError, toAIErrorBody } from "../lib/ai-provider";
import { type AITask } from "../lib/ai-cost-controls";
import { makeCorsHeaders } from "../lib/xml-utils";

const corsHeaders = makeCorsHeaders("POST, OPTIONS");
const chatRequest = z.object({
  prompt: z.string().min(1),
  model: z.enum(["gpt-4o", "gpt-4o-mini", "gpt-5-nano", "phi-4-mini-instruct"]).optional(),
  task: z.string().optional(),
  expectJson: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  cloudEnvironment: z.enum(["public", "government", "government-dod", "china", "eu-boundary"]).optional(),
});

export async function chatHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: corsHeaders };
  const correlationId = req.headers.get("x-correlation-id")?.trim() || randomUUID();
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AIProviderError("INVALID_REQUEST", "Invalid JSON request.", false, 400);
    }
    const input = chatRequest.parse(body);
    const result = await completeAI({ ...input, task: input.task as AITask | undefined, correlationId }, context);
    return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, jsonBody: result };
  } catch (error) {
    const normalized = error instanceof ZodError
      ? new AIProviderError("INVALID_REQUEST", "Chat request failed validation.", false, 400)
      : error;
    const body = toAIErrorBody(normalized, correlationId);
    context.error(`AI correlationId=${correlationId} code=${body.code}: ${body.error}`);
    return {
      status: normalized instanceof AIProviderError ? normalized.status : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: body,
    };
  }
}

app.http("chat", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "chat",
  handler: chatHandler,
});
