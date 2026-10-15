import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  makeCorsHeaders,
  streamToString,
  parseRegulatoryRSSItems,
  type RegulatoryFeedItem,
} from "../lib/xml-utils";

/**
 * Azure Function to fetch regulatory news feeds from Blob Storage
 * Regulatory data is stored by the id8-regulatory-monitor Logic App.
 * Falls back to Google News RSS with regulatory search terms.
 */

function getStorageConnectionString(): string | undefined {
  return (process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage)?.trim();
}

const CONTAINER_NAME = "regulatory-feeds";
const corsHeaders = makeCorsHeaders("GET, OPTIONS");

// ── Google News live fallback ───────────────────────────────────────────────

const JURISDICTION_SEARCH_QUERIES: Record<string, string[]> = {
  "South Africa": ["AI regulation South Africa POPIA", "AI policy South Africa"],
  "European Union": ["EU AI Act enforcement", "GDPR AI penalty"],
  "United States": ["AI regulation United States NIST", "AI enforcement FTC"],
  "United Kingdom": ["UK AI regulation enforcement"],
  "Australia": ["Australia AI ethics regulation"],
  "Brazil": ["Brazil LGPD AI regulation"],
  "Singapore": ["Singapore AI governance regulation"],
  "Kenya": ["Kenya data protection AI"],
  "Nigeria": ["Nigeria data protection regulation AI"],
  "India": ["India data protection DPDP AI"],
  "Canada": ["Canada AI regulation AIDA"],
  "China": ["China AI regulation enforcement"],
};

async function fetchLiveRegulatoryNews(
  jurisdictions: string[],
  query: string | undefined,
  context: InvocationContext
): Promise<RegulatoryFeedItem[]> {
  const allItems: RegulatoryFeedItem[] = [];

  // Build search queries per jurisdiction
  const queries: Array<{ query: string; jurisdiction: string }> = [];

  if (query) {
    queries.push({ query, jurisdiction: jurisdictions[0] || "International" });
  } else {
    for (const j of jurisdictions) {
      const jQueries = JURISDICTION_SEARCH_QUERIES[j] || [`AI regulation ${j}`];
      for (const q of jQueries.slice(0, 1)) {
        queries.push({ query: q, jurisdiction: j });
      }
    }
    if (queries.length === 0) {
      queries.push({ query: "AI regulation enforcement penalty", jurisdiction: "International" });
    }
  }

  // Fetch Google News RSS for each query (limit to 3 parallel)
  const fetchPromises = queries.slice(0, 3).map(async ({ query: q, jurisdiction }) => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ID-8/1.0; +https://github.com/TsholoMSFT/ID-8)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
      });
      if (!response.ok) return [];
      const xml = await response.text();
      return parseRegulatoryRSSItems(xml, jurisdiction, "Google News");
    } catch (error: any) {
      context.warn(`Live regulatory RSS fetch failed for "${q}":`, error.message);
      return [];
    }
  });

  const results = await Promise.allSettled(fetchPromises);
  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    }
  }

  return allItems;
}

// ── Main handler ────────────────────────────────────────────────────────────

async function regulatoryFeedsHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  const jurisdictionsParam = req.query.get("jurisdictions") || "";
  const industryParam = req.query.get("industry") || "";
  const queryParam = req.query.get("query") || "";

  const jurisdictions = jurisdictionsParam
    .split(",")
    .map((j) => j.trim())
    .filter(Boolean);

  const storageConnectionString = getStorageConnectionString();

  // Try Blob Storage first
  if (storageConnectionString) {
    try {
      const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
      const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
      const containerExists = await containerClient.exists();

      if (containerExists) {
        const allItems: RegulatoryFeedItem[] = [];
        const blobs: Array<{ name: string; lastModified: Date }> = [];

        for await (const blob of containerClient.listBlobsFlat()) {
          // Filter by jurisdiction prefix if provided
          const blobLower = blob.name.toLowerCase();
          if (jurisdictions.length > 0) {
            const matchesJurisdiction = jurisdictions.some((j) =>
              blobLower.startsWith(j.toLowerCase().replace(/\s+/g, "-"))
            );
            if (!matchesJurisdiction) continue;
          }
          blobs.push({
            name: blob.name,
            lastModified: blob.properties.lastModified || new Date(0),
          });
        }

        // Sort newest first, take up to 5 most recent blobs
        blobs.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

        for (const blob of blobs.slice(0, 5)) {
          try {
            const blobClient = containerClient.getBlobClient(blob.name);
            const downloadResponse = await blobClient.download();
            if (!downloadResponse.readableStreamBody) continue;

            const xmlContent = await streamToString(downloadResponse.readableStreamBody);

            // Extract jurisdiction from blob name (e.g., "south-africa-popia-2026-02-10.xml")
            const jurisdictionFromName = blob.name.split("-").slice(0, 2).join(" ");
            const items = parseRegulatoryRSSItems(xmlContent, jurisdictionFromName, `Cached: ${blob.name}`);
            allItems.push(...items);
          } catch (blobErr: any) {
            context.warn(`Failed to read blob ${blob.name}:`, blobErr.message);
          }
        }

        if (allItems.length > 0) {
          context.log(`Returning ${allItems.length} cached regulatory feed items`);
          return {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            jsonBody: {
              items: allItems,
              source: "cache",
              totalBlobs: blobs.length,
              lastUpdated: blobs[0]?.lastModified?.toISOString(),
            },
          };
        }
      }
    } catch (storageErr: any) {
      context.warn("Blob storage read failed, falling back to live:", storageErr.message);
    }
  }

  // Fallback: live Google News RSS
  context.log("No cached regulatory feeds, fetching live...");
  try {
    const liveItems = await fetchLiveRegulatoryNews(
      jurisdictions.length > 0 ? jurisdictions : ["International"],
      queryParam || undefined,
      context
    );

    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: {
        items: liveItems,
        source: "live",
        message: "Live regulatory news (no cached data available). Set up id8-regulatory-monitor Logic App for cached data.",
      },
    };
  } catch (liveErr: any) {
    context.error("Live regulatory RSS fetch failed:", liveErr);
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: {
        items: [],
        source: "none",
        message: `No regulatory feeds available: ${liveErr.message}`,
      },
    };
  }
}

app.http("regulatory-feeds", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "regulatory-feeds",
  handler: regulatoryFeedsHandler,
});
