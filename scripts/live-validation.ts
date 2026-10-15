/**
 * ID-8 Discovery-track live validation.
 *
 * Probes the explicitly selected ID-8 deployment, printing a PASS/FAIL/latency matrix. Use this
 * to (a) confirm which front door serves /api, and (b) smoke-test the Discovery
 * data pipeline (ticker lookup, company financials, company profile, RSS) end
 * to end after a deploy.
 *
 * Run:   npx tsx scripts/live-validation.ts <baseUrl>
 *        ID8_BASE_URL=<url> npx tsx scripts/live-validation.ts
 *
 * No dependencies — uses Node 18+ global fetch.
 */

type Method = "GET" | "POST";

interface Probe {
  name: string;
  method: Method;
  path: string;
  body?: unknown;
  /** Optional extra validation; return an error string, or null when OK. */
  validate?: (status: number, json: any, text: string) => string | null;
}

const REQUEST_TIMEOUT_MS = 45_000;

const selectedBase = process.argv[2] || process.env.ID8_BASE_URL;
if (!selectedBase) throw new Error("Specify the deployed ID-8 URL as an argument or set ID8_BASE_URL.");
const BASES = [selectedBase];

const PROBES: Probe[] = [
  {
    name: "health",
    method: "GET",
    path: "/api/health",
    validate: (s, j) => (s === 200 && j?.ok === true ? null : `expected {ok:true}, got status ${s}`),
  },
  {
    name: "ticker-lookup (Microsoft\u2192MSFT)",
    method: "POST",
    path: "/api/earnings/ticker-lookup",
    body: { companyName: "Microsoft" },
    validate: (s, j) => {
      if (s !== 200) return `status ${s}`;
      const tickers = j?.tickers || [];
      if (!Array.isArray(tickers) || tickers.length === 0) return "no tickers returned";
      const hit = tickers.some((t: any) => String(t.ticker).toUpperCase().includes("MSFT"));
      return hit ? null : `MSFT not in [${tickers.map((t: any) => t.ticker).join(", ")}]`;
    },
  },
  {
    name: "ticker-lookup (Standard Bank\u2192SBK.JO)",
    method: "POST",
    path: "/api/earnings/ticker-lookup",
    body: { companyName: "Standard Bank Group" },
    validate: (s, j) => {
      if (s !== 200) return `status ${s}`;
      const tickers = j?.tickers || [];
      return Array.isArray(tickers) && tickers.length > 0 ? null : "no tickers returned";
    },
  },
  {
    name: "company-financials (MSFT)",
    method: "GET",
    path: "/api/company-financials?ticker=MSFT&region=US",
    validate: (s, j) => (s === 200 && (j?.companyName || j?.sources?.length) ? null : `status ${s}, empty snapshot`),
  },
  {
    name: "company-profile (public: Microsoft)",
    method: "GET",
    path: "/api/company-profile?company=Microsoft",
    validate: (s, j) => (s === 200 && j?.identity?.name ? null : `status ${s}, no identity`),
  },
  {
    name: "company-profile (private: Bloomberg L.P.)",
    method: "GET",
    path: "/api/company-profile?company=Bloomberg%20L.P.",
    validate: (s, j) => (s === 200 && j?.identity ? null : `status ${s}, no identity`),
  },
  {
    name: "rss-feeds (Microsoft)",
    method: "GET",
    path: "/api/rss-feeds?company=Microsoft",
    validate: (s, j) => (s === 200 && Array.isArray(j?.items) ? null : `status ${s}, items not array`),
  },
];

