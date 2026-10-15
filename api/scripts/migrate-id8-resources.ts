import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { TableClient, type TableEntity } from "@azure/data-tables";
import { z } from "zod";
import { armRequest, managedAppUrl, managedSettings, resourceRoot, siteId, staticSiteName } from "./azure-admin";
import { assertNoInlineSecrets, canonicalEntity, checksum, copyEntity, migrateWorkflowValues } from "./id8-migration-utils";
import { storageStatus } from "../src/lib/storage-clients";
import { KNOWLEDGE_BLOB, KNOWLEDGE_CONTAINER, parseKnowledgeIndex } from "../src/lib/knowledge-index";

const legacySite = `${resourceRoot}/Microsoft.Web/staticSites/karabo-app`;
const legacyBlob = "karabo-knowledge.json";
const legacyQuotaTable = "karaboquotas";
const quotaTable = "id8quotas";
const jobs = [
  { oldName: "karabo-rss-monitor", name: "id8-rss-monitor" },
  { oldName: "karabo-filings-monitor", name: "id8-filings-monitor" },
];
const workflowSchema = z.object({
  location: z.string(),
  properties: z.object({
    definition: z.record(z.string(), z.unknown()),
    parameters: z.record(z.string(), z.unknown()).optional(),
    state: z.string(),
  }),
});
const manifestSchema = z.object({
  preparedAt: z.string(), appUrl: z.string().url(), oldUrl: z.string().url(),
  indexSha256: z.string(), documents: z.number().int().positive(),
  sourceSite: z.literal("karabo-app"), targetSite: z.literal("id8-app"),
});
type StoredEntity = TableEntity & Record<string, unknown>;

function jobId(name: string): string {
  return `${resourceRoot}/Microsoft.Logic/workflows/${name}`;
}

async function settingsAt(id: string): Promise<Record<string, string>> {
  const result = z.object({ properties: z.record(z.string(), z.string()).nullable() })
    .parse(await armRequest(`${id}/listAppSettings?api-version=2024-04-01`, "POST"));
  return result.properties ?? {};
}

async function originAt(id: string): Promise<string> {
  const site = z.object({ properties: z.object({ defaultHostname: z.string().min(1) }) })
    .parse(await armRequest(`${id}?api-version=2024-04-01`));
  return `https://${site.properties.defaultHostname}`;
}

async function writeBackup(container: ContainerClient, name: string, value: unknown): Promise<void> {
  const content = JSON.stringify(value);
  const blob = container.getBlockBlobClient(name);
  await blob.upload(content, Buffer.byteLength(content), {
    conditions: { ifNoneMatch: "*" }, blobHTTPHeaders: { blobContentType: "application/json" },
  });
  if (checksum(await blob.downloadToBuffer()) !== checksum(content)) throw new Error(`Backup checksum failed: ${name}`);
}

async function readRows(client: TableClient): Promise<StoredEntity[]> {
  const rows: StoredEntity[] = [];
  for await (const row of client.listEntities<StoredEntity>()) rows.push(copyEntity(row));
  return rows.sort((left, right) => `${left.partitionKey}:${left.rowKey}`.localeCompare(`${right.partitionKey}:${right.rowKey}`));
}

