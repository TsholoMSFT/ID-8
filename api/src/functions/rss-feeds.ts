import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  makeCorsHeaders,
  safeErrorMessage,
  streamToString,
  parseRSSItems,
  type RSSItem,
} from "../lib/xml-utils";
import { getOrFetchRSS, type CacheResult } from "../lib/rss-cache";

/**
 * Azure Function to fetch RSS feeds from Blob Storage
 * RSS data is stored by the id8-rss-monitor Logic App
 */

function getStorageConnectionString(): string | undefined {
  return (process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage)?.trim();
}
const CONTAINER_NAME = "rss-feeds";
const corsHeaders = makeCorsHeaders("GET, OPTIONS");

/**
 * Fetch live RSS from Google News when no cached data exists.
 * 8 s abort timeout protects callers from a slow upstream stalling the function.
 */
async function fetchLiveRSS(companyName: string, context: InvocationContext): Promise<RSSItem[]> {
  const query = encodeURIComponent(companyName);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  context.log(`Fetching live RSS for "${companyName}" from: ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ID-8/1.0; +https://github.com/TsholoMSFT/ID-8)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlContent = await response.text();
    const items = parseRSSItems(xmlContent);

    context.log(`Fetched ${items.length} live RSS items for "${companyName}"`);
    return items;
  } catch (error: any) {
    const reason = error?.name === "AbortError" ? "timeout (8s)" : safeErrorMessage(error, "unknown");
    context.error(`Failed to fetch live RSS for "${companyName}": ${reason}`);
    throw new Error(reason);
  } finally {
    clearTimeout(timeout);
  }
}

// Always-resolving wrapper that uses the SWR cache. Returns a CacheResult
// the handler can render directly. Empty company yields an empty result.
async function cachedLiveRSS(companyName: string, context: InvocationContext): Promise<CacheResult> {
  if (!companyName) return { items: [], source: "none" };
  return getOrFetchRSS(companyName, (c) => fetchLiveRSS(c, context), context);
}

function sourceLabel(s: CacheResult["source"]): string {
  switch (s) {
    case "fresh":
      return "live-cache";
    case "stale":
      return "live-cache-stale";
    case "live":
      return "live";
    default:
      return "none";
  }
}

async function rssFeedsHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  // Get company filter from query parameter
  const companyParam = req.query.get("company") || "";
  const companyPrefix = companyParam
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  const storageConnectionString = getStorageConnectionString();

  // Check if storage is configured
  if (!storageConnectionString) {
    context.warn("Azure Storage not configured - attempting live RSS fallback");
    if (companyParam) {
      const live = await cachedLiveRSS(companyParam, context);
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: {
          items: live.items,
          message:
            live.message ??
            `Live RSS fetched for "${companyParam}" (storage not configured)`,
          company: companyParam,
          source: sourceLabel(live.source),
          ageMs: live.ageMs,
        },
      };
    }
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: {
        items: [],
        message:
          "RSS storage not configured. Add AZURE_STORAGE_CONNECTION_STRING (preferred) or AzureWebJobsStorage to the environment.",
      },
    };
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    // Check if container exists (also validates connectivity to storage)
    // Use a 3-second timeout to fail fast if Azurite/storage is unreachable
    let containerExists: boolean;
    try {
      const timeoutMs = 3000;
      containerExists = await Promise.race([
        containerClient.exists(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Storage connectivity timeout (3s)")), timeoutMs)
        ),
      ]);
    } catch (connError: any) {
      // Storage unreachable (e.g., Azurite not running locally)
      context.warn("Azure Storage unreachable:", connError.message);
      if (companyParam) {
        context.log(`Storage unavailable, falling back to live RSS for "${companyParam}"...`);
        const live = await cachedLiveRSS(companyParam, context);
        return {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          jsonBody: {
            items: live.items,
            message:
              live.message ??
              (live.items.length
                ? `Live RSS fetched for "${companyParam}" (storage unavailable)`
                : `Storage unavailable and live RSS returned no items`),
            company: companyParam,
            source: sourceLabel(live.source),
            ageMs: live.ageMs,
            totalBlobs: 0,
          },
        };
      }
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: {
          items: [],
          message: "Azure Storage is unreachable. Start the Azurite emulator or configure a real connection string.",
        },
      };
    }

    if (!containerExists) {
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: { items: [], message: "RSS container not found" },
      };
    }

    // Get all blobs, optionally filtered by company prefix
    const blobs: Array<{ name: string; lastModified: Date }> = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      // Filter by company prefix if provided
      if (companyPrefix && !blob.name.toLowerCase().startsWith(companyPrefix + "-news-")) {
        continue;
      }
      blobs.push({
        name: blob.name,
        lastModified: blob.properties.lastModified || new Date(0),
      });
    }

    if (blobs.length === 0) {
      // No cached blobs found - try live RSS fetch if company specified
      if (companyParam) {
        context.log(`No cached RSS for "${companyParam}", fetching live...`);
        const live = await cachedLiveRSS(companyParam, context);
        return {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          jsonBody: {
            items: live.items,
            message:
              live.message ??
              (live.items.length
                ? `Live RSS fetched for "${companyParam}" (not cached yet)`
                : `No cached RSS for "${companyParam}" and live fetch returned no items`),
            company: companyParam,
            source: sourceLabel(live.source),
            ageMs: live.ageMs,
            totalBlobs: 0,
          },
        };
      }
      
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        jsonBody: { items: [], message: "No RSS feeds found. Specify a company or run the Logic App first.", company: null },
      };
    }

    // Sort by last modified, get the newest
    blobs.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    const latestBlob = blobs[0];

    context.log(`Reading RSS from blob: ${latestBlob.name}`);

    // Download the blob content
    const blobClient = containerClient.getBlobClient(latestBlob.name);
    const downloadResponse = await blobClient.download();
    
    if (!downloadResponse.readableStreamBody) {
      throw new Error("No stream body in blob response");
    }

    const xmlContent = await streamToString(downloadResponse.readableStreamBody);

    const diagnostics = {
      sizeBytes: Buffer.byteLength(xmlContent, "utf8"),
      hasRss: /<rss\b/i.test(xmlContent),
      hasChannel: /<channel\b/i.test(xmlContent),
      hasAtomFeed: /<feed\b/i.test(xmlContent),
      itemTagCount: (xmlContent.match(/<item\b/gi) || []).length,
      entryTagCount: (xmlContent.match(/<entry\b/gi) || []).length,
    };

    // Parse RSS XML
    const items = parseRSSItems(xmlContent);

    context.log(`Parsed ${items.length} RSS items from ${latestBlob.name}`);

    const message =
      items.length > 0
        ? undefined
        : diagnostics.hasRss || diagnostics.hasAtomFeed
          ? "RSS blob downloaded but contained no parsable items. Verify the Logic App is writing raw RSS/Atom XML (with <item> or <entry>) into the 'rss-feeds' container."
          : "Latest blob does not appear to be RSS/Atom XML. Verify the Logic App is writing the RSS XML body to Blob Storage (not JSON, HTML, or a status payload).";

    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: {
        items,
        message,
        company: companyParam || null,
        source: "cache",
        blobName: latestBlob.name,
        lastModified: latestBlob.lastModified.toISOString(),
        totalBlobs: blobs.length,
        diagnostics,
      },
    };
  } catch (error: any) {
    // Last-resort: never let an uncaught error 500 the UI. Try cached/live RSS;
    // if that also returns nothing, return 200 with an empty list and a diagnostic
    // message so the frontend renders the empty state instead of a toast.
    context.error("RSS feeds error (falling back to cache/live):", error);
    const fallback = await cachedLiveRSS(companyParam, context);
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      jsonBody: {
        items: fallback.items,
        message:
          fallback.message ||
          (fallback.items.length
            ? `Cache read failed (${safeErrorMessage(error, "unknown")}); returned live RSS for "${companyParam}".`
            : `RSS unavailable: ${safeErrorMessage(error, "unknown")}`),
        company: companyParam || null,
        source: sourceLabel(fallback.source),
        ageMs: fallback.ageMs,
      },
    };
  }
}

app.http("rss-feeds", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "rss-feeds",
  handler: rssFeedsHandler,
});
