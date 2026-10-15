import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeCorsHeaders, safeErrorMessage } from "../lib/xml-utils";

/**
 * /api/company-profile?company=Acme%20Ltd&country=GB
 *
 * Unified company-identity aggregator that works for BOTH publicly-listed and
 * private / non-listed companies. Unlike /api/company-financials (which needs a
 * stock ticker), this resolves a company by NAME (+ optional country) using
 * free / no-key sources, degrading gracefully when optional keys are absent:
 *
 *  - Wikidata          (no key)  identity, industry, HQ, founded, employees, website, ticker
 *  - SEC EDGAR Form D  (no key)  US private-placement (Reg D) filings — signals private fundraising
 *  - Companies House   (optional COMPANIES_HOUSE_KEY)  UK public + private registry
 *  - OpenCorporates    (optional OPENCORPORATES_TOKEN) global company registries
 *
 * Every source is individually timed-out and never throws; missing keys mark the
 * source "skipped" in diagnostics. The endpoint therefore always returns 200 with
 * whatever could be gathered.
 */

const corsHeaders = makeCorsHeaders("GET, OPTIONS");
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const SOURCE_TIMEOUT_MS = Number(process.env.PROFILE_SOURCE_TIMEOUT_MS) || 6000;

const COMPANIES_HOUSE_KEY = process.env.COMPANIES_HOUSE_KEY;
const OPENCORPORATES_TOKEN = process.env.OPENCORPORATES_TOKEN;

const UA = "ID-8 Discovery Tool (Microsoft Innovation Hub)";

type SourceStatus = "ok" | "empty" | "error" | "skipped" | "timeout";

interface RegistryRecord {
  registry: string; // "Companies House (UK)" | "OpenCorporates"
  name: string;
  companyNumber?: string;
  jurisdiction?: string;
  status?: string; // active / dissolved / liquidation ...
  companyType?: string;
  incorporatedOn?: string;
  registeredAddress?: string;
  sicCodes?: string[];
  url?: string;
}

interface FormDFiling {
  issuer: string;
  filedAt?: string;
  accessionNo?: string;
  cik?: string;
  url?: string;
}

interface CompanyProfile {
  query: { company: string; country?: string };
  identity: {
    name: string;
    aliases?: string[];
    description?: string;
    website?: string;
    industry?: string;
    founded?: string;
    headquarters?: string;
    employees?: number;
  };
  isPublic: boolean;
  ticker?: { symbol: string; exchange?: string };
  registry: RegistryRecord[];
  privatePlacements: FormDFiling[];
  sources: { name: string; url?: string }[];
  diagnostics: Record<string, SourceStatus>;
  fetchedAt: string;
}

const cache = new Map<string, { at: number; data: CompanyProfile }>();

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

// ── Wikidata (no key) ─────────────────────────────────────────────────────────
interface WikidataResult {
  identity: Partial<CompanyProfile["identity"]>;
  ticker?: { symbol: string; exchange?: string };
  sourceUrl?: string;
  found: boolean;
}

async function fetchWikidata(company: string): Promise<WikidataResult> {
  const empty: WikidataResult = { identity: {}, found: false };
  // 1) search for the entity
  const searchUrl =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=1&origin=*` +
    `&search=${encodeURIComponent(company)}`;
  const sres = await fetch(searchUrl, { headers: { "User-Agent": UA } });
  if (!sres.ok) return empty;
  const sdata = (await sres.json()) as any;
  const top = sdata?.search?.[0];
  if (!top?.id) return empty;
  const qid: string = top.id;

  // 2) fetch the entity data
  const entUrl = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const eres = await fetch(entUrl, { headers: { "User-Agent": UA } });
  if (!eres.ok) {
    return { identity: { name: top.label, description: top.description }, sourceUrl: `https://www.wikidata.org/wiki/${qid}`, found: true };
  }
  const edata = (await eres.json()) as any;
  const entity = edata?.entities?.[qid];
  const claims = entity?.claims || {};

  const website = firstStringClaim(claims, "P856");
  const ticker = firstStringClaim(claims, "P249");
  const inception = firstTimeClaim(claims, "P571");
  const employees = firstQuantityClaim(claims, "P1128");

  // referenced QIDs to resolve into labels
  const industryQid = firstItemClaim(claims, "P452");
  const hqQid = firstItemClaim(claims, "P159");
  const exchangeQid = firstItemClaim(claims, "P414");
  const labels = await resolveLabels([industryQid, hqQid, exchangeQid]);

  const identity: Partial<CompanyProfile["identity"]> = {
    name: entity?.labels?.en?.value || top.label,
    description: entity?.descriptions?.en?.value || top.description,
    aliases: (entity?.aliases?.en || []).map((a: any) => a.value).slice(0, 5),
    website: website || undefined,
    industry: industryQid ? labels[industryQid] : undefined,
    headquarters: hqQid ? labels[hqQid] : undefined,
    founded: inception ? inception.slice(0, 10).replace(/^\+/, "") : undefined,
    employees: employees,
  };

  return {
    identity,
    ticker: ticker ? { symbol: ticker, exchange: exchangeQid ? labels[exchangeQid] : undefined } : undefined,
    sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
    found: true,
  };
}