async function prepare(): Promise<void> {
  const source = await settingsAt(legacySite);
  const destination = await settingsAt(siteId);
  if (destination.AZURE_STORAGE_CONNECTION_STRING && destination.ID8_MIGRATION_MODE !== "true") {
    throw new Error("The ID-8 site is already active. Refusing to overwrite its configuration.");
  }
  if (!source.AZURE_STORAGE_CONNECTION_STRING || !source.AZURE_OPENAI_ENDPOINT || !source.AZURE_OPENAI_API_KEY) {
    throw new Error("Legacy server settings are incomplete. No cutover was performed.");
  }
  const appUrl = await managedAppUrl();
  const oldUrl = await originAt(legacySite);
  const service = BlobServiceClient.fromConnectionString(source.AZURE_STORAGE_CONNECTION_STRING);
  const backups = service.getContainerClient("id8-migration-backups");
  await backups.createIfNotExists();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const indexContainer = service.getContainerClient(KNOWLEDGE_CONTAINER);
  const original = await indexContainer.getBlobClient(legacyBlob).downloadToBuffer();
  const index = parseKnowledgeIndex(JSON.parse(original.toString("utf8")));
  await writeBackup(backups, `${stamp}/knowledge-source.json`, JSON.parse(original.toString("utf8")));
  const target = indexContainer.getBlockBlobClient(KNOWLEDGE_BLOB);
  if (await target.exists()) {
    if (checksum(await target.downloadToBuffer()) !== checksum(original)) throw new Error("Existing ID-8 index differs from the source. Refusing to overwrite it.");
  } else {
    await target.upload(original, original.length, {
      conditions: { ifNoneMatch: "*" }, blobHTTPHeaders: { blobContentType: "application/json" },
    });
  }
  if (checksum(await target.downloadToBuffer()) !== checksum(original)) throw new Error("ID-8 index checksum verification failed.");

  for (const job of jobs) {
    const old = workflowSchema.parse(await armRequest(`${jobId(job.oldName)}?api-version=2019-05-01`));
    assertNoInlineSecrets(old.properties.definition);
    assertNoInlineSecrets(old.properties.parameters);
    await writeBackup(backups, `${stamp}/${job.oldName}.json`, old);
    await armRequest(`${jobId(job.name)}?api-version=2019-05-01`, "PUT", {
      location: old.location,
      tags: { application: "id8" },
      properties: {
        state: "Disabled",
        definition: migrateWorkflowValues(old.properties.definition, oldUrl, appUrl),
        parameters: migrateWorkflowValues(old.properties.parameters, oldUrl, appUrl),
      },
    });
  }
  const properties: Record<string, string> = { ...destination, ...source, ALLOWED_ORIGIN: appUrl, ID8_MIGRATION_MODE: "true" };
  delete properties.KARABO_ALLOW_ANONYMOUS_LOCAL;
  delete properties.ID8_ALLOW_ANONYMOUS_LOCAL;
  await armRequest(`${siteId}/config/appsettings?api-version=2024-04-01`, "PUT", { properties });
  const manifest = manifestSchema.parse({
    preparedAt: new Date().toISOString(), appUrl, oldUrl,
    indexSha256: checksum(original), documents: index.documents.length,
    sourceSite: "karabo-app", targetSite: "id8-app",
  });
  await writeBackup(backups, `${stamp}/manifest.json`, manifest);
  const pointer = JSON.stringify(manifest);
  await backups.getBlockBlobClient("prepared.json").upload(pointer, Buffer.byteLength(pointer), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
  console.log(JSON.stringify({
    result: "prepared", appUrl, documents: index.documents.length, indexSha256: manifest.indexSha256,
    quotaCopyDeferredUntilOldApiIsRetired: true, newSchedules: "Disabled", oldSiteRetained: true,
  }, null, 2));
}

async function activate(): Promise<void> {
  const settings = await managedSettings();
  if (settings.ID8_MIGRATION_MODE !== "true") throw new Error("The ID-8 site is not paused for migration. Refusing to rerun activation.");
  if (!settings.AZURE_STORAGE_CONNECTION_STRING) throw new Error("ID-8 Storage settings are missing.");
  const service = BlobServiceClient.fromConnectionString(settings.AZURE_STORAGE_CONNECTION_STRING);
  const backups = service.getContainerClient("id8-migration-backups");
  const manifest = manifestSchema.parse(JSON.parse((await backups.getBlobClient("prepared.json").downloadToBuffer()).toString("utf8")));
  const health = await fetch(`${manifest.appUrl}/api/health`, { signal: AbortSignal.timeout(20_000) });
  if (!health.ok) throw new Error("ID-8 health check failed before cutover.");
  z.object({ application: z.literal("ID-8"), ok: z.literal(true) }).parse(await health.json());
  const oldHealth = await fetch(`${manifest.oldUrl}/api/health`, { signal: AbortSignal.timeout(20_000) });
  if (oldHealth.status !== 401) throw new Error("The legacy API must be blocked by the verified handoff deployment before copying live quota counters.");
  console.log("Legacy API is blocked. Waiting 45 seconds for previous managed requests to drain.");
  await new Promise((resolve) => setTimeout(resolve, 45_000));
  for (const job of jobs) {
    await armRequest(`${jobId(job.oldName)}/disable?api-version=2019-05-01`, "POST");
    const stopped = workflowSchema.parse(await armRequest(`${jobId(job.oldName)}?api-version=2019-05-01`));
    if (stopped.properties.state !== "Disabled") throw new Error(`Legacy schedule is not disabled: ${job.oldName}`);
  }
  const source = TableClient.fromConnectionString(settings.AZURE_STORAGE_CONNECTION_STRING, legacyQuotaTable);
  const target = TableClient.fromConnectionString(settings.AZURE_STORAGE_CONNECTION_STRING, quotaTable);
  const rows = await readRows(source);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeBackup(backups, `${stamp}/quota-source.json`, { table: legacyQuotaTable, rows });
  try {
    await target.createTable();
  } catch (error) {
    if (storageStatus(error) !== 409) throw error;
  }
  for (const row of rows) {
    try {
      await target.createEntity(row);
    } catch (error) {
      if (storageStatus(error) !== 409) throw error;
      const existing = await target.getEntity<StoredEntity>(row.partitionKey, row.rowKey);
      if (canonicalEntity(existing) !== canonicalEntity(row)) throw new Error(`ID-8 quota row differs from the verified source: ${row.rowKey}`);
    }
  }
  const copied = await readRows(target);
  const sourceAfter = await readRows(source);
  const canonical = (values: StoredEntity[]) => values.map(canonicalEntity).join("\n");
  if (canonical(rows) !== canonical(copied) || canonical(rows) !== canonical(sourceAfter)) {
    throw new Error("Quota verification failed or source changed during cutover. The new API remains paused.");
  }
  const index = await service.getContainerClient(KNOWLEDGE_CONTAINER).getBlobClient(KNOWLEDGE_BLOB).downloadToBuffer();
  if (checksum(index) !== manifest.indexSha256) throw new Error("Knowledge index changed before activation.");
  for (const job of jobs) {
    await armRequest(`${jobId(job.name)}/enable?api-version=2019-05-01`, "POST");
    const active = workflowSchema.parse(await armRequest(`${jobId(job.name)}?api-version=2019-05-01`));
    if (active.properties.state !== "Enabled") throw new Error(`ID-8 schedule is not enabled: ${job.name}`);
  }
  await armRequest(`${siteId}/config/appsettings?api-version=2024-04-01`, "PUT", {
    properties: { ...settings, ID8_MIGRATION_MODE: "false" },
  });
  await writeBackup(backups, `${stamp}/activated.json`, {
    appUrl: manifest.appUrl, quotaRows: rows.length, documents: manifest.documents,
    indexSha256: manifest.indexSha256, activatedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify({
    result: "activated", appUrl: manifest.appUrl, documents: manifest.documents,
    quotaRows: rows.length, newSchedules: "Enabled", oldSchedules: "Disabled",
    oldServerDataAndBackupsRetained: true,
  }, null, 2));
}

async function main(): Promise<void> {
  if (staticSiteName !== "id8-app") throw new Error("This approved migration targets only id8-app.");
  const mode = process.argv[2];
  if (mode === "prepare") await prepare();
  else if (mode === "activate") await activate();
  else throw new Error("Specify prepare or activate. No Azure resources were changed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "ID-8 resource migration failed.");
  if (error instanceof Error && "cause" in error && error.cause instanceof Error) console.error(error.cause.message);
  process.exitCode = 1;
});
