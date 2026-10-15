import { AzureCliCredential } from "@azure/identity";
import { z } from "zod";

export const subscription = process.env.AZURE_SUBSCRIPTION_ID || "78d2ff46-2b11-4389-b9dd-6a5fd684e326";
export const resourceGroup = process.env.AZURE_RESOURCE_GROUP || "rg-tsetati";
export const staticSiteName = process.env.AZURE_STATIC_WEB_APP_NAME || "karabo-app";
export const resourceRoot = `/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers`;
export const siteId = `${resourceRoot}/Microsoft.Web/staticSites/${staticSiteName}`;

const credential = new AzureCliCredential();

export async function armRequest(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const token = await credential.getToken("https://management.azure.com/.default");
  const response = await fetch(`https://management.azure.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Azure management request failed with HTTP ${response.status} (${method} ${path.split("?")[0]}).`);
  return response.status === 204 ? undefined : response.json();
}

export async function managedSettings(): Promise<Record<string, string>> {
  const response = await armRequest(`${siteId}/listAppSettings?api-version=2024-04-01`, "POST");
  return z.object({ properties: z.record(z.string(), z.string()) }).parse(response).properties;
}
