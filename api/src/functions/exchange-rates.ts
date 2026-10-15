import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeCorsHeaders, safeErrorMessage } from "../lib/xml-utils";

/**
 * /api/exchange-rates?base=USD&symbols=ZAR,EUR,GBP
 * Free, key-less FX rates via exchangerate.host (ECB-backed).
 * 6-hour in-memory cache.
 */

const corsHeaders = makeCorsHeaders("GET, OPTIONS");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface CacheEntry {
  at: number;
  data: any;
}
const cache = new Map<string, CacheEntry>();

async function exchangeRatesHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }
  try {
    const base = (request.query.get("base") || "USD").toUpperCase();
    const symbols = (request.query.get("symbols") || "ZAR,EUR,GBP,USD").toUpperCase();
    const key = `${base}:${symbols}`;

    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" }, jsonBody: cached.data };
    }

    const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(symbols)}`;
    const res = await fetch(url, { headers: { "User-Agent": "ID-8/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} from exchangerate.host`);
    const data = (await res.json()) as any;

    const payload = {
      base,
      date: data.date,
      rates: data.rates ?? {},
      source: "exchangerate.host (ECB)",
      fetchedAt: new Date().toISOString(),
    };
    cache.set(key, { at: Date.now(), data: payload });
    return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" }, jsonBody: payload };
  } catch (err) {
    return { status: 502, headers: corsHeaders, jsonBody: { error: safeErrorMessage(err, "Failed to fetch exchange rates") } };
  }
}

app.http("exchange-rates", {
  route: "exchange-rates",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: exchangeRatesHandler,
});
