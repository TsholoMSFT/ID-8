import { AzureCliCredential } from "@azure/identity";
import { z } from "zod";

export const subscription = process.env.AZURE_SUBSCRIPTION_ID || "78d2ff46-2b11-4389-b9dd-6a5fd684e326";
export const resourceGroup = process.env.AZURE_RESOURCE_GROUP || "rg-tsetati";
export const staticSiteName = process.env.AZURE_STATIC_WEB_APP_NAME || "id8-app";
export const resourceRoot = `/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers`;
export const siteId = `${resourceRoot}/Microsoft.Web/staticSites/${staticSiteName}`;

const credential = new AzureCliCredential();

export async function armRequest(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const token = await credential.getToken("https://management.azure.com/.default");
  const readOnly = method === "GET" || method === "POST" && /\/list(AppSettings|AdminKeys)\?/.test(path);
  let response: Response | undefined;
  for (let attempt = 0; attempt < (readOnly ? 2 : 1); attempt++) {
    try {
      response = await fetch(`https://management.azure.com${path}`, {
        method,
        headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (!readOnly || attempt > 0) throw error;
      console.warn("Azure management read failed before a response; retrying the read once. No inference or write is replayed.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (readOnly && attempt === 0 && response.status >= 500) {
      console.warn(`Azure management read returned HTTP ${response.status}; retrying the read once.`);
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    break;
  }
  if (!response) throw new Error("Azure management request returned no response.");
  if (!response.ok) throw new Error(`Azure management request failed with HTTP ${response.status} (${method} ${path.split("?")[0]}).`);
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

export async function managedSettings(): Promise<Record<string, string>> {
  const response = await armRequest(`${siteId}/listAppSettings?api-version=2024-04-01`, "POST");
  return z.object({ properties: z.record(z.string(), z.string()) }).parse(response).properties;
}

export async function managedAppUrl(): Promise<string> {
  const response = await armRequest(`${siteId}?api-version=2024-04-01`);
  const site = z.object({ properties: z.object({ defaultHostname: z.string().min(1) }) }).parse(response);
  return `https://${site.properties.defaultHostname}`;
}
