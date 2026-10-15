import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeCorsHeaders, safeErrorMessage } from "../lib/xml-utils";
import { findCuratedTickers } from "../lib/known-tickers";
import { completeAI } from "../lib/ai-completion";

/**
 * Azure Function for Earnings Transcript Search
 * Searches multiple FREE sources:
 * - SEC EDGAR (US public companies)
 * - JSE SENS (South African companies)
 * - Yahoo Finance (Global)
 * - Alpha Vantage (Global, with free API key)
 */

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY;

interface EarningsTranscript {
  id: string;
  companyName: string;
  ticker?: string;
  quarter: string;
  year: number;
  date: string;
  source: "sec-edgar" | "jse-sens" | "yahoo-finance" | "alpha-vantage" | "manual";
  url?: string;
  summary?: string;
}

interface SearchRequest {
  companyName: string;
  ticker?: string;
  region?: "US" | "ZA" | "EU" | "GLOBAL";
}

const corsHeaders = makeCorsHeaders("POST, OPTIONS");

// SEC EDGAR Search (US Companies - Free, no key needed)
async function searchSECEdgar(companyName: string, ticker?: string): Promise<EarningsTranscript[]> {
  try {
    const searchTerm = ticker || companyName;
    const url = `https://efts.sec.gov/LATEST/search-index?q="${encodeURIComponent(searchTerm)}"&dateRange=custom&startdt=2024-01-01&enddt=2026-12-31&forms=8-K`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ID-8 Discovery Tool (Microsoft Innovation Hub)",
        Accept: "application/json",
      },
    });

    if (!response.ok) return [];

    const data = await response.json() as any;
    const transcripts: EarningsTranscript[] = [];

    if (data.hits?.hits) {
      for (const hit of data.hits.hits.slice(0, 5)) {
        const filing = hit._source;
        const desc = (filing.file_description || "").toLowerCase();
        if (filing.form === "8-K" && (desc.includes("earning") || desc.includes("result"))) {
          transcripts.push({
            id: `sec-${hit._id}`,
            companyName: filing.display_names?.[0] || companyName,
            ticker: filing.tickers?.[0],
            quarter: extractQuarter(filing.file_date),
            year: new Date(filing.file_date).getFullYear(),
            date: filing.file_date,
            source: "sec-edgar",
            url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${filing.cik}&type=8-K`,
          });
        }
      }
    }
    return transcripts;
  } catch (error) {
    console.error("SEC EDGAR error:", error);
    return [];
  }
}

// JSE SENS Search (South African Companies - Free, no key needed)
async function searchJSESens(companyName: string, ticker?: string): Promise<EarningsTranscript[]> {
  try {
    // JSE SENS API endpoint for announcements
    const searchTerm = ticker || companyName;
    const url = `https://www.jse.co.za/api/sens?keyword=${encodeURIComponent(searchTerm)}&pageSize=10`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ID-8 Discovery Tool (Microsoft Innovation Hub)",
        Accept: "application/json",
      },
    });

    // If API doesn't work, return static URL for manual access
    if (!response.ok) {
      // Return a helpful link to search manually
      return [{
        id: `jse-manual-${Date.now()}`,
        companyName,
        ticker,
        quarter: "Recent",
        year: new Date().getFullYear(),
        date: new Date().toISOString(),
        source: "jse-sens",
        url: `https://www.jse.co.za/sens?keyword=${encodeURIComponent(searchTerm)}`,
        summary: `Search JSE SENS for ${companyName} announcements including earnings results, trading statements, and financial updates.`,
      }];
    }

    const data = await response.json() as any;
    const transcripts: EarningsTranscript[] = [];

    // Parse SENS announcements for earnings-related items
    const announcements = data.items || data.announcements || data || [];
    for (const item of announcements.slice(0, 5)) {
      const title = (item.title || item.headline || "").toLowerCase();
      const isEarnings = 
        title.includes("result") ||
        title.includes("earning") ||
        title.includes("trading statement") ||
        title.includes("financial") ||
        title.includes("interim") ||
        title.includes("annual");

      if (isEarnings) {
        const dateStr = item.date || item.publishedDate || item.releaseDate || new Date().toISOString();
        transcripts.push({
          id: `jse-${item.id || Date.now()}-${transcripts.length}`,
          companyName: item.company || item.issuer || companyName,
          ticker: item.ticker || item.jseCode || ticker,
          quarter: extractQuarter(dateStr),
          year: new Date(dateStr).getFullYear(),
          date: dateStr,
          source: "jse-sens",
          url: item.url || item.link || `https://www.jse.co.za/sens/${item.id}`,
          summary: item.title || item.headline || item.description,
        });
      }
    }

    // Always include manual search link
    if (transcripts.length === 0) {
      transcripts.push({
        id: `jse-search-${Date.now()}`,
        companyName,
        ticker,
        quarter: "Search",
        year: new Date().getFullYear(),
        date: new Date().toISOString(),
        source: "jse-sens",
        url: `https://www.jse.co.za/sens?keyword=${encodeURIComponent(searchTerm)}`,
        summary: `Search JSE SENS directly for ${companyName} announcements.`,
      });
    }

    return transcripts;
  } catch (error) {
    console.error("JSE SENS error:", error);
    // Return manual search link on error
    return [{
      id: `jse-fallback-${Date.now()}`,
      companyName,
      ticker,
      quarter: "Search",
      year: new Date().getFullYear(),
      date: new Date().toISOString(),
      source: "jse-sens",
      url: `https://www.jse.co.za/sens?keyword=${encodeURIComponent(ticker || companyName)}`,
      summary: `Search JSE SENS for ${companyName} earnings and financial announcements.`,
    }];
  }
}

