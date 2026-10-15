import { z } from "zod";
import { armRequest, managedSettings, siteId, resourceRoot } from "./azure-admin";
import { readFile } from "fs/promises";
import { resolve } from "path";

async function main(): Promise<void> {
  const configured = z.object({ rules: z.array(z.object({ name: z.string() }).passthrough()) })
    .parse(JSON.parse(await readFile(resolve(__dirname, "..", "..", "infra", "kaaborsstorage-lifecycle.json"), "utf8")));
  const current = await managedSettings();
  if (!current.AZURE_STORAGE_CONNECTION_STRING || !current.AZURE_OPENAI_API_KEY || !current.AZURE_OPENAI_ENDPOINT) {
    throw new Error("Existing managed API Storage/OpenAI settings are missing. No configuration was changed.");
  }
  const site = z.object({ properties: z.object({ defaultHostname: z.string() }) }).parse(await armRequest(`${siteId}?api-version=2024-04-01`));
  const additions = {
    AZURE_OPENAI_AUTH_TYPE: "key",
    AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI: "gpt-5.4-mini",
    AZURE_OPENAI_DEPLOYMENT_PHI: "Phi-4-mini-instruct",
    AZURE_OPENAI_DEPLOYMENT_NANO: "gpt-5-nano",
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: "text-embedding-3-large",
    AZURE_OPENAI_EMBEDDING_API_VERSION: "2024-10-21",
    AI_ALLOW_PREMIUM: "false",
    ALLOWED_ORIGIN: `https://${site.properties.defaultHostname}`,
    AI_DAILY_TOKEN_LIMIT: "2000000",
    AI_USER_DAILY_TOKEN_LIMIT: "200000",
    AI_DAILY_REQUEST_LIMIT: "2000",
    AI_USER_DAILY_REQUEST_LIMIT: "200",
    AI_DAILY_IMAGE_LIMIT: "15",
    AI_USER_DAILY_IMAGE_LIMIT: "3",
    AI_DAILY_OCR_PAGE_LIMIT: "200",
    AI_USER_DAILY_OCR_PAGE_LIMIT: "50",
    AI_DAILY_AGENT_LIMIT: "20",
    AI_USER_DAILY_AGENT_LIMIT: "5",
    AI_REQUESTS_PER_MINUTE: "100",
    AI_USER_REQUESTS_PER_MINUTE: "20",
  };
  const properties: Record<string, string> = { ...current, ...additions };
  delete properties.ID8_ALLOW_ANONYMOUS_LOCAL;
  delete properties.KARABO_ALLOW_ANONYMOUS_LOCAL;
  for (const key of Object.keys(properties)) if (key.startsWith("AZURE_SEARCH_")) delete properties[key];
  await armRequest(`${siteId}/config/appsettings?api-version=2024-04-01`, "PUT", { properties });

  const account = /AccountName=([^;]+)/.exec(current.AZURE_STORAGE_CONNECTION_STRING)?.[1];
  if (!account) throw new Error("Could not resolve the existing storage account for lifecycle configuration.");
  const policyId = `${resourceRoot}/Microsoft.Storage/storageAccounts/${account}/managementPolicies/default?api-version=2023-05-01`;
  // Keep every existing policy rule not owned by this configuration.
  let existingRules: Array<Record<string, unknown>> = [];
  try {
    const policy = z.object({ properties: z.object({ policy: z.object({ rules: z.array(z.record(z.string(), z.unknown())) }) }) })
      .parse(await armRequest(policyId));
    existingRules = policy.properties.policy.rules;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("HTTP 404")) throw error;
  }
  const names = new Set(configured.rules.map((rule) => rule.name));
  await armRequest(policyId, "PUT", {
    properties: { policy: { rules: [...existingRules.filter((rule) => !names.has(String(rule.name))), ...configured.rules] } },
  });
  console.log(JSON.stringify({ site: siteId, updatedSettingNames: Object.keys(additions), storageAccount: account, retainedOtherSettings: true, lifecycleRuleNames: configured.rules.map((rule) => rule.name) }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Managed API configuration failed.");
  process.exitCode = 1;
});
