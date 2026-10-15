import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeCorsHeaders, safeErrorMessage } from "../lib/xml-utils";

/**
 * /api/company-financials?ticker=MSFT&region=US
 *
 * Returns a normalized snapshot of company financials/identity from FREE sources:
 *  - SEC EDGAR submissions + companyfacts (US, no key)
 *  - Yahoo Finance quoteSummary (global, no key, best-effort)
 *  - Alpha Vantage OVERVIEW (global, requires ALPHA_VANTAGE_KEY, optional)
 *  - Companies House (UK, requires COMPANIES_HOUSE_KEY, optional)
 *
 * Response shape:
 *   {
 *     ticker, region, companyName?, industry?, sector?, country?,
 *     marketCapUSD?, revenueUSD?, employees?, fiscalYearEnd?,
 *     description?, website?, sources: [{ name, url? }]
 *   }
 *
 * 24h in-memory cache.
 */

const corsHeaders = makeCorsHeaders("GET, OPTIONS");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY;
const COMPANIES_HOUSE_KEY = process.env.COMPANIES_HOUSE_KEY;

interface FinancialsSnapshot {
  ticker: string;
  region: string;
  companyName?: string;
  industry?: string;
  sector?: string;
  country?: string;
  marketCapUSD?: number;
  revenueUSD?: number;
  employees?: number;
  fiscalYearEnd?: string;
  description?: string;
  website?: string;
  sources: { name: string; url?: string }[];
  fetchedAt: string;
}

const cache = new Map<string, { at: number; data: FinancialsSnapshot }>();

// ── Yahoo Finance (no key) ──────────────────────────────────────────────────
async function yahooQuote(ticker: string): Promise<Partial<FinancialsSnapshot> | null> {
  try {
    const modules = "assetProfile,summaryDetail,defaultKeyStatistics,price,financialData";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 ID-8/1.0" } });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const r = data?.quoteSummary?.result?.[0];
    if (!r) return null;
    const profile = r.assetProfile || {};
    const price = r.price || {};
    const fin = r.financialData || {};
    return {
      companyName: price.longName || price.shortName,
      industry: profile.industry,
      sector: profile.sector,
      country: profile.country,
      marketCapUSD: price.marketCap?.raw,
      revenueUSD: fin.totalRevenue?.raw,
      employees: profile.fullTimeEmployees,
      description: profile.longBusinessSummary,
      website: profile.website,
    };
  } catch {
    return null;
  }
}

// ── SEC EDGAR (US tickers, no key) ──────────────────────────────────────────
async function secLookupCIK(ticker: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": "ID-8 Discovery Tool (Microsoft Innovation Hub)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const upper = ticker.toUpperCase();
    for (const k of Object.keys(data)) {
      if (data[k]?.ticker === upper) {
        return String(data[k].cik_str).padStart(10, "0");
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function secSubmissions(cik: string): Promise<Partial<FinancialsSnapshot> | null> {
  try {
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": "ID-8 Discovery Tool (Microsoft Innovation Hub)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return {
      companyName: data.name,
      industry: data.sicDescription,
      country: data.addresses?.business?.country || "US",
      fiscalYearEnd: data.fiscalYearEnd,
      website: data.website,
    };
  } catch {
    return null;
  }
}

// ── Alpha Vantage (optional, with key) ──────────────────────────────────────
async function alphaVantage(ticker: string): Promise<Partial<FinancialsSnapshot> | null> {
  if (!ALPHA_VANTAGE_KEY) return null;
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHA_VANTAGE_KEY}`);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (!data || !data.Symbol) return null;
    return {
      companyName: data.Name,
      industry: data.Industry,
      sector: data.Sector,
      country: data.Country,
      marketCapUSD: Number(data.MarketCapitalization) || undefined,
      revenueUSD: Number(data.RevenueTTM) || undefined,
      fiscalYearEnd: data.FiscalYearEnd,
      description: data.Description,
    };
  } catch {
    return null;
  }
}

// ── Companies House (UK, optional) ──────────────────────────────────────────
async function companiesHouseSearch(name: string): Promise<Partial<FinancialsSnapshot> | null> {
  if (!COMPANIES_HOUSE_KEY) return null;
  try {
    const auth = Buffer.from(`${COMPANIES_HOUSE_KEY}:`).toString("base64");
    const res = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(name)}&items_per_page=1`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const item = data?.items?.[0];
    if (!item) return null;
    return {
      companyName: item.title,
      country: "GB",
      description: item.description,
    };
  } catch {
    return null;
  }
}

function mergeSnapshot(base: FinancialsSnapshot, patch: Partial<FinancialsSnapshot>): void {
  for (const k of Object.keys(patch) as (keyof FinancialsSnapshot)[]) {
    const v = (patch as any)[k];
    if (v != null && v !== "" && (base as any)[k] == null) {
      (base as any)[k] = v;
    }
  }
}

async function companyFinancialsHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };
  try {
    const ticker = (request.query.get("ticker") || "").trim().toUpperCase();
    const region = (request.query.get("region") || "GLOBAL").toUpperCase();
    if (!ticker) {
      return { status: 400, headers: corsHeaders, jsonBody: { error: "Missing ticker query parameter" } };
    }
    const cacheKey = `${region}:${ticker}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" }, jsonBody: hit.data };
    }

    const snapshot: FinancialsSnapshot = {
      ticker,
      region,
      sources: [],
      fetchedAt: new Date().toISOString(),
    };

    // Always try Yahoo first (broadest coverage)
    const y = await yahooQuote(ticker);
    if (y) {
      mergeSnapshot(snapshot, y);
      snapshot.sources.push({ name: "Yahoo Finance", url: `https://finance.yahoo.com/quote/${ticker}` });
    }

    // US: layer in SEC EDGAR
    if (region === "US" || /^[A-Z.]{1,5}$/.test(ticker)) {
      const cik = await secLookupCIK(ticker);
      if (cik) {
        const sec = await secSubmissions(cik);
        if (sec) {
          mergeSnapshot(snapshot, sec);
          snapshot.sources.push({ name: "SEC EDGAR", url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}` });
        }
      }
    }

    // Alpha Vantage fills gaps (revenue, market cap) where Yahoo blocked
    const av = await alphaVantage(ticker);
    if (av) {
      mergeSnapshot(snapshot, av);
      snapshot.sources.push({ name: "Alpha Vantage" });
    }

    // UK: try Companies House by name
    if (region === "UK" && snapshot.companyName) {
      const ch = await companiesHouseSearch(snapshot.companyName);
      if (ch) {
        mergeSnapshot(snapshot, ch);
        snapshot.sources.push({ name: "Companies House (UK)" });
      }
    }

    cache.set(cacheKey, { at: Date.now(), data: snapshot });
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
      jsonBody: snapshot,
    };
  } catch (err) {
    return { status: 502, headers: corsHeaders, jsonBody: { error: safeErrorMessage(err, "Failed to fetch company financials") } };
  }
}

app.http("company-financials", {
  route: "company-financials",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: companyFinancialsHandler,
});