// Yahoo Finance (Global - Free, no key needed)
async function searchYahooFinance(companyName: string, ticker?: string): Promise<EarningsTranscript[]> {
  if (!ticker) return [];

  try {
    // Yahoo Finance API for earnings
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=earnings,earningsHistory,earningsTrend`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ID-8 Discovery Tool",
      },
    });

    if (!response.ok) {
      // Return link to Yahoo Finance page
      return [{
        id: `yahoo-link-${Date.now()}`,
        companyName,
        ticker,
        quarter: "Recent",
        year: new Date().getFullYear(),
        date: new Date().toISOString(),
        source: "yahoo-finance",
        url: `https://finance.yahoo.com/quote/${ticker}/analysis`,
        summary: `View ${ticker} earnings analysis and estimates on Yahoo Finance.`,
      }];
    }

    const data = await response.json() as any;
    const transcripts: EarningsTranscript[] = [];

    // Extract earnings history
    const earningsHistory = data.quoteSummary?.result?.[0]?.earningsHistory?.history || [];
    
    for (const earning of earningsHistory.slice(0, 4)) {
      const dateStr = earning.quarter?.fmt || new Date().toISOString().split('T')[0];
      const epsActual = earning.epsActual?.raw;
      const epsEstimate = earning.epsEstimate?.raw;
      const surprise = earning.epsDifference?.raw;
      const surprisePercent = earning.surprisePercent?.raw;

      transcripts.push({
        id: `yahoo-${ticker}-${dateStr}`,
        companyName,
        ticker,
        quarter: extractQuarter(dateStr),
        year: new Date(dateStr).getFullYear(),
        date: dateStr,
        source: "yahoo-finance",
        url: `https://finance.yahoo.com/quote/${ticker}/analysis`,
        summary: epsActual !== undefined 
          ? `EPS: ${epsActual} (Est: ${epsEstimate}), Surprise: ${surprise} (${(surprisePercent * 100).toFixed(1)}%)`
          : `Earnings data for ${ticker}`,
      });
    }

    // Add link to full analysis
    transcripts.push({
      id: `yahoo-analysis-${Date.now()}`,
      companyName,
      ticker,
      quarter: "Analysis",
      year: new Date().getFullYear(),
      date: new Date().toISOString(),
      source: "yahoo-finance",
      url: `https://finance.yahoo.com/quote/${ticker}/analysis`,
      summary: `View full earnings analysis, estimates, and trends for ${ticker}.`,
    });

    return transcripts;
  } catch (error) {
    console.error("Yahoo Finance error:", error);
    // Return link on error
    if (ticker) {
      return [{
        id: `yahoo-fallback-${Date.now()}`,
        companyName,
        ticker,
        quarter: "View",
        year: new Date().getFullYear(),
        date: new Date().toISOString(),
        source: "yahoo-finance",
        url: `https://finance.yahoo.com/quote/${ticker}`,
        summary: `View ${ticker} on Yahoo Finance for earnings and financial data.`,
      }];
    }
    return [];
  }
}

// Alpha Vantage (Earnings data)
async function searchAlphaVantage(ticker: string): Promise<EarningsTranscript[]> {
  if (!ALPHA_VANTAGE_KEY || !ticker) return [];

  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHA_VANTAGE_KEY}`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json() as any;
    const transcripts: EarningsTranscript[] = [];

    if (data.quarterlyEarnings) {
      for (const earning of data.quarterlyEarnings.slice(0, 4)) {
        const date = new Date(earning.fiscalDateEnding);
        transcripts.push({
          id: `av-${ticker}-${earning.fiscalDateEnding}`,
          companyName: data.symbol || ticker,
          ticker,
          quarter: `Q${Math.ceil((date.getMonth() + 1) / 3)}`,
          year: date.getFullYear(),
          date: earning.fiscalDateEnding,
          source: "alpha-vantage",
          summary: `Reported EPS: ${earning.reportedEPS}, Estimated: ${earning.estimatedEPS}, Surprise: ${earning.surprisePercentage}%`,
        });
      }
    }
    return transcripts;
  } catch (error) {
    console.error("Alpha Vantage error:", error);
    return [];
  }
}

// Helper to add manual search links for companies
function createManualSearchLinks(companyName: string, ticker?: string): EarningsTranscript[] {
  const links: EarningsTranscript[] = [];
  const searchTerm = ticker || companyName;
  const year = new Date().getFullYear();

  // Google search for transcripts
  links.push({
    id: `google-${Date.now()}`,
    companyName,
    ticker,
    quarter: "Search",
    year,
    date: new Date().toISOString(),
    source: "manual",
    url: `https://www.google.com/search?q=${encodeURIComponent(`"${searchTerm}" earnings call transcript ${year}`)}`,
    summary: `Google search for ${companyName} earnings call transcripts.`,
  });

  // Seeking Alpha (no subscription needed to search)
  if (ticker) {
    links.push({
      id: `sa-${Date.now()}`,
      companyName,
      ticker,
      quarter: "View",
      year,
      date: new Date().toISOString(),
      source: "manual",
      url: `https://seekingalpha.com/symbol/${ticker}/earnings/transcripts`,
      summary: `Seeking Alpha transcripts for ${ticker} (may require free account).`,
    });
  }

  // Motley Fool
  links.push({
    id: `fool-${Date.now()}`,
    companyName,
    ticker,
    quarter: "Search",
    year,
    date: new Date().toISOString(),
    source: "manual",
    url: `https://www.fool.com/search/solr.aspx?q=${encodeURIComponent(`${searchTerm} earnings call transcript`)}`,
    summary: `Motley Fool search for ${companyName} transcripts.`,
  });

  return links;
}

function extractQuarter(dateStr: string): string {
  const month = new Date(dateStr).getMonth() + 1;
  return `Q${Math.ceil(month / 3)}`;
}

