/**
 * Agent Tool Catalog
 * ----------------------------------------------------------------------------
 * Defines the function-tool surface registered with a Foundry Agent. Each
 * entry has:
 *   - The OpenAI/Foundry-compatible JSON schema for tool registration
 *   - A server-side dispatcher that resolves tool calls into JSON results
 *
 * All tool handlers route to existing HTTP endpoints inside this Function App
 * (so the same logic powers both the Copilot rail and the agent), or call
 * Microsoft Foundry's chat completions for content generation.
 */

import { getBearerToken } from "./iq-credential";

// ── Tool definitions registered with Foundry Agent Service ─────────────────
export const AGENT_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "graph_search",
      description: "Search Microsoft 365 (people, files, mail, Teams) for content related to a query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          mode: { type: "string", enum: ["search", "people", "files", "messages", "org"] },
          top: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "foundry_knowledge",
      description: "Search the Foundry knowledge index registered for this project.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, top: { type: "number" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fabric_workspaces",
      description: "List Microsoft Fabric workspaces accessible to this tenant.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "work_retrieval",
      description: "Run Copilot retrieval over Microsoft Graph external connectors (LOB content).",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, top: { type: "number" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "company_financials",
      description: "Fetch latest public financials (SEC EDGAR/Yahoo/Companies House) for a ticker.",
      parameters: {
        type: "object",
        properties: { ticker: { type: "string" }, region: { type: "string" } },
        required: ["ticker"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "economic_snapshot",
      description: "Fetch macro indicators (GDP, CPI, unemployment, policy rate) from FRED/Eurostat/World Bank.",
      parameters: {
        type: "object",
        properties: { region: { type: "string", enum: ["US", "EU", "ZA", "GLOBAL"] } },
        required: ["region"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_run_cost",
      description: "Estimate monthly Azure run cost for a use case given users, transactions and region.",
      parameters: {
        type: "object",
        properties: {
          microsoftSolutions: { type: "array", items: { type: "string" } },
          activeUsers: { type: "number" },
          monthlyTransactions: { type: "number" },
          region: { type: "string" },
          effortWeeks: { type: "number" },
        },
        required: ["microsoftSolutions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human_input",
      description: "Pause the run and ask the human operator a clarifying question. The reply will be returned in the next user turn.",
      parameters: {
        type: "object",
        properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } } },
        required: ["question"],
      },
    },
  },
] as const;

// ── Tool dispatcher ────────────────────────────────────────────────────────
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  tool_call_id: string;
  output: string; // Foundry expects string; we serialise JSON
}

const SELF_BASE = process.env.SELF_FUNCTION_BASE_URL || ""; // Canonical ID-8 API origin when configured.

async function selfFetch(path: string, init?: RequestInit): Promise<any> {
  if (!SELF_BASE) {
    return { error: "SELF_FUNCTION_BASE_URL not set; cannot self-invoke" };
  }
  const res = await fetch(`${SELF_BASE}${path}`, init);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function dispatchTool(call: ToolCall): Promise<ToolResult> {
  const args = call.arguments || {};
  let output: any;
  try {
    switch (call.name) {
      case "graph_search":
        output = await selfFetch(`/api/graph-query?mode=${args.mode || "search"}&q=${encodeURIComponent(args.query)}&top=${args.top || 8}`);
        break;
      case "foundry_knowledge":
        output = await selfFetch(`/api/foundry-iq?mode=knowledge&q=${encodeURIComponent(args.query)}&top=${args.top || 6}`);
        break;
      case "fabric_workspaces":
        output = await selfFetch(`/api/fabric-iq?mode=workspaces`);
        break;
      case "work_retrieval":
        output = await selfFetch(`/api/work-iq?mode=retrieval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: args.query, top: args.top || 8 }),
        });
        break;
      case "company_financials":
        output = await selfFetch(`/api/company-financials?ticker=${encodeURIComponent(args.ticker)}${args.region ? `&region=${args.region}` : ""}`);
        break;
      case "economic_snapshot":
        output = await selfFetch(`/api/economic-data?region=${args.region}`);
        break;
      case "estimate_run_cost":
        // Lightweight server-side estimator (mirrors src/lib/cost-engine.ts heuristics)
        output = estimateRunCostLite(args);
        break;
      case "request_human_input":
        // Surfaced to the runner via a sentinel value the runner detects
        output = { __requires_human__: true, question: args.question, options: args.options || [] };
        break;
      default:
        output = { error: `Unknown tool: ${call.name}` };
    }
  } catch (err: any) {
    output = { error: err?.message || String(err) };
  }
  return { tool_call_id: call.id, output: JSON.stringify(output).slice(0, 16_000) };
}

// ── Bearer for Foundry Agent Service ──────────────────────────────────────
export async function getFoundryAgentToken(): Promise<string | null> {
  return getBearerToken("https://ai.azure.com/.default");
}

// ── Lightweight server-side cost estimator ────────────────────────────────
function estimateRunCostLite(args: Record<string, any>): Record<string, any> {
  const solutions: string[] = Array.isArray(args.microsoftSolutions) ? args.microsoftSolutions : [];
  const users = Number(args.activeUsers || 50);
  const tx = Number(args.monthlyTransactions || 10_000);
  const effortWeeks = Number(args.effortWeeks || 6);
  // Heuristic catalog (kept narrow on purpose; UI uses the richer src/lib/azure-pricing.json)
  const PRICES: Record<string, { perUser?: number; perK?: number; flat?: number }> = {
    "M365 Copilot": { perUser: 30 },
    "Power Platform per app": { perUser: 5 },
    "Azure OpenAI gpt-4o-mini": { perK: 0.26 / 1000 },
    "Azure OpenAI gpt-4o": { perK: 5 / 1000 },
    "Azure AI Search Basic": { flat: 75 },
    "Azure Functions Consumption": { flat: 20 },
    "Azure Container Apps": { flat: 60 },
  };
  let monthlyLicense = 0, monthlyCompute = 0;
  for (const s of solutions) {
    const p = PRICES[s];
    if (!p) continue;
    if (p.perUser) monthlyLicense += p.perUser * users;
    if (p.perK) monthlyCompute += p.perK * tx;
    if (p.flat) monthlyCompute += p.flat;
  }
  const oneTimeImplementationUSD = effortWeeks * 8000;
  const totalMonthlyUSD = monthlyLicense + monthlyCompute;
  return {
    currency: "USD",
    monthlyLicenseUSD: Math.round(monthlyLicense),
    monthlyComputeUSD: Math.round(monthlyCompute),
    monthlyDataUSD: 0,
    oneTimeImplementationUSD,
    totalMonthlyUSD: Math.round(totalMonthlyUSD),
    totalAnnualUSD: Math.round(totalMonthlyUSD * 12),
    assumptions: [`${users} active users`, `${tx} monthly transactions`, `${effortWeeks} weeks implementation`],
    pricingVersion: "agent-lite-2026-05",
  };
}
