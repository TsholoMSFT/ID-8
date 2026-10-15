import { TableClient } from "@azure/data-tables";
import { BlobServiceClient } from "@azure/storage-blob";
import { getCredential } from "./iq-credential";

function connectionString(): string | undefined {
  const explicit = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  const host = process.env.AzureWebJobsStorage?.trim();
  return explicit || (host && /AccountKey=|UseDevelopmentStorage=|SharedAccessSignature=/i.test(host) ? host : undefined);
}

function accountName(): string {
  const name = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim() || process.env.AzureWebJobsStorage__accountName?.trim();
  if (!name) throw new Error("Storage not configured: set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME.");
  return name;
}

export function getTableClient(tableName: string): TableClient {
  const connection = connectionString();
  if (connection) {
    return TableClient.fromConnectionString(connection, tableName, {
      allowInsecureConnection: /UseDevelopmentStorage=true|127\.0\.0\.1|localhost/i.test(connection),
    });
  }
  const credential = getCredential();
  if (!credential) throw new Error("Azure credential unavailable for Table Storage.");
  return new TableClient(`https://${accountName()}.table.core.windows.net`, tableName, credential);
}

export function getBlobServiceClient(): BlobServiceClient {
  const connection = connectionString();
  if (connection) return BlobServiceClient.fromConnectionString(connection);
  const credential = getCredential();
  if (!credential) throw new Error("Azure credential unavailable for Blob Storage.");
  return new BlobServiceClient(`https://${accountName()}.blob.core.windows.net`, credential);
}

export function storageStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
  return undefined;
}