// Main function
async function earningsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  try {
    const body = await req.json().catch(() => ({})) as Partial<SearchRequest>;
    const { companyName, ticker, region = "GLOBAL" } = body;

    if (!companyName) {
      return { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: { error: "companyName is required" } 
      };
    }

    // Search all sources in parallel
    const searches: Promise<EarningsTranscript[]>[] = [];

    // SEC EDGAR for US companies
    if (region === "US" || region === "GLOBAL") {
      searches.push(searchSECEdgar(companyName, ticker));
    }

    // JSE SENS for South African companies
    if (region === "ZA" || region === "GLOBAL") {
      searches.push(searchJSESens(companyName, ticker));
    }

    // Yahoo Finance for global coverage (if ticker provided)
    if (ticker) {
      searches.push(searchYahooFinance(companyName, ticker));
    }

    // Alpha Vantage if ticker and key available
    if (ticker && ALPHA_VANTAGE_KEY) {
      searches.push(searchAlphaVantage(ticker));
    }

    const results = await Promise.allSettled(searches);
    const allTranscripts: EarningsTranscript[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        allTranscripts.push(...result.value);
      }
    }

    // Add manual search links if we have few results
    if (allTranscripts.length < 3) {
      allTranscripts.push(...createManualSearchLinks(companyName, ticker));
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = allTranscripts.filter((t) => {
      const key = t.url || t.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by date (most recent first), but keep manual links at end
    unique.sort((a, b) => {
      if (a.source === "manual" && b.source !== "manual") return 1;
      if (a.source !== "manual" && b.source === "manual") return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: {
        transcripts: unique.slice(0, 12),
        sources: {
          secEdgar: region === "US" || region === "GLOBAL",
          jseSens: region === "ZA" || region === "GLOBAL",
          yahooFinance: !!ticker,
          alphaVantage: !!ALPHA_VANTAGE_KEY && !!ticker,
        },
      },
    };
  } catch (error: any) {
    context.error("Earnings search error:", error);
    return {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { error: "Search failed", details: safeErrorMessage(error, "Search failed") },
    };
  }
}

app.http("earnings", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "earnings/search",
  handler: earningsHandler,
});

// Ticker Lookup Handler
interface TickerLookupRequest {
  companyName: string;
}

interface TickerLookupResult {
  ticker: string;
  name: string;
  exchange?: string;
  region?: string;
  source:
    | "yahoo"
    | "alpha-vantage"
    | "openfigi"
    | "wikidata"
    | "tradingview"
    | "sec-edgar"
    | "stooq"
    | "curated"
    | "ai-guess";
  confidence: "high" | "medium" | "low";
  score?: number;
}

type TickerSourceStatus = "ok" | "empty" | "error" | "rate-limited" | "skipped";
type TickerSourceKey =
  | "curated"
  | "openfigi"
  | "wikidata"
  | "tradingview"
  | "yahoo"
  | "sec-edgar"
  | "stooq"
  | "alpha-vantage"
  | "ai";
type TickerDiagnostics = Partial<Record<TickerSourceKey, TickerSourceStatus>>;

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|inc\.|ltd|ltd\.|limited|plc|holdings?|group|corp|corp\.|corporation|co|co\.|company|sa|ag|pty|pty\.|bv|nv)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeNormalized(name: string): string[] {
  const normalized = normalizeCompanyName(name);
  return normalized ? normalized.split(" ").filter(t => t.length >= 2) : [];
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const t of aSet) {
    if (bSet.has(t)) intersection++;
  }
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function computeFuzzyScore(queryCompanyName: string, candidateName: string, candidateTicker: string): number {
  const q = normalizeCompanyName(queryCompanyName);
  const c = normalizeCompanyName(candidateName);

  if (!q || !c) return 0;

  const tokenScore = jaccardSimilarity(tokenizeNormalized(q), tokenizeNormalized(c));
  const includesBonus = (c.includes(q) || q.includes(c)) ? 0.25 : 0;
  const startsWithBonus = c.startsWith(q) ? 0.15 : 0;
  const tickerBonus = candidateTicker && q.replace(/\s/g, "").includes(candidateTicker.toLowerCase()) ? 0.15 : 0;

  return Math.max(0, Math.min(1, tokenScore + includesBonus + startsWithBonus + tickerBonus));
}

