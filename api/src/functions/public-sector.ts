import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeCorsHeaders, safeErrorMessage, parseRSSItems, type RSSItem } from "../lib/xml-utils";

/**
 * /api/public-sector?entity=SASSA[&country=ZA]
 *
 * Research aggregator for NON-LISTED / public-sector entities — government
 * departments, agencies, provincial / municipal governments and state-owned
 * enterprises (e.g. SASSA, SARS, Western Cape Government). These are exactly the
 * cases the SEC/JSE filings path and the ticker-based financials path cannot
 * serve, because such entities neither list on an exchange nor file with a
 * securities regulator.
 *
 * South-Africa-first, using free / no-key authoritative sources:
 *
 *  - PMG (api.pmg.org.za)   Parliamentary committee briefings, tabled reports,
 *                           ministerial questions and policy docs — the richest
 *                           oversight signal for a public entity.
 *  - Google News (ZA)       Public-sector-tuned, relevance-filtered and
 *                           classified news (budget, audit/AGSA, tenders,
 *                           leadership, service delivery, governance, ...).
 *  - Wikidata (P31)         Entity-type detection (government agency / provincial
 *                           government / SOE ...) — informational.
 *  - Authoritative portals  Curated deep-links (Vulekamali budgets, eTenders,
 *                           Municipal Money, Auditor-General, PMG) for going
 *                           deeper into the raw numbers.
 *
 * Every source is individually timed-out and never throws; the endpoint always
 * returns HTTP 200 with whatever could be gathered plus per-source diagnostics,
 * so the UI renders a useful state rather than a hard error.
 */

const corsHeaders = makeCorsHeaders("GET, OPTIONS");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const SOURCE_TIMEOUT_MS = Number(process.env.PUBLIC_SECTOR_TIMEOUT_MS) || 8000;
const UA = "ID-8 Discovery Tool (Microsoft Innovation Hub)";

type SourceStatus = "ok" | "empty" | "error" | "timeout";

interface PublicSectorPortal {
  name: string;
  url: string;
  description?: string;
}

interface PublicSectorResponse {
  entity: string;
  country?: string;
  entityType?: string; // human label from Wikidata P31 (e.g. "government agency")
  isPublicSector?: boolean;
  items: RSSItem[];
  portals: PublicSectorPortal[];
  source: "live";
  diagnostics: Record<string, SourceStatus>;
  message?: string;
  fetchedAt: string;
}

const cache = new Map<string, { at: number; data: PublicSectorResponse }>();