interface ProbeResult {
  name: string;
  status: number | string;
  ms: number;
  ok: boolean;
  detail: string;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runProbe(base: string, probe: Probe): Promise<ProbeResult> {
  const url = `${base.replace(/\/$/, "")}${probe.path}`;
  const init: RequestInit = {
    method: probe.method,
    headers: probe.body ? { "Content-Type": "application/json" } : undefined,
    body: probe.body ? JSON.stringify(probe.body) : undefined,
  };

  // One retry on cold-start signals (502/503/timeout).
  for (let attempt = 0; attempt < 2; attempt++) {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(url, init);
      const ms = Date.now() - start;
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON (often the SPA index.html on a 404) */
      }
      if ((res.status === 502 || res.status === 503) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      const validationError = probe.validate ? probe.validate(res.status, json, text) : res.ok ? null : `status ${res.status}`;
      const looksLikeHtml = !json && /^\s*<(?:!doctype|html)/i.test(text);
      return {
        name: probe.name,
        status: res.status,
        ms,
        ok: !validationError,
        detail: validationError
          ? looksLikeHtml
            ? `${validationError} (HTML \u2014 /api not routed to backend)`
            : validationError
          : summarize(probe.name, json),
      };
    } catch (err) {
      const ms = Date.now() - start;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return { name: probe.name, status: "ERR", ms, ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
  return { name: probe.name, status: "ERR", ms: 0, ok: false, detail: "unreachable" };
}

function summarize(name: string, json: any): string {
  if (!json) return "ok";
  if (name.startsWith("ticker-lookup")) {
    const t = (json.tickers || []).slice(0, 3).map((x: any) => `${x.ticker}(${x.confidence ?? "?"})`).join(", ");
    return `tickers: ${t || "\u2014"}`;
  }
  if (name.startsWith("company-financials")) return `${json.companyName ?? "?"} | sources: ${(json.sources || []).map((s: any) => s.name).join(", ")}`;
  if (name.startsWith("company-profile")) {
    const d = json.diagnostics || {};
    return `${json.identity?.name ?? "?"} | public:${json.isPublic} | ${Object.entries(d).map(([k, v]) => `${k}:${v}`).join(" ")}`;
  }
  if (name.startsWith("rss-feeds")) return `${(json.items || []).length} items | source: ${json.source ?? "?"}`;
  if (name === "health") return `ok | storage:${!!json.storage?.hasAzureWebJobsStorage || !!json.storage?.hasExplicitStorageConn} openai:${!!json.openai?.hasEndpoint}`;
  return "ok";
}

async function main() {
  console.log(`\nID-8 Discovery live validation \u2014 ${new Date().toISOString()}`);
  console.log(`Probing ${BASES.length} base(s):\n${BASES.map((b) => `  - ${b}`).join("\n")}\n`);

  const healthy: string[] = [];

  for (const base of BASES) {
    console.log(`\n========================================================================`);
    console.log(`BASE: ${base}`);
    console.log(`========================================================================`);

    // Health gate first.
    const health = await runProbe(base, PROBES[0]);
    printRow(health);
    if (!health.ok) {
      console.log(`  \u21b3 /api/health not OK here \u2014 skipping remaining probes for this base.`);
      continue;
    }
    healthy.push(base);
    for (const probe of PROBES.slice(1)) {
      printRow(await runProbe(base, probe));
    }
  }

  console.log(`\n------------------------------------------------------------------------`);
  if (healthy.length) {
    console.log(`HEALTHY FRONT DOOR(S): ${healthy.join(", ")}`);
  } else {
    console.log(`NO BASE SERVED /api/health. The SWA\u2192Functions link is likely missing/broken,`);
    console.log(`or the Function App is not started. Deploy the API (azd deploy) and/or link the`);
    console.log(`Static Web App backend, then re-run.`);
  }
  console.log(`------------------------------------------------------------------------\n`);
}

function printRow(r: ProbeResult): void {
  const flag = r.ok ? "PASS" : "FAIL";
  const status = String(r.status).padEnd(4);
  const ms = `${r.ms}ms`.padStart(7);
  console.log(`  [${flag}] ${status} ${ms}  ${r.name}`);
  console.log(`           ${r.detail}`);
}

main().catch((e) => {
  console.error("Validation runner crashed:", e);
  process.exit(1);
});