async function lookupTickerYahoo(companyName: string): Promise<TickerLookupResult[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(companyName)}&quotesCount=10&newsCount=0`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ID-8 Discovery Tool",
      },
    });

    if (!response.ok) return [];

    const data = await response.json() as any;
    const results: TickerLookupResult[] = [];

    if (data.quotes) {
      for (const quote of data.quotes.slice(0, 5)) {
        if (quote.symbol && quote.shortname) {
          // Determine confidence based on name match
          const nameLower = companyName.toLowerCase();
          const quoteName = (quote.shortname || quote.longname || "").toLowerCase();
          let confidence: "high" | "medium" | "low" = "low";
          
          if (quoteName.includes(nameLower) || nameLower.includes(quoteName)) {
            confidence = "high";
          } else if (quoteName.split(" ").some((word: string) => nameLower.includes(word) && word.length > 3)) {
            confidence = "medium";
          }

          // Determine region from exchange
          let region = "GLOBAL";
          const exchange = quote.exchange || "";
          if (exchange.includes("JSE") || quote.symbol.endsWith(".JO")) {
            region = "ZA";
          } else if (["NMS", "NYQ", "NGM", "NYE"].includes(exchange)) {
            region = "US";
          } else if (["LSE", "FRA", "PAR"].includes(exchange)) {
            region = "EU";
          }

          results.push({
            ticker: quote.symbol,
            name: quote.shortname || quote.longname || quote.symbol,
            exchange: quote.exchange,
            region,
            source: "yahoo",
            confidence,
            score: undefined,
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Yahoo ticker lookup error:", error);
    return [];
  }
}

async function lookupTickerAlphaVantage(companyName: string): Promise<TickerLookupResult[]> {
  if (!ALPHA_VANTAGE_KEY) return [];

  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(companyName)}&apikey=${ALPHA_VANTAGE_KEY}`;
    
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json() as any;
    const results: TickerLookupResult[] = [];

    if (data.bestMatches) {
      for (const match of data.bestMatches.slice(0, 5)) {
        const matchScore = parseFloat(match["9. matchScore"] || "0");
        let confidence: "high" | "medium" | "low" = "low";
        
        if (matchScore >= 0.8) confidence = "high";
        else if (matchScore >= 0.5) confidence = "medium";

        // Determine region
        const region = match["4. region"] || "GLOBAL";
        let regionCode = "GLOBAL";
        if (region.includes("United States")) regionCode = "US";
        else if (region.includes("South Africa")) regionCode = "ZA";
        else if (region.includes("Europe") || region.includes("United Kingdom")) regionCode = "EU";

        results.push({
          ticker: match["1. symbol"],
          name: match["2. name"],
          exchange: match["4. region"],
          region: regionCode,
          source: "alpha-vantage",
          confidence,
          score: isFinite(matchScore) ? Math.max(0, Math.min(1, matchScore)) : undefined,
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Alpha Vantage ticker lookup error:", error);
    return [];
  }
}

// ── Per-source timeout wrapper ───────────────────────────────────────────
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch(() => { clearTimeout(t); resolve(fallback); });
  });
}

// ── In-memory LRU cache (no TTL; cold-start refresh) ─────────────────────
const TICKER_CACHE_MAX = 200;
const tickerCache = new Map<string, { tickers: TickerLookupResult[]; diagnostics: TickerDiagnostics }>();
function cacheGet(key: string) {
  const v = tickerCache.get(key);
  if (!v) return null;
  // touch — re-insert to end for LRU
  tickerCache.delete(key);
  tickerCache.set(key, v);
  return v;
}
function cacheSet(key: string, value: { tickers: TickerLookupResult[]; diagnostics: TickerDiagnostics }) {
  if (tickerCache.has(key)) tickerCache.delete(key);
  tickerCache.set(key, value);
  while (tickerCache.size > TICKER_CACHE_MAX) {
    const oldest = tickerCache.keys().next().value;
    if (oldest === undefined) break;
    tickerCache.delete(oldest);
  }
}

// ── Source: Curated (Layer 0, instant) ───────────────────────────────────
function lookupTickerCurated(name: string): TickerLookupResult[] {
  const matches = findCuratedTickers(normalizeCompanyName(name));
  return matches.map((m) => ({
    ticker: m.ticker,
    name: m.name,
    exchange: m.exchange,
    region: m.region,
    source: "curated" as const,
    confidence: "high" as const,
    score: 1,
  }));
}

// ── Source: OpenFIGI (anonymous; Bloomberg-backed; global) ───────────────
async function lookupTickerOpenFIGI(name: string): Promise<TickerLookupResult[]> {
  const url = "https://api.openfigi.com/v3/search";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.OPENFIGI_API_KEY) headers["X-OPENFIGI-APIKEY"] = process.env.OPENFIGI_API_KEY;
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: name }),
  });
  if (!resp.ok) throw new Error(`OpenFIGI ${resp.status}`);
  const data = (await resp.json()) as any;
  const items = Array.isArray(data?.data) ? data.data : [];
  const out: TickerLookupResult[] = [];
  const seen = new Set<string>();
  for (const it of items.slice(0, 12)) {
    const ticker = String(it.ticker || it.figi || "").trim();
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    const exch = String(it.exchCode || it.compositeExchCode || "");
    let region = "GLOBAL";
    if (["US", "UN", "UQ", "UA", "UR", "UN"].includes(exch)) region = "US";
    else if (["SJ", "JNB"].includes(exch)) region = "ZA";
    else if (["LN", "LSE", "GR", "FR", "FP"].includes(exch)) region = "EU";
    out.push({
      ticker,
      name: String(it.name || ticker),
      exchange: exch || it.securityType || undefined,
      region,
      source: "openfigi",
      confidence: "medium",
    });
  }
  return out;
}

// ── Source: Wikidata (no key; multilingual; global) ──────────────────────
async function lookupTickerWikidata(name: string): Promise<TickerLookupResult[]> {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5&origin=*`;
  const sResp = await fetch(searchUrl, { headers: { "User-Agent": "ID-8/1.0" } });
  if (!sResp.ok) throw new Error(`Wikidata search ${sResp.status}`);
  const sData = (await sResp.json()) as any;
  const candidates: { qid: string; label: string }[] = (sData?.search || []).slice(0, 3).map((s: any) => ({
    qid: s.id,
    label: s.label || name,
  }));
  if (!candidates.length) return [];
  const out: TickerLookupResult[] = [];
  // Resolve P249 (ticker symbol) on each candidate entity
  for (const c of candidates) {
    try {
      const eResp = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${c.qid}.json`, {
        headers: { "User-Agent": "ID-8/1.0" },
      });
      if (!eResp.ok) continue;
      const eData = (await eResp.json()) as any;
      const entity = eData?.entities?.[c.qid];
      const claims = entity?.claims?.P249;
      if (!Array.isArray(claims)) continue;
      for (const claim of claims.slice(0, 4)) {
        const ticker = claim?.mainsnak?.datavalue?.value;
        if (typeof ticker !== "string" || !ticker.trim()) continue;
        // P414 qualifier = stock exchange
        const exchClaim = claim?.qualifiers?.P414?.[0]?.datavalue?.value?.id;
        out.push({
          ticker: ticker.trim(),
          name: c.label,
          exchange: exchClaim ? `wikidata:${exchClaim}` : undefined,
          region: "GLOBAL",
          source: "wikidata",
          confidence: "medium",
        });
      }
    } catch {
      // Per-entity errors are non-fatal
    }
  }
  return out;
}

