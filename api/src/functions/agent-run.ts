import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeCorsHeaders, safeErrorMessage } from "../lib/xml-utils";
import { dispatchTool, getFoundryAgentToken, type ToolCall } from "../lib/agent-tools";
import { notConfiguredBody } from "../lib/iq-credential";
import { reserveAIUsage } from "../lib/request-policy";
import { AIProviderError, toAIErrorBody } from "../lib/ai-provider";
import { getCachedAgentId } from "./agent-provision";

/**
 * /api/agent-run — Drive the Foundry Blueprint Copilot agent.
 *
 * Modes (?mode=):
 *   create   POST { initialMessage } → { threadId, runId, status }
 *   send     POST { threadId, message } → { runId, status }
 *   poll     GET  ?threadId=&runId=    → { status, messages, pendingTool? }
 *
 * The endpoint internally drains tool_calls each poll: when the run reaches
 * 'requires_action', it dispatches every tool call locally and submits the
 * outputs, then returns the new status. The client only sees pendingTool when
 * a request_human_input call surfaces.
 */

const corsHeaders = makeCorsHeaders("GET, POST, OPTIONS");
const API_VERSION = "2025-05-01";

interface AgentEnv {
  endpoint: string;
  project: string;
  token: string;
  base: string;
}

async function loadEnv(): Promise<AgentEnv | { notConfigured: any }> {
  const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT;
  const project = process.env.AZURE_FOUNDRY_PROJECT_NAME;
  if (!endpoint || !project) {
    return { notConfigured: notConfiguredBody("Foundry Agent (run)", ["AZURE_FOUNDRY_ENDPOINT", "AZURE_FOUNDRY_PROJECT_NAME"]) };
  }
  const token = await getFoundryAgentToken();
  if (!token) {
    return { notConfigured: notConfiguredBody("Foundry Agent (run)", ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"]) };
  }
  const base = `${endpoint.replace(/\/$/, "")}/agents/${encodeURIComponent(project)}`;
  return { endpoint, project, token, base };
}

async function fjson(env: AgentEnv, path: string, init?: RequestInit): Promise<any> {
  const url = `${env.base}${path}${path.includes("?") ? "&" : "?"}api-version=${API_VERSION}`;
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json", ...(init?.headers as any) },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Foundry HTTP ${res.status}: ${data?.error?.message || text.slice(0, 200)}`);
  return data;
}

/**
 * Drain any pending tool calls. Returns true if the run is now in a state the
 * client can poll again (in_progress / completed / failed / requires_action
 * for human input).
 */
async function drainToolCalls(env: AgentEnv, threadId: string, runId: string): Promise<{ pendingHuman?: { question: string; options?: string[] } }> {
  // Fetch run state
  const run = await fjson(env, `/threads/${threadId}/runs/${runId}`);
  if (run.status !== "requires_action") return {};
  const toolCalls: any[] = run.required_action?.submit_tool_outputs?.tool_calls || [];
  const outputs: { tool_call_id: string; output: string }[] = [];
  let pendingHuman: { question: string; options?: string[] } | undefined;
  for (const c of toolCalls) {
    let parsedArgs: any = {};
    try { parsedArgs = c.function?.arguments ? JSON.parse(c.function.arguments) : {}; } catch { parsedArgs = {}; }
    const call: ToolCall = { id: c.id, name: c.function?.name, arguments: parsedArgs };
    const result = await dispatchTool(call);
    // Detect the human-input sentinel
    try {
      const parsed = JSON.parse(result.output);
      if (parsed?.__requires_human__) {
        pendingHuman = { question: parsed.question, options: parsed.options };
      }
    } catch { /* not JSON */ }
    outputs.push({ tool_call_id: result.tool_call_id, output: result.output });
  }
  await fjson(env, `/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
    method: "POST",
    body: JSON.stringify({ tool_outputs: outputs }),
  });
  return pendingHuman ? { pendingHuman } : {};
}

async function listMessages(env: AgentEnv, threadId: string): Promise<Array<{ role: string; content: string; createdAt?: number }>> {
  const data = await fjson(env, `/threads/${threadId}/messages?order=asc&limit=50`);
  return (data?.data || []).map((m: any) => ({
    role: m.role,
    content: (m.content || []).map((c: any) => c?.text?.value || "").join("\n"),
    createdAt: m.created_at,
  }));
}

async function runHandler(request: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };
  try {
    const envOrErr = await loadEnv();
    if ("notConfigured" in envOrErr) {
      return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, jsonBody: envOrErr.notConfigured };
    }
    const env = envOrErr;
    const agentId = getCachedAgentId();
    if (!agentId && request.query.get("mode") !== "poll") {
      return { status: 409, headers: corsHeaders, jsonBody: { error: "Agent not provisioned. POST /api/agent-provision first." } };
    }

    const mode = request.query.get("mode") || "poll";

    if (mode === "create") {
      const body: any = await request.json().catch(() => ({}));
      const initialMessage: string = body?.initialMessage || "Begin the blueprint envisioning.";
      if (typeof initialMessage !== "string" || Buffer.byteLength(initialMessage) > 8000) {
        return { status: 400, headers: corsHeaders, jsonBody: { error: "Agent message must be a string of at most 8,000 bytes." } };
      }
      await reserveAIUsage({ tokens: 10_000 });
      const thread = await fjson(env, `/threads`, { method: "POST", body: JSON.stringify({}) });
      await fjson(env, `/threads/${thread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ role: "user", content: initialMessage }),
      });
      const run = await fjson(env, `/threads/${thread.id}/runs`, {
        method: "POST",
        body: JSON.stringify({ assistant_id: agentId, max_prompt_tokens: 8000, max_completion_tokens: 2000 }),
      });
      return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, jsonBody: { configured: true, threadId: thread.id, runId: run.id, status: run.status } };
    }

    if (mode === "send") {
      const body: any = await request.json().catch(() => ({}));
      const { threadId, message } = body || {};
      if (!threadId || !message) return { status: 400, headers: corsHeaders, jsonBody: { error: "threadId and message required" } };
      if (typeof message !== "string" || Buffer.byteLength(message) > 8000) {
        return { status: 400, headers: corsHeaders, jsonBody: { error: "Agent message must be a string of at most 8,000 bytes." } };
      }
      await reserveAIUsage({ tokens: 10_000 });
      await fjson(env, `/threads/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ role: "user", content: message }),
      });
      const run = await fjson(env, `/threads/${threadId}/runs`, {
        method: "POST",
        body: JSON.stringify({ assistant_id: agentId, max_prompt_tokens: 8000, max_completion_tokens: 2000 }),
      });
      return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, jsonBody: { configured: true, threadId, runId: run.id, status: run.status } };
    }

    if (mode === "poll") {
      const threadId = request.query.get("threadId");
      const runId = request.query.get("runId");
      if (!threadId || !runId) return { status: 400, headers: corsHeaders, jsonBody: { error: "threadId and runId required" } };
      const drainResult = await drainToolCalls(env, threadId, runId);
      const run = await fjson(env, `/threads/${threadId}/runs/${runId}`);
      const messages = ["completed", "requires_action"].includes(run.status) || drainResult.pendingHuman
        ? await listMessages(env, threadId)
        : [];
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: {
          configured: true,
          threadId,
          runId,
          status: run.status,
          pendingTool: drainResult.pendingHuman,
          messages,
          usage: run.usage,
        },
      };
    }

    return { status: 400, headers: corsHeaders, jsonBody: { error: `Unknown mode: ${mode}` } };
  } catch (err) {
    if (err instanceof AIProviderError) {
      _ctx.warn(`Agent request rejected: ${err.code}`);
      return { status: err.status, headers: corsHeaders, jsonBody: toAIErrorBody(err, _ctx.invocationId) };
    }
    return { status: 502, headers: corsHeaders, jsonBody: { error: safeErrorMessage(err, "Agent run failed") } };
  }
}

app.http("agent-run", {
  route: "agent-run",
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: runHandler,
});