function firstStringClaim(claims: any, prop: string): string | undefined {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === "string" ? v : undefined;
}
function firstItemClaim(claims: any, prop: string): string | undefined {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  return v?.id; // e.g. "Q12345"
}
function firstTimeClaim(claims: any, prop: string): string | undefined {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  return typeof v?.time === "string" ? v.time : undefined; // "+1998-09-04T00:00:00Z"
}
function firstQuantityClaim(claims: any, prop: string): number | undefined {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  const n = v?.amount != null ? Number(v.amount) : undefined;
  return Number.isFinite(n) ? n : undefined;
}

async function resolveLabels(qids: (string | undefined)[]): Promise<Record<string, string>> {
  const ids = qids.filter((q): q is string => !!q);
  if (ids.length === 0) return {};
  try {
    const url =
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&origin=*` +
      `&ids=${ids.join("|")}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return {};
    const data = (await res.json()) as any;
    const out: Record<string, string> = {};
    for (const id of ids) {
      const label = data?.entities?.[id]?.labels?.en?.value;
      if (label) out[id] = label;
    }
    return out;
  } catch {
    return {};
  }
}

// ── SEC EDGAR Form D (no key) — US private placement filings ──────────────────
async function fetchFormD(company: string): Promise<FormDFiling[]> {
  const url =
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${company}"`)}&forms=D`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  const hits = data?.hits?.hits || [];
  const out: FormDFiling[] = [];
  for (const h of hits.slice(0, 5)) {
    const src = h?._source || {};
    const cik = Array.isArray(src.cik) ? src.cik[0] : src.cik;
    const accession = (h?._id || "").split(":")[0];
    out.push({
      issuer: Array.isArray(src.display_names) ? src.display_names[0] : src.display_names || company,
      filedAt: src.file_date,
      accessionNo: accession || undefined,
      cik: cik ? String(cik) : undefined,
      url: cik
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=D`
        : undefined,
    });
  }
  return out;
}

// ── Companies House (UK, optional key) ────────────────────────────────────────
async function fetchCompaniesHouse(company: string): Promise<RegistryRecord[]> {
  if (!COMPANIES_HOUSE_KEY) return [];
  const auth = Buffer.from(`${COMPANIES_HOUSE_KEY}:`).toString("base64");
  const sres = await fetch(
    `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(company)}&items_per_page=3`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  if (!sres.ok) return [];
  const sdata = (await sres.json()) as any;
  const items = sdata?.items || [];
  const out: RegistryRecord[] = [];
  for (const it of items.slice(0, 3)) {
    const rec: RegistryRecord = {
      registry: "Companies House (UK)",
      name: it.title,
      companyNumber: it.company_number,
      jurisdiction: "gb",
      status: it.company_status,
      companyType: it.company_type,
      incorporatedOn: it.date_of_creation,
      registeredAddress: it.address_snippet,
      url: it.company_number ? `https://find-and-update.company-information.service.gov.uk/company/${it.company_number}` : undefined,
    };
    out.push(rec);
  }
  // enrich the top match with SIC codes from the full profile
  const top = out[0];
  if (top?.companyNumber) {
    try {
      const pres = await fetch(
        `https://api.company-information.service.gov.uk/company/${top.companyNumber}`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      if (pres.ok) {
        const p = (await pres.json()) as any;
        if (Array.isArray(p?.sic_codes)) top.sicCodes = p.sic_codes;
      }
    } catch {
      /* non-fatal */
    }
  }
  return out;
}

// ── OpenCorporates (optional token) ───────────────────────────────────────────
async function fetchOpenCorporates(company: string, country?: string): Promise<RegistryRecord[]> {
  if (!OPENCORPORATES_TOKEN) return [];
  const params = new URLSearchParams({ q: company, api_token: OPENCORPORATES_TOKEN, per_page: "3" });
  if (country) params.set("country_code", country.toLowerCase());
  const res = await fetch(`https://api.opencorporates.com/v0.4/companies/search?${params.toString()}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  const companies = data?.results?.companies || [];
  const out: RegistryRecord[] = [];
  for (const wrap of companies.slice(0, 3)) {
    const c = wrap?.company || {};
    out.push({
      registry: "OpenCorporates",
      name: c.name,
      companyNumber: c.company_number,
      jurisdiction: c.jurisdiction_code,
      status: c.current_status || (c.inactive ? "inactive" : "active"),
      companyType: c.company_type,
      incorporatedOn: c.incorporation_date,
      url: c.opencorporates_url,
    });
  }
  return out;
}

function mergeIdentity(base: CompanyProfile["identity"], patch: Partial<CompanyProfile["identity"]>): void {
  for (const k of Object.keys(patch) as (keyof CompanyProfile["identity"])[]) {
    const v = (patch as any)[k];
    const cur = (base as any)[k];
    if (v != null && v !== "" && (cur == null || cur === "")) {
      (base as any)[k] = v;
    }
  }
}

async function companyProfileHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

  const company = (request.query.get("company") || request.query.get("companyName") || "").trim();
  const country = (request.query.get("country") || "").trim() || undefined;
  if (company.length < 2) {
    return { status: 400, headers: corsHeaders, jsonBody: { error: "Missing or too-short 'company' query parameter" } };
  }

  const cacheKey = `${(country || "").toLowerCase()}:${company.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" }, jsonBody: hit.data };
  }

  const diagnostics: Record<string, SourceStatus> = {};

  // Run all four sources in parallel, each individually bounded + non-throwing.
  const [wiki, formD, ch, oc] = await Promise.all([
    withTimeout(fetchWikidata(company), SOURCE_TIMEOUT_MS, { identity: {}, found: false } as WikidataResult),
    withTimeout(fetchFormD(company), SOURCE_TIMEOUT_MS, [] as FormDFiling[]),
    withTimeout(fetchCompaniesHouse(company), SOURCE_TIMEOUT_MS, [] as RegistryRecord[]),
    withTimeout(fetchOpenCorporates(company, country), SOURCE_TIMEOUT_MS, [] as RegistryRecord[]),
  ]);

  const profile: CompanyProfile = {
    query: { company, country },
    identity: { name: company },
    isPublic: false,
    registry: [],
    privatePlacements: [],
    sources: [],
    diagnostics,
    fetchedAt: new Date().toISOString(),
  };

  // Wikidata
  diagnostics.wikidata = wiki.timedOut ? "timeout" : wiki.value.found ? "ok" : "empty";
  if (wiki.value.found) {
    mergeIdentity(profile.identity, wiki.value.identity);
    if (wiki.value.ticker) {
      profile.ticker = wiki.value.ticker;
      profile.isPublic = true;
    }
    if (wiki.value.sourceUrl) profile.sources.push({ name: "Wikidata", url: wiki.value.sourceUrl });
  }

  // SEC Form D (US private placements)
  diagnostics.secFormD = formD.timedOut ? "timeout" : formD.value.length ? "ok" : "empty";
  if (formD.value.length) {
    profile.privatePlacements = formD.value;
    profile.sources.push({ name: "SEC EDGAR (Form D)", url: "https://efts.sec.gov/LATEST/search-index?forms=D" });
  }

  // Companies House (UK)
  diagnostics.companiesHouse = !COMPANIES_HOUSE_KEY ? "skipped" : ch.timedOut ? "timeout" : ch.value.length ? "ok" : "empty";
  if (ch.value.length) {
    profile.registry.push(...ch.value);
    profile.sources.push({ name: "Companies House (UK)" });
  }

  // OpenCorporates
  diagnostics.openCorporates = !OPENCORPORATES_TOKEN ? "skipped" : oc.timedOut ? "timeout" : oc.value.length ? "ok" : "empty";
  if (oc.value.length) {
    profile.registry.push(...oc.value);
    profile.sources.push({ name: "OpenCorporates" });
  }

  context.log(
    `company-profile "${company}" -> wikidata:${diagnostics.wikidata} formD:${diagnostics.secFormD} ` +
      `ch:${diagnostics.companiesHouse} oc:${diagnostics.openCorporates}`
  );

  try {
    cache.set(cacheKey, { at: Date.now(), data: profile });
    return { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" }, jsonBody: profile };
  } catch (err) {
    return { status: 200, headers: corsHeaders, jsonBody: { ...profile, warning: safeErrorMessage(err, "partial profile") } };
  }
}

app.http("company-profile", {
  route: "company-profile",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: companyProfileHandler,
});