// ── Source: TradingView symbol search (no key; global; very accurate) ────
async function lookupTickerTradingView(name: string): Promise<TickerLookupResult[]> {
  const url = `https://symbol-search.tradingview.com/symbol_search/?text=${encodeURIComponent(name)}&hl=1&lang=en&search_type=undefined`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ID-8/1.0)",
      "Origin": "https://www.tradingview.com",
      "Referer": "https://www.tradingview.com/",
    },
  });
  if (!resp.ok) throw new Error(`TradingView ${resp.status}`);
  const data = (await resp.json()) as any;
  const items = Array.isArray(data) ? data : data?.symbols || [];
  const out: TickerLookupResult[] = [];
  for (const it of items.slice(0, 8)) {
    const symbol = String(it.symbol || "").replace(/<[^>]+>/g, "").trim();
    const exch = String(it.exchange || "").trim();
    const desc = String(it.description || "").replace(/<[^>]+>/g, "").trim() || symbol;
    if (!symbol) continue;
    let region = "GLOBAL";
    if (["NASDAQ", "NYSE", "AMEX"].includes(exch)) region = "US";
    else if (["JSE"].includes(exch)) region = "ZA";
    else if (["LSE", "XETR", "EURONEXT"].includes(exch)) region = "EU";
    out.push({
      ticker: exch === "JSE" ? `${symbol}.JO` : symbol,
      name: desc,
      exchange: exch || undefined,
      region,
      source: "tradingview",
      confidence: "medium",
    });
  }
  return out;
}

// ── Source: SEC EDGAR (US filings; no key) ───────────────────────────────
async function lookupTickerSecEdgar(name: string): Promise<TickerLookupResult[]> {
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${name}"`)}&forms=10-K`;
  const resp = await fetch(url, { headers: { "User-Agent": "ID-8/1.0 contact@example.com" } });
  if (!resp.ok) throw new Error(`SEC EDGAR ${resp.status}`);
  const data = (await resp.json()) as any;
  const hits = data?.hits?.hits || [];
  const out: TickerLookupResult[] = [];
  const seen = new Set<string>();
  for (const h of hits.slice(0, 5)) {
    const tickers: string[] = h?._source?.tickers || [];
    const displayName: string = h?._source?.display_names?.[0] || name;
    for (const t of tickers) {
      const ticker = String(t || "").trim().toUpperCase();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      out.push({
        ticker,
        name: displayName.replace(/\s*\(CIK.*\)$/, "").trim(),
        exchange: "SEC",
        region: "US",
        source: "sec-edgar",
        confidence: "medium",
      });
    }
  }
  return out;
}

// ── Source: Stooq (no key; HTML parse last-resort) ───────────────────────
async function lookupTickerStooq(name: string): Promise<TickerLookupResult[]> {
  const slug = encodeURIComponent(name.toLowerCase().trim().replace(/\s+/g, "+"));
  const url = `https://stooq.com/q/?s=${slug}`;
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ID-8/1.0)" } });
  if (!resp.ok) throw new Error(`Stooq ${resp.status}`);
  const html = await resp.text();
  // Stooq page title pattern: "Anglo American (AAL.UK) - Stooq" or "MSFT.US - Microsoft Corp - Stooq"
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch) return [];
  const title = titleMatch[1];
  const tickerMatch = title.match(/\(?([A-Z0-9.\-]{2,12})\.([A-Z]{2,3})\)?/);
  if (!tickerMatch) return [];
  const symbol = `${tickerMatch[1]}.${tickerMatch[2]}`;
  const region = tickerMatch[2] === "US" ? "US" : tickerMatch[2] === "UK" ? "EU" : tickerMatch[2] === "JO" ? "ZA" : "GLOBAL";
  return [{
    ticker: symbol,
    name: title.split(" - ")[1] || name,
    exchange: tickerMatch[2],
    region,
    source: "stooq",
    confidence: "low",
  }];
}

// ── Source: AI guess (Layer 8 — only when all others returned empty) ─────
async function aiTickerGuess(name: string): Promise<TickerLookupResult[]> {
  const prompt = `Return STRICT JSON only (no prose, no markdown) for the most likely PRIMARY publicly traded stock ticker for the company named "${name}".\nSchema: { "ticker": string, "exchange": string, "region": "US"|"ZA"|"EU"|"GLOBAL", "confidence": "high"|"medium"|"low", "reason": string }.\nIf you are not confident the company is publicly listed, return { "ticker": "", "exchange": "", "region": "GLOBAL", "confidence": "low", "reason": "unknown" }.`;
  const data = await completeAI({ task: "extraction", prompt, expectJson: true, timeoutMs: 5000 });
  const raw = data.content;
  if (!raw) return [];
  let parsed: any;
  try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return []; }
  const ticker = String(parsed?.ticker || "").trim().toUpperCase();
  if (!ticker) return [];
  return [{
    ticker,
    name,
    exchange: parsed?.exchange || undefined,
    region: parsed?.region || "GLOBAL",
    source: "ai-guess",
    confidence: "low",
    score: 0.5,
  }];
}


