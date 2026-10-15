import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeCorsHeaders, safeErrorMessage } from "../lib/xml-utils";

/**
 * /api/economic-data?region=US|EU|ZA|GLOBAL&indicators=gdp,cpi,unemployment,policy_rate
 *
 * Free, key-less (or low-friction) sources:
 *  - US:    FRED (api.stlouisfed.org) — requires FRED_API_KEY (free)
 *           World Bank fallback (no key)
 *  - EU:    Eurostat JSON-stat (no key)
 *  - ZA:    World Bank (no key) + SARB CSV-style endpoints (no key, best-effort)
 *  - GLOBAL: World Bank (no key)
 *
 * Returns a normalized list:
 *   { region, indicators: [{ id, label, value, unit, asOf, source, sourceUrl }] }
 *
 * Cached 12h in-memory.
 */

const corsHeaders = makeCorsHeaders("GET, OPTIONS");
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FRED_KEY = process.env.FRED_API_KEY;

interface IndicatorPoint {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  asOf: string | null;
  source: string;
  sourceUrl?: string;
}

const cache = new Map<string, { at: number; data: any }>();

// ── World Bank helpers ──────────────────────────────────────────────────────
const WB_INDICATOR_MAP: Record<string, { code: string; label: string; unit: string }> = {
  gdp: { code: "NY.GDP.MKTP.CD", label: "GDP (current US$)", unit: "USD" },
  gdp_growth: { code: "NY.GDP.MKTP.KD.ZG", label: "GDP growth (annual %)", unit: "%" },
  cpi: { code: "FP.CPI.TOTL.ZG", label: "Inflation, consumer prices (annual %)", unit: "%" },
  unemployment: { code: "SL.UEM.TOTL.ZS", label: "Unemployment, total (% of labour force)", unit: "%" },
};

const COUNTRY_CODE: Record<string, string> = {
  US: "USA",
  ZA: "ZAF",
  EU: "EUU", // European Union aggregate
  GLOBAL: "WLD",
};

async function worldBank(region: string, key: string): Promise<IndicatorPoint | null> {
  const ind = WB_INDICATOR_MAP[key];
  const country = COUNTRY_CODE[region];
  if (!ind || !country) return null;
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${ind.code}?format=json&per_page=5`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ID-8/1.0" } });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const series = Array.isArray(data) ? data[1] : null;
    if (!Array.isArray(series)) return null;
    const latest = series.find((row: any) => row && row.value != null);
    if (!latest) return null;
    return {
      id: key,
      label: ind.label,
      value: Number(latest.value),
      unit: ind.unit,
      asOf: String(latest.date),
      source: "World Bank",
      sourceUrl: `https://data.worldbank.org/indicator/${ind.code}?locations=${country}`,
    };
  } catch {
    return null;
  }
}

// ── FRED helpers (US only, optional) ────────────────────────────────────────
const FRED_SERIES: Record<string, { id: string; label: string; unit: string }> = {
  policy_rate: { id: "DFF", label: "Federal Funds Effective Rate", unit: "%" },
  cpi: { id: "CPIAUCSL", label: "CPI All Urban Consumers (Index)", unit: "Index 1982-84=100" },
  unemployment: { id: "UNRATE", label: "Unemployment Rate", unit: "%" },
  gdp: { id: "GDP", label: "Gross Domestic Product (Billions $)", unit: "USD bn" },
};

async function fred(key: string): Promise<IndicatorPoint | null> {
  if (!FRED_KEY) return null;
  const s = FRED_SERIES[key];
  if (!s) return null;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const obs = data?.observations?.[0];
    if (!obs || obs.value === "." ) return null;
    return {
      id: key,
      label: s.label,
      value: Number(obs.value),
      unit: s.unit,
      asOf: obs.date,
      source: "FRED (St. Louis Fed)",
      sourceUrl: `https://fred.stlouisfed.org/series/${s.id}`,
    };
  } catch {
    return null;
  }
}

// ── Eurostat (EU only, no key) ──────────────────────────────────────────────
async function eurostatHICP(): Promise<IndicatorPoint | null> {
  // HICP - annual rate of change, EA (euro area)
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=EA&coicop=CP00&format=JSON&lang=EN`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const values = data?.value || {};
    const dims = data?.dimension?.time?.category?.index || {};
    const labels = data?.dimension?.time?.category?.label || {};
    const periods = Object.keys(dims).sort((a, b) => dims[a] - dims[b]);
    for (let i = periods.length - 1; i >= 0; i--) {
      const idx = dims[periods[i]];
      const v = values[idx];
      if (v != null) {
        return {
          id: "cpi",
          label: "HICP - annual rate of change (Euro area)",
          value: Number(v),
          unit: "%",
          asOf: labels[periods[i]] || periods[i],
          source: "Eurostat",
          sourceUrl: "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_manr",
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function economicDataHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };
  try {
    const region = (request.query.get("region") || "US").toUpperCase();
    const indicatorsParam = (request.query.get("indicators") || "gdp,cpi,unemployment,policy_rate").toLowerCase();
    const indicators = indicatorsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const cacheKey = `${region}:${indicators.join("|")}`;

    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
        jsonBody: hit.data,
      };
    }

    const results: IndicatorPoint[] = [];

    for (const ind of indicators) {
      let point: IndicatorPoint | null = null;
      if (region === "US") {
        point = (await fred(ind)) || (await worldBank("US", ind));
      } else if (region === "EU") {
        if (ind === "cpi") point = await eurostatHICP();
        if (!point) point = await worldBank("EU", ind);
      } else if (region === "ZA") {
        point = await worldBank("ZA", ind);
      } else {
        point = await worldBank("GLOBAL", ind);
      }
      if (point) results.push(point);
    }

    const payload = {
      region,
      indicators: results,
      fetchedAt: new Date().toISOString(),
      notes: FRED_KEY ? undefined : "Set FRED_API_KEY to enable richer US series (policy rate, etc.).",
    };
    cache.set(cacheKey, { at: Date.now(), data: payload });
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
      jsonBody: payload,
    };
  } catch (err) {
    return { status: 502, headers: corsHeaders, jsonBody: { error: safeErrorMessage(err, "Failed to fetch economic data") } };
  }
}

app.http("economic-data", {
  route: "economic-data",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: economicDataHandler,
});
