import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeCorsHeaders, safeErrorMessage } from "../lib/xml-utils";
import { AGENT_TOOL_DEFINITIONS, getFoundryAgentToken } from "../lib/agent-tools";
import { notConfiguredBody } from "../lib/iq-credential";

/**
 * /api/agent-provision — Create-or-update a Foundry Agent for the Blueprint
 * Copilot. Caches the agent definition in-memory per cold start and returns
 * the Foundry agentId so the runner can target it.
 *
 * Required env:
 *   AZURE_FOUNDRY_ENDPOINT       e.g. https://<project>.services.ai.azure.com
 *   AZURE_FOUNDRY_PROJECT_NAME
 *   AZURE_FOUNDRY_MODEL_NAME      (deployment name, defaults to gpt-4o-mini)
 *   AZURE_TENANT_ID + AZURE_CLIENT_ID + AZURE_CLIENT_SECRET (or MI)
 *
 * Auth: Cognitive Services User on the Foundry resource.
 */

const corsHeaders = makeCorsHeaders("GET, POST, OPTIONS");
const API_VERSION = "2025-05-01";
const AGENT_NAME = "id8-blueprint-copilot";

let cachedAgentId: string | null = null;

const AGENT_INSTRUCTIONS = `You are the Blueprint Copilot for ID-8, a Microsoft Cloud Solution Architect's envisioning assistant.

Your job: given a customer name, an estate snapshot and grounded signals, produce:
  1. A short situational analysis
  2. 3 candidate use cases with archetypes
  3. For the top use case: archetype recommendation, run cost estimate, and a one-page business case
  4. Final executive brief

Operating rules:
  - ALWAYS ground claims by calling tools first. Prefer graph_search, foundry_knowledge, fabric_workspaces, work_retrieval before generating use cases.
  - Use estimate_run_cost on the recommended solution mix.
  - If you need a human decision (e.g., choosing between two strong archetypes), call request_human_input.
  - Be concise: every step should be ≤ 5 sentences. Final brief ≤ 350 words.
  - Output structured markdown, never JSON, in your final user-facing message.`;

async function provisionHandler(request: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };
  try {
    const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT;
    const project = process.env.AZURE_FOUNDRY_PROJECT_NAME;
    const model = process.env.AZURE_FOUNDRY_MODEL_NAME || "gpt-4o-mini";
    if (!endpoint || !project) {
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: notConfiguredBody(
          "Foundry Agent (Blueprint Autopilot)",
          ["AZURE_FOUNDRY_ENDPOINT", "AZURE_FOUNDRY_PROJECT_NAME", "AZURE_FOUNDRY_MODEL_NAME"],
          "https://learn.microsoft.com/azure/ai-foundry/agents/overview",
        ),
      };
    }

    const force = request.query.get("force") === "true";
    if (cachedAgentId && !force) {
      return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, jsonBody: { configured: true, agentId: cachedAgentId, cached: true } };
    }

    const token = await getFoundryAgentToken();
    if (!token) {
      return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, jsonBody: notConfiguredBody("Foundry Agent", ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"]) };
    }

    const base = `${endpoint.replace(/\/$/, "")}/agents/${encodeURIComponent(project)}`;

    // Look for an existing agent with our name
    const list = await fetch(`${base}/assistants?api-version=${API_VERSION}`, { headers: { Authorization: `Bearer ${token}` } });
    let existing: any = null;
    if (list.ok) {
      const data = await list.json().catch(() => ({})) as any;
      existing = (data?.data || []).find((a: any) => a.name === AGENT_NAME) || null;
    }

    const body = {
      name: AGENT_NAME,
      model,
      instructions: AGENT_INSTRUCTIONS,
      tools: AGENT_TOOL_DEFINITIONS,
    };

    let agentRes: Response;
    if (existing?.id) {
      agentRes = await fetch(`${base}/assistants/${existing.id}?api-version=${API_VERSION}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      agentRes = await fetch(`${base}/assistants?api-version=${API_VERSION}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    const agentJson = await agentRes.json().catch(() => ({})) as any;
    if (!agentRes.ok) {
      return { status: agentRes.status, headers: corsHeaders, jsonBody: { error: `Agent provisioning HTTP ${agentRes.status}`, details: agentJson } };
    }
    cachedAgentId = agentJson.id;
    return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, jsonBody: { configured: true, agentId: cachedAgentId, model, toolCount: AGENT_TOOL_DEFINITIONS.length } };
  } catch (err) {
    return { status: 502, headers: corsHeaders, jsonBody: { error: safeErrorMessage(err, "Agent provisioning failed") } };
  }
}

app.http("agent-provision", {
  route: "agent-provision",
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: provisionHandler,
});

// Exposed for the run endpoint to share the cache
export function getCachedAgentId(): string | null { return cachedAgentId; }
export function setCachedAgentId(id: string | null) { cachedAgentId = id; }