async function runFanOut(name: string): Promise<{
  results: TickerLookupResult[];
  diagnostics: TickerDiagnostics;
}> {
  const diagnostics: TickerDiagnostics = {};

  const curated = lookupTickerCurated(name);
  diagnostics.curated = curated.length ? "ok" : "empty";

  const TIMEOUT_MS = 4000;
  const tracked = async <T>(key: TickerSourceKey, p: Promise<T[]>): Promise<T[]> => {
    try {
      const v = await withTimeout(p, TIMEOUT_MS, [] as T[]);
      diagnostics[key] = (v as unknown[]).length ? "ok" : "empty";
      return v;
    } catch (err: any) {
      const msg = String(err?.message || err);
      diagnostics[key] = /429|rate/i.test(msg) ? "rate-limited" : "error";
      return [];
    }
  };

  const [openfigi, wikidata, tradingview, yahoo, edgar, stooq, alphav] = await Promise.all([
    tracked("openfigi", lookupTickerOpenFIGI(name)),
    tracked("wikidata", lookupTickerWikidata(name)),
    tracked("tradingview", lookupTickerTradingView(name)),
    tracked("yahoo", lookupTickerYahoo(name)),
    tracked("sec-edgar", lookupTickerSecEdgar(name)),
    tracked("stooq", lookupTickerStooq(name)),
    tracked("alpha-vantage", lookupTickerAlphaVantage(name)),
  ]);

  const results: TickerLookupResult[] = [
    ...curated,
    ...openfigi,
    ...wikidata,
    ...tradingview,
    ...yahoo,
    ...edgar,
    ...stooq,
    ...alphav,
  ];
  return { results, diagnostics };
}

const SOURCE_PRIORITY: Record<TickerLookupResult["source"], number> = {
  curated: 9,
  openfigi: 8,
  wikidata: 7,
  tradingview: 7,
  yahoo: 6,
  "sec-edgar": 6,
  stooq: 4,
  "alpha-vantage": 5,
  "ai-guess": 2,
};

function dedupeAndRank(query: string, results: TickerLookupResult[]): TickerLookupResult[] {
  const map = new Map<string, TickerLookupResult>();
  for (const r of results) {
    const key = r.ticker.toUpperCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, r);
      continue;
    }
    // Prefer higher source priority OR higher confidence
    const newPrio = SOURCE_PRIORITY[r.source] ?? 0;
    const oldPrio = SOURCE_PRIORITY[existing.source] ?? 0;
    if (newPrio > oldPrio) map.set(key, r);
  }
  const unique = Array.from(map.values());
  for (const r of unique) {
    if (typeof r.score !== "number") r.score = computeFuzzyScore(query, r.name, r.ticker);
    if (r.confidence === "low") {
      if ((r.score ?? 0) >= 0.85) r.confidence = "high";
      else if ((r.score ?? 0) >= 0.65) r.confidence = "medium";
    }
  }
  unique.sort((a, b) => {
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    if (sb !== sa) return sb - sa;
    const co = { high: 3, medium: 2, low: 1 } as const;
    const cd = co[b.confidence] - co[a.confidence];
    if (cd !== 0) return cd;
    return (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0);
  });
  return unique;
}

async function tickerLookupHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<TickerLookupRequest>;
    const { companyName } = body;

    if (!companyName || companyName.trim().length < 2) {
      return {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: { error: "companyName is required (min 2 characters)" },
      };
    }

    const cacheKey = normalizeCompanyName(companyName) || companyName.trim().toLowerCase();
    const cached = cacheGet(cacheKey);
    if (cached) {
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: { tickers: cached.tickers, diagnostics: cached.diagnostics, cached: true },
      };
    }

    // Round 1: raw name
    let { results, diagnostics } = await runFanOut(companyName);

    // Round 2: normalised name (only if first round was thin)
    const norm = normalizeCompanyName(companyName);
    if (results.length < 2 && norm && norm !== companyName.toLowerCase().trim()) {
      const second = await runFanOut(norm);
      results = results.concat(second.results);
      // Merge diagnostics: keep best status per source
      for (const k of Object.keys(second.diagnostics) as TickerSourceKey[]) {
        const a = diagnostics[k];
        const b = second.diagnostics[k];
        if (!a || (a !== "ok" && b === "ok")) diagnostics[k] = b;
      }
    }

    diagnostics.ai = "skipped";
    let ranked = dedupeAndRank(companyName, results).slice(0, 10);

    // Layer 8: AI guess only when no real source produced a hit.
    if (ranked.length === 0) {
      try {
        const ai = await withTimeout(aiTickerGuess(companyName), 6000, [] as TickerLookupResult[]);
        diagnostics.ai = ai.length ? "ok" : "empty";
        ranked = dedupeAndRank(companyName, ai).slice(0, 5);
      } catch (err: any) {
        diagnostics.ai = "error";
      }
    }

    const payload = { tickers: ranked, diagnostics };
    cacheSet(cacheKey, payload);

    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { ...payload, cached: false },
    };
  } catch (error: any) {
    context.error("Ticker lookup error:", error);
    return {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { error: "Ticker lookup failed", details: safeErrorMessage(error, "Ticker lookup failed") },
    };
  }
}

app.http("ticker-lookup", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "earnings/ticker-lookup",
  handler: tickerLookupHandler,
});

// ============================================================================
// FINANCIAL STATEMENTS HANDLER
// ============================================================================
interface FinancialsRequest {
  ticker: string;
}

