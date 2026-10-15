/**
 * Questionnaire store — Azure Table Storage persistence for the customer
 * self-serve Discovery questionnaire.
 *
 * Two tables (auto-created on first write):
 *   - questionnairelinks       PK='link'      RK=<linkToken>
 *   - questionnairesubmissions PK=<linkToken>  RK=<submissionId>
 *
 * Auth resolution (first match wins):
 *   1. AZURE_STORAGE_CONNECTION_STRING            (explicit; preferred for local/dev)
 *   2. AzureWebJobsStorage (only if it is a connection string, e.g. Azurite)
 *   3. AZURE_STORAGE_ACCOUNT_NAME / AzureWebJobsStorage__accountName + managed identity
 *
 * The backend treats `questions` and `responses` as opaque JSON — it stores and
 * returns them without interpreting their shape (the frontend owns the contract).
 */
import { TableClient, odata, type TableEntity } from "@azure/data-tables";
import { randomBytes } from "crypto";
import { getTableClient } from "./storage-clients";
import type { QuestionnaireQuestion, QuestionnaireResponse } from "./questionnaire-validation";

// ── Contract (mirrors src/lib/questionnaire-types.ts) ────────────────────────
export type QuestionnaireStatus = "pending" | "completed" | "expired";

export interface QuestionnaireLinkConfig {
  customerName: string;
  industry: string;
  track: string;
  businessFunctions?: string[];
  questions: QuestionnaireQuestion[];
  introMessage?: string;
  expiresAt?: number;
  createdBy?: string;
}

export interface QuestionnaireSubmission {
  id: string;
  email: string;
  primaryStakeholder?: string;
  businessFunction?: string;
  companyName?: string;
  responses: QuestionnaireResponse[];
  submittedAt: number;
}

export interface StoredLink {
  linkToken: string;
  adminToken: string;
  config: QuestionnaireLinkConfig;
  status: QuestionnaireStatus;
  createdAt: number;
  expiresAt?: number;
  submissionCount: number;
}

// ── Limits / constants ───────────────────────────────────────────────────────
const LINKS_TABLE = "questionnairelinks";
const SUBMISSIONS_TABLE = "questionnairesubmissions";
const LINK_PARTITION = "link";
/** Max characters for a JSON payload stored in a single Table property (limit is 64 KiB). */
export const MAX_JSON_CHARS = 30000;
/** Hard cap on submissions per link to limit abuse on the anonymous submit endpoint. */
export const MAX_SUBMISSIONS_PER_LINK = 50;

