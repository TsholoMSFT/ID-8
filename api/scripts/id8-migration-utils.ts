import { createHash } from "crypto";
import type { TableEntity } from "@azure/data-tables";

export function checksum(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function canonicalEntity(entity: TableEntity & Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(entity)
    .filter(([key]) => !["etag", "timestamp", "odata.etag", "odata.metadata"].includes(key))
    .sort(([left], [right]) => left.localeCompare(right))));
}

export function copyEntity(entity: TableEntity & Record<string, unknown>): TableEntity & Record<string, unknown> {
  const copied: TableEntity & Record<string, unknown> = { partitionKey: entity.partitionKey, rowKey: entity.rowKey };
  for (const [key, value] of Object.entries(entity)) {
    if (!["etag", "timestamp", "odata.etag", "odata.metadata"].includes(key)) copied[key] = value;
  }
  return copied;
}

export function migrateWorkflowValues(value: unknown, oldOrigin: string, newOrigin: string, propertyName = ""): unknown {
  if (typeof value === "string") {
    const migrated = value.split(oldOrigin).join(newOrigin);
    return propertyName.toLowerCase() === "user-agent"
      ? migrated.replace(/KARABO/g, "ID-8").replace(/Karabo/g, "ID-8")
      : migrated;
  }
  if (Array.isArray(value)) return value.map((item) => migrateWorkflowValues(item, oldOrigin, newOrigin));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, migrateWorkflowValues(item, oldOrigin, newOrigin, key)]));
  }
  return value;
}

export function assertNoInlineSecrets(value: unknown, path = "workflow"): void {
  if (typeof value === "string" && /[?&](?:sig|token|api_key)=/i.test(value) && !value.startsWith("@")) {
    throw new Error(`Inline credential URL at ${path}; use secure references before migration.`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoInlineSecrets(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/(?:password|clientsecret|accesskey|api[-_]?key|authorization)$/i.test(key)
        && typeof item === "string" && item && !item.startsWith("@")) {
        throw new Error(`Inline credential at ${path}.${key}; use secure references before migration.`);
      }
      assertNoInlineSecrets(item, `${path}.${key}`);
    }
  }
}
