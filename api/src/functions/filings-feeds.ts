import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  makeCorsHeaders,
  safeErrorMessage,
  streamToString,
  parseRSSItems,
  type RSSItem,
} from "../lib/xml-utils";

/**
 * Company filings watcher reader.
 *
 * Serves regulatory filings for a company from Blob Storage (written by the
 * `id8-filings-monitor` Logic App as `{company}-filings-<timestamp>.xml`),
 * and transparently falls back to **live** sources when no cached blob exists:
 *   • SEC EDGAR  — official US filings Atom feed (per company).
 *   • JSE / SENS — South-African announcements via a Google-News proxy query.
 *
 * Always returns HTTP 200 (with a diagnostic `message` on degraded paths) so the
 * UI renders an empty state rather than a hard error.
 */

function getStorageConnectionString(): string | undefined {
  return (process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage)?.trim();
}

const CONTAINER_NAME = "filings";
const corsHeaders = makeCorsHeaders("GET, OPTIONS");
const FETCH_TIMEOUT_MS = 8000;

function companyPrefix(company: string): string {
  return company
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

const SEC_UA = "ID-8-Research/1.0 (Microsoft Innovation Hub)";

/**
 * Resolve a company name to its primary SEC CIK using the EDGAR full-text entity
 * aggregation (a tiny hits=1 request that still returns the full entity buckets,
 * ranked by filing count). The dominant bucket whose name matches the query is
 * the company's own registrant entity — far more reliable than relevance-ranking
 * raw full-text hits, which for common names is dominated by other filers.
 */
async function resolveSecCik(
  company: string,
  context: InvocationContext,
): Promise<{ cik: string; name: string } | null> {
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${company}"`)}&hits=1`;
  let raw: string;
  try {
    raw = await fetchWithTimeout(url, { "User-Agent": SEC_UA, Accept: "application/json" });
  } catch (e: any) {
    context.warn(`filings: SEC CIK lookup failed: ${e?.message ?? "unknown"}`);
    return null;
  }
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const buckets = data?.aggregations?.entity_filter?.buckets;
  if (!Array.isArray(buckets)) return null;
  const lc = company.toLowerCase();
  // Buckets are ordered by filing count desc; pick the first whose name matches the query.
  for (const b of buckets) {
    const key = String(b?.key || "");
    if (!key.toLowerCase().includes(lc)) continue;
    const m = key.match(/CIK\s+(\d{6,10})/i);
    if (m) {
      const name = key.replace(/\s*\(CIK\s+\d+\)\s*$/i, "").replace(/\s+/g, " ").trim();
      return { cik: m[1].replace(/^0+/, ""), name };
    }
  }
  return null;
}

/**
 * Live US filings for a company, resolved authoritatively: name → CIK (EDGAR
 * full-text entity aggregation) → the company's own most-recent filings (EDGAR
 * submissions API). This avoids the relevance noise of a raw full-text search,
 * which for common names (e.g. "Microsoft") is dominated by *other* filers that
 * merely mention the company.
 */
async function fetchSecFilings(company: string, context: InvocationContext): Promise<RSSItem[]> {
  const resolved = await resolveSecCik(company, context);
  if (!resolved) return [];
  const { cik, name } = resolved;
  const cik10 = cik.padStart(10, "0");

  let raw: string;
  try {
    raw = await fetchWithTimeout(`https://data.sec.gov/submissions/CIK${cik10}.json`, {
      "User-Agent": SEC_UA,
      Accept: "application/json",
    });
  } catch (e: any) {
    context.warn(`filings: SEC submissions fetch failed: ${e?.message ?? "unknown"}`);
    return [];
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }

  const recent = data?.filings?.recent;
  if (!recent || !Array.isArray(recent.accessionNumber)) return [];

  const filerName = String(data?.name || name || company);
  const wanted = new Set([
    "10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A", "20-F", "20-F/A", "6-K", "40-F",
  ]);

  const forms: string[] = recent.form || [];
  const dates: string[] = recent.filingDate || [];
  const accns: string[] = recent.accessionNumber || [];
  const descs: string[] = recent.primaryDocDescription || [];
  const reportItems: string[] = recent.items || [];

  const out: RSSItem[] = [];
  for (let i = 0; i < accns.length && out.length < 25; i++) {
    const form = String(forms[i] || "");
    if (!wanted.has(form)) continue;
    const accn = String(accns[i] || "");
    if (!accn) continue;
    const accnNoDash = accn.replace(/-/g, "");
    const date = String(dates[i] || "");
    const descParts: string[] = [];
    if (descs[i]) descParts.push(String(descs[i]));
    if (reportItems[i]) descParts.push(`Items ${reportItems[i]}`);
    out.push({
      title: `[SEC] ${form} \u2014 ${filerName}`,
      description: descParts.join(" \u00b7 ") || `${form} filing`,
      link: `https://www.sec.gov/Archives/edgar/data/${cik}/${accnNoDash}/${accn}-index.htm`,
      pubDate: date ? new Date(`${date}T00:00:00Z`).toUTCString() : "",
    });
  }
  return out;
}

/** SENS-style announcement type inferred from a JSE / South-African headline. */
function classifySens(title: string): string {
  const t = title.toLowerCase();
  if (/\btrading statement\b/.test(t)) return "Trading Statement";
  if (/\btrading update\b/.test(t)) return "Trading Update";
  if (/\bcautionary\b/.test(t)) return "Cautionary";
  if (/\bdividend\b|\bdistribution\b/.test(t)) return "Dividend";
  if (/\bresults\b|\bheadline earnings\b|\bswings? to\b|\b(interim|final|annual|half[- ]?year|full[- ]?year|quarterly)\b/.test(t)) return "Results";
  if (/\b(acquisition|acquires?|disposal|merger|buyout|take[- ]?over|unbundl|scheme of arrangement)\b/.test(t)) return "Corporate Action";
  if (/\b(director|board|ceo|cfo|chair|appoint|resign|retire|steps? down)\b/.test(t)) return "Directorate";
  if (/\b(agm|annual general meeting|circular|prospectus)\b/.test(t)) return "Notice";
  if (/\bsens\b/.test(t)) return "SENS";
  return "";
}

// Corporate suffixes/stopwords dropped when matching a company name in a headline.
const JSE_STOPWORDS = new Set([
  "group", "holdings", "limited", "ltd", "plc", "inc", "incorporated",
  "corporation", "corp", "company", "the", "and", "of", "sa",
]);

/**
 * Live JSE / SENS-style announcements for a (typically South-African) company via a
 * ZA-scoped Google-News query targeting SENS announcement types, then narrowed to
 * headlines that actually name the company and tagged with the detected SENS type.
 * Authoritative SENS documents sit behind the JSE's paid feed, so this is the best
 * free proxy; dual-listed SA issuers also surface via the SEC 6-K/20-F path.
 */
async function fetchJseFilings(company: string, context: InvocationContext): Promise<RSSItem[]> {
  const query =
    `"${company}" (SENS OR "trading statement" OR "trading update" OR "interim results" OR ` +
    `"final results" OR "annual results" OR "results presentation" OR cautionary OR dividend OR ` +
    `acquisition OR disposal OR "director dealings")`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-ZA&gl=ZA&ceid=ZA:en`;

  let xml: string;
  try {
    xml = await fetchWithTimeout(url, {
      "User-Agent": "Mozilla/5.0 (compatible; ID-8/1.0; +https://github.com/TsholoMSFT/ID-8)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    });
  } catch (e: any) {
    context.warn(`filings: JSE fetch failed: ${e?.message ?? "unknown"}`);
    return [];
  }

  // Distinctive company tokens a relevant headline must contain (drops generic JSE noise).
  const tokens = company
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !JSE_STOPWORDS.has(w));

  const items: RSSItem[] = [];
  try {
    for (const it of parseRSSItems(xml)) {
      const titleLc = it.title.toLowerCase();
      if (tokens.length > 0 && !tokens.every((tok) => titleLc.includes(tok))) continue;
      const type = classifySens(it.title);
      items.push({
        ...it,
        title: it.title.startsWith("[") ? it.title : `[JSE] ${it.title}`,
        description: type ? `SENS \u00b7 ${type}` : "JSE / SENS announcement",
      });
    }
  } catch (e: any) {
    context.warn(`filings: JSE parse failed: ${e?.message ?? "unknown"}`);
  }
  return items;
}

/** Fetch live filings: SEC EDGAR (US + SA dual-listings) + JSE/SENS proxy (South Africa). */
async function fetchLiveFilings(company: string, context: InvocationContext): Promise<RSSItem[]> {
  const [secRes, jseRes] = await Promise.allSettled([
    fetchSecFilings(company, context),
    fetchJseFilings(company, context),
  ]);

  const items: RSSItem[] = [];
  if (secRes.status === "fulfilled") items.push(...secRes.value);
  else context.warn(`filings: SEC fetch failed: ${secRes.reason?.message ?? "unknown"}`);
  if (jseRes.status === "fulfilled") items.push(...jseRes.value);
  else context.warn(`filings: JSE fetch failed: ${jseRes.reason?.message ?? "unknown"}`);

  // De-dupe by link.
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = (it.link || it.title).trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function filingsFeedsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: corsHeaders };

  const ok = (jsonBody: unknown): HttpResponseInit => ({
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    jsonBody,
  });

  const company = (req.query.get("company") || "").trim();
  const prefix = companyPrefix(company);
  const conn = getStorageConnectionString();

  const liveFallback = async (reason: string): Promise<HttpResponseInit> => {
    if (!company) return ok({ items: [], message: reason });
    try {
      const items = await fetchLiveFilings(company, context);
      return ok({
        items,
        company,
        source: "live",
        message: items.length ? undefined : `No filings found for "${company}" (SEC EDGAR + JSE).`,
      });
    } catch (e) {
      return ok({ items: [], company, source: "live", message: `Live filings fetch failed: ${safeErrorMessage(e, "unknown")}` });
    }
  };

  // Explicit cache bypass: the filings-monitor Logic App calls this with ?live=1 to
  // refresh the warm cache from the high-quality SEC EDGAR + JSE path; callers may also
  // use it to force fresh data.
  const forceLive = ["1", "true", "yes"].includes((req.query.get("live") || "").trim().toLowerCase());
  if (forceLive) return liveFallback("Live filings (cache bypassed).");

  // No storage configured → straight to live.
  if (!conn) return liveFallback("Filings storage not configured; using live SEC EDGAR + JSE.");

  try {
    const svc = BlobServiceClient.fromConnectionString(conn);
    const container = svc.getContainerClient(CONTAINER_NAME);

    let containerExists: boolean;
    try {
      containerExists = await Promise.race([
        container.exists(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Storage connectivity timeout (3s)")), 3000)),
      ]);
    } catch (connError: any) {
      context.warn("filings: storage unreachable:", connError.message);
      return liveFallback("Storage unavailable; using live SEC EDGAR + JSE.");
    }

    if (!containerExists) {
      return liveFallback("Filings container not found yet; using live SEC EDGAR + JSE.");
    }

    // Newest blob for the company.
    const blobs: Array<{ name: string; lastModified: Date }> = [];
    for await (const blob of container.listBlobsFlat()) {
      if (prefix && !blob.name.toLowerCase().startsWith(prefix + "-filings-")) continue;
      blobs.push({ name: blob.name, lastModified: blob.properties.lastModified || new Date(0) });
    }
    if (blobs.length === 0) {
      return liveFallback(`No cached filings for "${company}" yet; using live SEC EDGAR + JSE.`);
    }
    blobs.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    const latest = blobs[0];

    const dl = await container.getBlobClient(latest.name).download();
    if (!dl.readableStreamBody) return liveFallback("Cached filings blob was empty; using live SEC EDGAR + JSE.");
    const raw = await streamToString(dl.readableStreamBody);
    const items = parseFilingsBlob(raw);

    if (items.length === 0) {
      return liveFallback("Cached filings blob had no parsable items; using live SEC EDGAR + JSE.");
    }

    return ok({
      items,
      company: company || null,
      source: "cache",
      blobName: latest.name,
      lastModified: latest.lastModified.toISOString(),
      totalBlobs: blobs.length,
    });
  } catch (error) {
    context.error("filings-feeds error (falling back to live):", error);
    return liveFallback(`Filings read failed: ${safeErrorMessage(error, "unknown")}`);
  }
}

/**
 * Parse a cached filings blob into items. New blobs (written by the
 * filings-monitor Logic App via /api/filings-feeds?live=1) are JSON of the form
 * { items: RSSItem[] }; legacy blobs are raw RSS/Atom XML. Handle both.
 */
function parseFilingsBlob(raw: string): RSSItem[] {
  // Strip a leading UTF-8 BOM (the azureblob connector prepends one) and surrounding
  // whitespace so JSON.parse doesn't choke on a leading \uFEFF.
  const cleaned = (raw || "").replace(/^\uFEFF/, "").trim();
  if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
    try {
      const parsed = JSON.parse(cleaned);
      const arr = Array.isArray(parsed) ? parsed : parsed?.items;
      if (Array.isArray(arr)) {
        return arr
          .filter((it: any) => it && (it.title || it.link))
          .map((it: any) => ({
            title: String(it.title ?? ""),
            description: String(it.description ?? ""),
            link: String(it.link ?? ""),
            pubDate: String(it.pubDate ?? ""),
          }));
      }
    } catch {
      /* not JSON — fall through to XML parsing */
    }
  }
  return parseRSSItems(cleaned);
}

app.http("filings-feeds", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "filings-feeds",
  handler: filingsFeedsHandler,
});