async function financialsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  try {
    const body = await req.json().catch(() => ({})) as Partial<FinancialsRequest>;
    const { ticker } = body;

    if (!ticker) {
      return {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: { error: "ticker is required" },
      };
    }

    const statements: any[] = [];
    let summary = '';

    // Fetch from Alpha Vantage
    if (ALPHA_VANTAGE_KEY) {
      try {
        // Income Statement
        const incomeUrl = `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHA_VANTAGE_KEY}`;
        const incomeRes = await fetch(incomeUrl);
        const incomeData = await incomeRes.json() as any;

        // Balance Sheet
        const balanceUrl = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHA_VANTAGE_KEY}`;
        const balanceRes = await fetch(balanceUrl);
        const balanceData = await balanceRes.json() as any;

        // Parse annual reports
        const annualReports = incomeData.annualReports || [];
        const balanceReports = balanceData.annualReports || [];

        if (annualReports.length > 0) {
          const latest = annualReports[0];
          const latestBalance = balanceReports[0] || {};
          
          const revenue = parseInt(latest.totalRevenue || '0');
          const netIncome = parseInt(latest.netIncome || '0');
          const totalAssets = parseInt(latestBalance.totalAssets || '0');
          const totalLiabilities = parseInt(latestBalance.totalLiabilities || '0');

          statements.push({
            ticker,
            fiscalYear: parseInt(latest.fiscalDateEnding?.substring(0, 4) || '2024'),
            revenue,
            netIncome,
            totalAssets,
            totalLiabilities,
            source: 'alpha-vantage',
          });

          // Format currency
          const formatNum = (num: number) => {
            if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
            if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
            return `$${num.toLocaleString()}`;
          };

          summary = `${ticker} reported ${formatNum(revenue)} in revenue with ${formatNum(netIncome)} net income. Total assets: ${formatNum(totalAssets)}.`;
        }
      } catch (error) {
        console.error('Alpha Vantage financials error:', error);
      }
    }

    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { statements, summary },
    };
  } catch (error: any) {
    context.error("Financials fetch error:", error);
    return {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { error: "Failed to fetch financials", details: safeErrorMessage(error, "Failed to fetch financials") },
    };
  }
}

app.http("financials", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "earnings/financials",
  handler: financialsHandler,
});

// ============================================================================
// NEWS HANDLER
// ============================================================================
interface NewsRequest {
  companyName: string;
  ticker?: string;
}

async function newsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  try {
    const body = await req.json().catch(() => ({})) as Partial<NewsRequest>;
    const { companyName, ticker } = body;

    if (!companyName) {
      return {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: { error: "companyName is required" },
      };
    }

    const articles: any[] = [];
    let summary = '';

    // Fetch from Alpha Vantage News API
    if (ALPHA_VANTAGE_KEY) {
      try {
        const searchTerm = ticker || companyName;
        const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(searchTerm)}&apikey=${ALPHA_VANTAGE_KEY}&limit=20&sort=LATEST`;
        
        const response = await fetch(url);
        const data = await response.json() as any;

        if (data.feed) {
          for (const item of data.feed.slice(0, 15)) {
            const sentiment = (item.overall_sentiment_label || 'Neutral').toLowerCase();
            articles.push({
              id: item.url || `news-${Date.now()}-${Math.random()}`,
              title: item.title,
              source: item.source,
              url: item.url,
              publishedAt: item.time_published,
              summary: item.summary || item.title,
              sentiment: sentiment === 'bullish' || sentiment === 'positive' ? 'positive' 
                       : sentiment === 'bearish' || sentiment === 'negative' ? 'negative' 
                       : 'neutral',
            });
          }

          summary = `Found ${articles.length} recent news articles about ${companyName}.`;
        }
      } catch (error) {
        console.error('News fetch error:', error);
      }
    }

    // If no news found, return empty but valid response
    if (articles.length === 0) {
      summary = `No recent news articles found for ${companyName}.`;
    }

    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { articles, summary },
    };
  } catch (error: any) {
    context.error("News fetch error:", error);
    return {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { error: "Failed to fetch news", details: safeErrorMessage(error, "Failed to fetch news") },
    };
  }
}

app.http("news", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "earnings/news",
  handler: newsHandler,
});

// ============================================================================
// INDUSTRY RESEARCH HANDLER
// ============================================================================
interface IndustryResearchRequest {
  industry: string;
  companyName: string;
}