// ── timeout wrapper: never throws, resolves to fallback on timeout/error ──────
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timer = setTimeout(() => resolve({ value: fallback, timedOut: true }), ms);
  });
  const work = p.then((value) => ({ value, timedOut: false })).catch(() => ({ value: fallback, timedOut: false }));
  const result = await Promise.race([work, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  return JSON.parse(await fetchText(url, headers));
}

// ── PMG — parliamentary oversight (api.pmg.org.za /search) ────────────────────
const PMG_TYPE_LABEL: Record<string, string> = {
  committee_meeting: "Committee Meeting",
  tabled_committee_report: "Tabled Report",
  briefing: "Briefing",
  minister_question: "Parliamentary Question",
  question_reply: "Parliamentary Question",
  hansard: "Hansard",
  policy_document: "Policy Document",
  call_for_comment: "Call for Comment",
  bill: "Bill",
};

async function fetchPmg(entity: string): Promise<RSSItem[]> {
  const url = `https://api.pmg.org.za/search/?q=${encodeURIComponent(`"${entity}"`)}&per_page=25`;
  const data = await fetchJson(url, { "User-Agent": UA, Accept: "application/json" });
  const results = Array.isArray(data?.results) ? data.results : [];
  const out: RSSItem[] = [];
  for (const r of results) {
    const s = r?._source || {};
    const label = PMG_TYPE_LABEL[String(s._doc_type || "")];
    if (!label) continue; // skip daily_schedule, post, member, committee, ...
    const title = String(s.title || "").trim();
    if (!title) continue;
    const link = String(s.url || s.api_url || "").replace(/^http:\/\//, "https://");
    const date = String(s.date || "");
    const committee = s.committee_name ? ` \u00b7 ${s.committee_name}` : "";
    out.push({
      title: `[PMG] ${title}`,
      description: `Parliamentary \u00b7 ${label}${committee}`,
      link,
      pubDate: date ? new Date(date).toUTCString() : "",
    });
    if (out.length >= 15) break;
  }
  return out;
}

// ── Public-sector news (ZA-scoped, tuned, relevance-filtered, classified) ─────
// Corporate / generic tokens dropped when matching an entity name in a headline.
const GOV_STOPWORDS = new Set([
  "the", "and", "of", "sa", "south", "african", "africa", "government", "national",
  "provincial", "department", "agency", "agencies", "office", "authority", "service",
  "services", "ministry", "public", "limited", "ltd", "soc", "municipality",
  "metropolitan", "metro", "city", "local", "district",
]);

/** Public-sector signal type inferred from a South-African headline. */
function classifyPublicSectorSignal(title: string): string {
  const t = title.toLowerCase();
  if (/\b(budget|allocation|appropriation|spending|expenditure|funding|grant|bailout)\b/.test(t)) return "Budget";
  if (/\b(audit|auditor[- ]general|agsa|qualified|disclaimer|clean audit|irregular|fruitless|wasteful)\b/.test(t)) return "Audit";
  if (/\b(tender|procurement|contract|bid|rfp|supplier|awarded|sourcing)\b/.test(t)) return "Procurement";
  if (/\b(director[- ]general|\bdg\b|\bceo\b|commissioner|minister|appoint|resign|suspend|\bboard\b|acting)\b/.test(t)) return "Leadership";
  if (/\b(service delivery|backlog|outage|failure|crisis|collapse|protest|payment|beneficiar|queue)\b/.test(t)) return "Service Delivery";
  if (/\b(corruption|fraud|investigat|court|litigation|probe|\bsiu\b|hawks)\b/.test(t)) return "Governance / Legal";
  if (/\b(parliament|committee|portfolio committee|scopa|oversight|briefing)\b/.test(t)) return "Parliamentary";
  if (/\b(digital|modernis|system|technology|\bict\b|cloud|\bdata\b|cyber|platform|automation)\b/.test(t)) return "Technology";
  return "";
}

async function fetchPublicSectorNews(entity: string): Promise<RSSItem[]> {
  const query =
    `"${entity}" (budget OR "annual report" OR "audit outcome" OR "auditor-general" OR AGSA OR ` +
    `"irregular expenditure" OR tender OR procurement OR "service delivery" OR parliament OR ` +
    `minister OR "director-general" OR appointment OR corruption OR modernisation OR digital)`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-ZA&gl=ZA&ceid=ZA:en`;
  const xml = await fetchText(url, {
    "User-Agent": "Mozilla/5.0 (compatible; ID-8/1.0; +https://github.com/TsholoMSFT/ID-8)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  });

  // Distinctive entity tokens a relevant headline must contain (drops generic noise).
  const tokens = entity
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !GOV_STOPWORDS.has(w));

  const out: RSSItem[] = [];
  for (const it of parseRSSItems(xml)) {
    const titleLc = it.title.toLowerCase();
    if (tokens.length > 0 && !tokens.every((tok) => titleLc.includes(tok))) continue;
    const type = classifyPublicSectorSignal(it.title);
    out.push({
      ...it,
      title: it.title.startsWith("[") ? it.title : `[News] ${it.title}`,
      description: type ? `Public Sector \u00b7 ${type}` : "Public-sector news",
    });
    if (out.length >= 25) break;
  }
  return out;
}

// ── Wikidata (P31) — entity-type detection, informational ─────────────────────
const GOV_KEYWORDS =
  /(government|agency|department|ministry|municipal|provincial|state[- ]owned|parastatal|public (?:body|entity|service|sector|institution)|revenue service|authority|commission|legislature|metropolitan)/i;

// Curated entity-type labels for well-known South-African public-sector bodies
// whose short names collide with unrelated Wikidata items (e.g. SARS = disease,
// SASSA = surname). Keyed by lower-cased name / acronym.
const ZA_PUBLIC_SECTOR_TYPES: Record<string, string> = {
  sars: "revenue service",
  "south african revenue service": "revenue service",
  sassa: "government agency",
  "south african social security agency": "government agency",
  nsfas: "government agency",
  uif: "government agency",
  raf: "government agency",
  "road accident fund": "government agency",
  saps: "government department",
  eskom: "state-owned enterprise",
  transnet: "state-owned enterprise",
  prasa: "state-owned enterprise",
  denel: "state-owned enterprise",
  sabc: "state-owned enterprise",
  "south african airways": "state-owned enterprise",
};

async function detectEntityType(entity: string): Promise<{ label?: string; isPublicSector: boolean }> {
  const curated = ZA_PUBLIC_SECTOR_TYPES[entity.trim().toLowerCase()];
  if (curated) return { label: curated, isPublicSector: true };

  // Wikidata `wbsearchentities` matches labels/aliases; the top hit that reads as
  // public-sector wins. (Ambiguous acronyms are handled by the curated map above
  // and by the PMG-presence fallback in the handler.)
  const url =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=10&origin=*` +
    `&search=${encodeURIComponent(entity)}`;
  const data = await fetchJson(url, { "User-Agent": UA });
  const candidates: any[] = Array.isArray(data?.search) ? data.search : [];
  const isGov = (c: any) => GOV_KEYWORDS.test(`${c?.description || ""} ${c?.label || ""}`);

  const chosen = candidates.find(isGov) || candidates[0];
  if (!chosen?.id) return { isPublicSector: false };

  const entUrl = `https://www.wikidata.org/wiki/Special:EntityData/${chosen.id}.json`;
  const edata = await fetchJson(entUrl, { "User-Agent": UA });
  const claims = edata?.entities?.[chosen.id]?.claims || {};
  const p31: string[] = (claims.P31 || [])
    .map((c: any) => c?.mainsnak?.datavalue?.value?.id)
    .filter((x: any): x is string => typeof x === "string");

  let labels: string[] = [];
  if (p31.length) {
    const lblUrl =
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&origin=*` +
      `&ids=${p31.join("|")}`;
    const ldata = await fetchJson(lblUrl, { "User-Agent": UA });
    labels = p31.map((id) => ldata?.entities?.[id]?.labels?.en?.value).filter((l: any): l is string => !!l);
  }

  // Prefer the first "instance of" label that reads as public-sector; else the first.
  const govLabel = labels.find((l) => GOV_KEYWORDS.test(l));
  const label = govLabel || labels[0] || chosen.description;
  const isPublicSector = GOV_KEYWORDS.test(`${labels.join(" ")} ${chosen.description || ""}`);
  return { label, isPublicSector };
}

// ── Authoritative portals (curated, verified-stable deep-links) ───────────────
function buildPortals(isMunicipal: boolean): PublicSectorPortal[] {
  const portals: PublicSectorPortal[] = [
    {
      name: "National Treasury — Vulekamali",
      url: "https://vulekamali.gov.za/",
      description: "National & provincial department and public-entity budgets and expenditure — for deal sizing.",
    },
    {
      name: "eTenders (National Treasury)",
      url: "https://www.etenders.gov.za/",
      description: "Tenders and awards across all spheres of government — procurement and incumbent-vendor signal.",
    },
    {
      name: "Auditor-General of South Africa",
      url: "https://www.agsa.co.za/",
      description: "PFMA / MFMA audit outcomes and reports (audit opinions, irregular expenditure).",
    },
    {
      name: "Parliamentary Monitoring Group",
      url: "https://pmg.org.za/",
      description: "Committee briefings, performance reviews and tabled annual reports & performance plans.",
    },
  ];
  if (isMunicipal) {
    portals.splice(1, 0, {
      name: "Municipal Money (National Treasury)",
      url: "https://municipalmoney.gov.za/",
      description: "Municipal financial health — audit opinion, cash position and irregular expenditure.",
    });
  }
  return portals;
}

async function publicSectorHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

  const entity = (request.query.get("entity") || request.query.get("company") || "").trim();
  const country = (request.query.get("country") || "").trim() || undefined;
  if (entity.length < 2) {
    return { status: 400, headers: corsHeaders, jsonBody: { error: "Missing or too-short 'entity' query parameter" } };
  }

  const cacheKey = `${(country || "").toLowerCase()}:${entity.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" }, jsonBody: hit.data };
  }

  const [pmg, news, etype] = await Promise.all([
    withTimeout(fetchPmg(entity), SOURCE_TIMEOUT_MS, [] as RSSItem[]),
    withTimeout(fetchPublicSectorNews(entity), SOURCE_TIMEOUT_MS, [] as RSSItem[]),
    withTimeout(detectEntityType(entity), SOURCE_TIMEOUT_MS, { isPublicSector: false } as { label?: string; isPublicSector: boolean }),
  ]);

  const diagnostics: Record<string, SourceStatus> = {
    pmg: pmg.timedOut ? "timeout" : pmg.value.length ? "ok" : "empty",
    news: news.timedOut ? "timeout" : news.value.length ? "ok" : "empty",
    wikidata: etype.timedOut ? "timeout" : etype.value.label ? "ok" : "empty",
  };

  // Merge PMG (authoritative) first, then news; de-dupe by link.
  const seen = new Set<string>();
  const items: RSSItem[] = [];
  for (const it of [...pmg.value, ...news.value]) {
    const key = it.link || it.title;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
  }

  // Parliament actively overseeing an entity is a strong public-sector signal, so
  // trust PMG presence when Wikidata can't confirm the type (e.g. acronym clashes).
  let entityType = etype.value.label;
  let isPublicSector = etype.value.isPublicSector;
  if (!isPublicSector && pmg.value.length > 0) {
    isPublicSector = true;
    entityType = "public sector entity";
  }

  const isMunicipal =
    /\b(municipalit|metro|city of|local municipality|district municipality)\b/i.test(entity) ||
    /municipal/i.test(entityType || "");

  const data: PublicSectorResponse = {
    entity,
    country,
    entityType,
    isPublicSector,
    items,
    portals: buildPortals(isMunicipal),
    source: "live",
    diagnostics,
    message:
      items.length === 0
        ? "No parliamentary or news signals found. Use the authoritative portals below to research this entity directly."
        : undefined,
    fetchedAt: new Date().toISOString(),
  };

  context.log(`public-sector "${entity}" -> pmg:${diagnostics.pmg} news:${diagnostics.news} type:${etype.value.label || "?"} items:${items.length}`);

  try {
    cache.set(cacheKey, { at: Date.now(), data });
    return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" }, jsonBody: data };
  } catch (err) {
    return { status: 200, headers: corsHeaders, jsonBody: { ...data, warning: safeErrorMessage(err, "partial result") } };
  }
}

app.http("public-sector", {
  route: "public-sector",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: publicSectorHandler,
});