// ── Token generation ─────────────────────────────────────────────────────────
/** Cryptographically-random, URL-safe, unguessable token (~43 chars). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// ── Client resolution ────────────────────────────────────────────────────────
async function ensureTable(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (err: any) {
    const code = err?.statusCode ?? err?.details?.errorCode;
    // 409 Conflict / TableAlreadyExists is expected on subsequent calls.
    if (code === 409 || err?.details?.odataError?.code === "TableAlreadyExists") return;
    if (typeof code === "string" && code.includes("TableAlreadyExists")) return;
    if (err?.message?.includes("TableAlreadyExists")) return;
    throw err;
  }
}

// ── Link entity (de)serialization ────────────────────────────────────────────
interface LinkEntity extends TableEntity {
  adminToken: string;
  configJson: string;
  status: QuestionnaireStatus;
  createdAt: number;
  expiresAt?: number;
  submissionCount: number;
}

function computeStatus(stored: { status: QuestionnaireStatus; expiresAt?: number }): QuestionnaireStatus {
  if (stored.expiresAt && Date.now() > stored.expiresAt) return "expired";
  return stored.status;
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function createLink(config: QuestionnaireLinkConfig): Promise<{ linkToken: string; adminToken: string }> {
  const configJson = JSON.stringify(config);
  if (configJson.length > MAX_JSON_CHARS) {
    throw new Error("Payload too large: questionnaire configuration exceeds the size limit.");
  }
  const linkToken = newToken();
  const adminToken = newToken();
  const client = getTableClient(LINKS_TABLE);
  await ensureTable(client);
  const entity: LinkEntity = {
    partitionKey: LINK_PARTITION,
    rowKey: linkToken,
    adminToken,
    configJson,
    status: "pending",
    createdAt: Date.now(),
    expiresAt: config.expiresAt,
    submissionCount: 0,
  };
  await client.createEntity(entity);
  return { linkToken, adminToken };
}

export async function getLink(linkToken: string): Promise<StoredLink | null> {
  const client = getTableClient(LINKS_TABLE);
  try {
    const e = await client.getEntity<LinkEntity>(LINK_PARTITION, linkToken);
    const config = JSON.parse(e.configJson) as QuestionnaireLinkConfig;
    return {
      linkToken,
      adminToken: e.adminToken,
      config,
      status: computeStatus(e),
      createdAt: e.createdAt,
      expiresAt: e.expiresAt,
      submissionCount: e.submissionCount ?? 0,
    };
  } catch (err: any) {
    if (err?.statusCode === 404) return null;
    throw err;
  }
}

export async function saveSubmission(
  linkToken: string,
  submission: QuestionnaireSubmission,
): Promise<void> {
  const responsesJson = JSON.stringify(submission.responses ?? []);
  if (responsesJson.length > MAX_JSON_CHARS) {
    throw new Error("Payload too large: questionnaire responses exceed the size limit.");
  }
  const client = getTableClient(SUBMISSIONS_TABLE);
  await ensureTable(client);
  await client.createEntity({
    partitionKey: linkToken,
    rowKey: submission.id,
    email: submission.email,
    primaryStakeholder: submission.primaryStakeholder ?? "",
    businessFunction: submission.businessFunction ?? "",
    companyName: submission.companyName ?? "",
    responsesJson,
    submittedAt: submission.submittedAt,
  });

  // Bump submission count + mark the link completed (best-effort).
  try {
    const linksClient = getTableClient(LINKS_TABLE);
    const link = await linksClient.getEntity<LinkEntity>(LINK_PARTITION, linkToken);
    await linksClient.updateEntity(
      {
        partitionKey: LINK_PARTITION,
        rowKey: linkToken,
        status: "completed",
        submissionCount: (link.submissionCount ?? 0) + 1,
      },
      "Merge",
    );
  } catch {
    /* non-fatal — the submission is already persisted */
  }
}

export async function countSubmissions(linkToken: string): Promise<number> {
  const client = getTableClient(SUBMISSIONS_TABLE);
  let count = 0;
  try {
    const iter = client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${linkToken}` } });
    for await (const _ of iter) count++;
  } catch (err: any) {
    if (err?.statusCode === 404) return 0;
    throw err;
  }
  return count;
}

export async function listSubmissions(linkToken: string): Promise<QuestionnaireSubmission[]> {
  const client = getTableClient(SUBMISSIONS_TABLE);
  const out: QuestionnaireSubmission[] = [];
  try {
    const iter = client.listEntities<TableEntity & Record<string, unknown>>({
      queryOptions: { filter: odata`PartitionKey eq ${linkToken}` },
    });
    for await (const e of iter) {
      out.push({
        id: String(e.rowKey),
        email: String(e.email ?? ""),
        primaryStakeholder: (e.primaryStakeholder as string) || undefined,
        businessFunction: (e.businessFunction as string) || undefined,
        companyName: (e.companyName as string) || undefined,
        responses: e.responsesJson ? (JSON.parse(String(e.responsesJson)) as QuestionnaireResponse[]) : [],
        submittedAt: Number(e.submittedAt ?? 0),
      });
    }
  } catch (err: any) {
    if (err?.statusCode === 404) return [];
    throw err;
  }
  out.sort((a, b) => b.submittedAt - a.submittedAt);
  return out;
}