function getIndustryInsights(industry: string): any[] {
  const insights: Record<string, any[]> = {
    'healthcare': [
      { id: '1', category: 'regulation', title: 'HIPAA Compliance', description: 'Health Insurance Portability and Accountability Act requirements for patient data protection', source: 'HHS.gov', relevanceScore: 10 },
      { id: '2', category: 'trend', title: 'AI in Medical Diagnostics', description: 'Growing adoption of AI and machine learning for medical imaging analysis and disease diagnosis', source: 'Healthcare IT News', relevanceScore: 9 },
      { id: '3', category: 'standard', title: 'HL7 FHIR Standard', description: 'Fast Healthcare Interoperability Resources for healthcare data exchange', source: 'HL7.org', relevanceScore: 8 },
      { id: '4', category: 'trend', title: 'Telemedicine Growth', description: 'Accelerated adoption of virtual care and remote patient monitoring', source: 'Industry Report', relevanceScore: 8 },
    ],
    'financial-services': [
      { id: '1', category: 'regulation', title: 'SOX Compliance', description: 'Sarbanes-Oxley Act requirements for financial reporting and internal controls', source: 'SEC.gov', relevanceScore: 10 },
      { id: '2', category: 'trend', title: 'Open Banking APIs', description: 'API-driven financial services enabling third-party access to banking data', source: 'Fintech Report', relevanceScore: 9 },
      { id: '3', category: 'regulation', title: 'PCI-DSS', description: 'Payment Card Industry Data Security Standard for payment processing', source: 'PCI Security Standards Council', relevanceScore: 9 },
      { id: '4', category: 'trend', title: 'AI Fraud Detection', description: 'Machine learning models for real-time fraud detection and prevention', source: 'Financial Technology', relevanceScore: 8 },
    ],
    'manufacturing': [
      { id: '1', category: 'standard', title: 'ISO 9001 Quality Management', description: 'International standard for quality management systems', source: 'ISO.org', relevanceScore: 9 },
      { id: '2', category: 'trend', title: 'Industry 4.0', description: 'Smart manufacturing with IoT, AI, and automation', source: 'Manufacturing Today', relevanceScore: 10 },
      { id: '3', category: 'trend', title: 'Predictive Maintenance', description: 'AI-powered predictive maintenance to reduce downtime', source: 'Industry Report', relevanceScore: 9 },
      { id: '4', category: 'standard', title: 'OPC UA Protocol', description: 'Open Platform Communications Unified Architecture for industrial automation', source: 'OPC Foundation', relevanceScore: 7 },
    ],
    'retail': [
      { id: '1', category: 'trend', title: 'Omnichannel Commerce', description: 'Seamless integration of online and offline retail experiences', source: 'Retail Dive', relevanceScore: 9 },
      { id: '2', category: 'trend', title: 'AI-Powered Personalization', description: 'Machine learning for personalized product recommendations', source: 'Retail Technology', relevanceScore: 8 },
      { id: '3', category: 'standard', title: 'PCI-DSS Compliance', description: 'Payment card data security for retail transactions', source: 'PCI SSC', relevanceScore: 9 },
      { id: '4', category: 'trend', title: 'Supply Chain Visibility', description: 'Real-time tracking and optimization of supply chain operations', source: 'Supply Chain Management', relevanceScore: 8 },
    ],
    'energy': [
      { id: '1', category: 'regulation', title: 'NERC CIP Standards', description: 'Critical Infrastructure Protection standards for power grid cybersecurity', source: 'NERC', relevanceScore: 10 },
      { id: '2', category: 'trend', title: 'Smart Grid Technology', description: 'Digital transformation of electrical grid with IoT and AI', source: 'Energy Magazine', relevanceScore: 9 },
      { id: '3', category: 'trend', title: 'Renewable Energy Integration', description: 'AI optimization for renewable energy sources and storage', source: 'Clean Energy Report', relevanceScore: 8 },
      { id: '4', category: 'standard', title: 'ISO 50001 Energy Management', description: 'International standard for energy management systems', source: 'ISO.org', relevanceScore: 7 },
    ],
    'mining-resources': [
      { id: '1', category: 'regulation', title: 'GISTM (Tailings Standard)', description: 'Global Industry Standard on Tailings Management — board-level disclosure of TSF stability, monitoring, and emergency response (post-Brumadinho).', source: 'ICMM / UNEP / PRI', relevanceScore: 10 },
      { id: '2', category: 'trend', title: 'Autonomous Haulage Systems (AHS)', description: 'AI-driven autonomous fleets at scale (Rio Tinto Pilbara, BHP, Fortescue) deliver 15-30% productivity gains and remove operators from hazardous zones.', source: 'McKinsey "Reimagining Mining" / Gartner Hype Cycle for Mining 2024', relevanceScore: 10 },
      { id: '3', category: 'trend', title: 'Predictive Maintenance for Heavy Equipment', description: 'IoT + ML on haul trucks, draglines, conveyors; 30-50% reduction in unplanned downtime documented in Microsoft + Vale and AWS + BHP case studies.', source: 'Microsoft Industry Cloud / AWS for Industries', relevanceScore: 9 },
      { id: '4', category: 'trend', title: 'AI for Mineral Exploration', description: 'ML on geophysical and satellite data to rank exploration targets — KoBold Metals + Google Cloud, Goldcorp + IBM Watson "Disrupt Mining" challenge.', source: 'Google Cloud / Bloomberg NEF', relevanceScore: 9 },
      { id: '5', category: 'regulation', title: 'Mine Health & Safety (MHSA / MSHA)', description: 'South African Mine Health & Safety Act (DMRE) and US MSHA Part 50 mandate incident reporting and fatality reduction; vision-based safety systems are leading indicators.', source: 'DMRE / MSHA', relevanceScore: 9 },
      { id: '6', category: 'trend', title: 'Mining Decarbonisation & Scope 1/2/3', description: 'Mining is 4-7% of global GHG; majors (Anglo American, BHP, Rio Tinto, Sibanye-Stillwater) have committed to net-zero pathways with electrification, hydrogen, and renewable PPAs.', source: 'Bloomberg NEF / ICMM / IEA', relevanceScore: 8 },
      { id: '7', category: 'standard', title: 'ICMM Mining Principles', description: '10 Mining Principles covering safety, human rights, ESG, water, biodiversity, and tailings — adopted by all ICMM member companies.', source: 'ICMM.com', relevanceScore: 8 },
      { id: '8', category: 'trend', title: 'Concentrator & Process Plant AI Optimisation', description: 'ML on historian data (PI, Aveva, ABB) for grinding/flotation/leaching: 1-3% recovery uplift, 3-7% throughput gain (FLSmidth, Stone Three case studies).', source: 'SME / OSIsoft', relevanceScore: 7 },
    ],
  };

  return insights[industry] || [
    { id: '1', category: 'trend', title: 'Digital Transformation', description: 'Organizations adopting cloud, AI, and automation technologies', source: 'Industry Research', relevanceScore: 8 },
    { id: '2', category: 'trend', title: 'Data Analytics', description: 'Growing focus on data-driven decision making', source: 'Technology Trends', relevanceScore: 7 },
  ];
}

async function industryResearchHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  try {
    const body = await req.json().catch(() => ({})) as Partial<IndustryResearchRequest>;
    const { industry, companyName } = body;

    if (!industry) {
      return {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: { error: "industry is required" },
      };
    }

    // Get curated insights based on industry
    const insights = getIndustryInsights(industry);
    const summary = `Key trends, standards, and regulations for ${industry} industry.`;

    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { insights, summary },
    };
  } catch (error: any) {
    context.error("Industry research error:", error);
    return {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: { error: "Failed to fetch industry research", details: safeErrorMessage(error, "Failed to fetch industry research") },
    };
  }
}

app.http("industry-research", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "earnings/industry-research",
  handler: industryResearchHandler,
});
