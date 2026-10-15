import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { timingSafeEqual } from "crypto";
import { makeCorsHeaders, safeErrorMessage } from "../lib/xml-utils";
import {
  createLink,
  getLink,
  saveSubmission,
  listSubmissions,
  MAX_SUBMISSIONS_PER_LINK,
  type QuestionnaireLinkConfig,
  type QuestionnaireSubmission,
} from "../lib/questionnaire-store";
import { validateQuestionnaireResponses, type QuestionnaireResponse } from "../lib/questionnaire-validation";

/**
 * Customer self-serve Discovery questionnaire endpoints.
 *
 * Dual-token model:
 *   - linkToken  → public, in the customer URL (/q/<linkToken>). Fetches config + submits answers.
 *   - adminToken → private, kept by the consultant. Required (x-admin-token header) to read submissions.
 *
 * Security:
 *   - Crypto-random unguessable tokens (questionnaire-store).
 *   - Public GET never returns adminToken or submissions.
 *   - Submission retrieval is gated by a constant-time adminToken comparison.
 *   - Anonymous submit is rate-limited per link (MAX_SUBMISSIONS_PER_LINK) + size-capped.
 *   - Expiry enforced (HTTP 410).
 */

const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const MAX_FIELD = 300;
const MAX_TEXT = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsFor(methods: string, withAdminHeader = false): Record<string, string> {
  const headers = makeCorsHeaders(methods);
  if (withAdminHeader) headers["Access-Control-Allow-Headers"] = "Content-Type, x-admin-token";
  return headers;
}

function baseUrl(req: HttpRequest): string {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return host ? `${proto}://${host}` : "";
}

function str(value: unknown, max = MAX_FIELD): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// ── POST /api/questionnaire — create a link (consultant) ─────────────────────
async function createHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const cors = corsFor("POST, OPTIONS");
  if (req.method === "OPTIONS") return { status: 204, headers: cors };

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return { status: 400, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Invalid JSON body." } };
    }

    const customerName = str(body?.customerName, 200);
    const industry = str(body?.industry, 80);
    const track = str(body?.track, 80);
    const questions = Array.isArray(body?.questions) ? body.questions : null;

    if (!customerName || !industry || !track || !questions || questions.length === 0) {
      return {
        status: 400,
        headers: { ...cors, ...JSON_HEADERS },
        jsonBody: { error: "customerName, industry, track and a non-empty questions[] are required." },
      };
    }
    if (questions.length > MAX_FIELD) {
      return { status: 400, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Too many questions." } };
    }

    const config: QuestionnaireLinkConfig = {
      customerName,
      industry,
      track,
      questions,
      businessFunctions: Array.isArray(body?.businessFunctions)
        ? body.businessFunctions.filter((b: unknown) => typeof b === "string").slice(0, MAX_FIELD)
        : undefined,
      introMessage: str(body?.introMessage, MAX_TEXT),
      expiresAt: typeof body?.expiresAt === "number" && body.expiresAt > Date.now() ? body.expiresAt : undefined,
      createdBy: str(body?.createdBy, 200),
    };

    const { linkToken, adminToken } = await createLink(config);
    const base = baseUrl(req);
    const url = base ? `${base}/q/${linkToken}` : `/q/${linkToken}`;
    context.log(`Questionnaire link created for "${customerName}"`);
    return { status: 201, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { linkToken, adminToken, url } };
  } catch (err) {
    const msg = safeErrorMessage(err, "Failed to create questionnaire link");
    const status = msg.startsWith("Payload too large") ? 413 : 500;
    context.error("questionnaire create failed", err);
    return { status, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: msg } };
  }
}

// ── GET /api/questionnaire/{token} — public config ───────────────────────────
async function getHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const cors = corsFor("GET, OPTIONS");
  if (req.method === "OPTIONS") return { status: 204, headers: cors };

  try {
    const token = req.params.token;
    if (!token) return { status: 400, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Missing token." } };

    const link = await getLink(token);
    if (!link) return { status: 404, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Questionnaire not found." } };
    if (link.status === "expired") {
      return { status: 410, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "This questionnaire link has expired." } };
    }

    // Public payload only — never expose adminToken or submissions.
    return {
      status: 200,
      headers: { ...cors, ...JSON_HEADERS },
      jsonBody: { token, config: link.config, status: link.status },
    };
  } catch (err) {
    context.error("questionnaire get failed", err);
    return {
      status: 500,
      headers: { ...cors, ...JSON_HEADERS },
      jsonBody: { error: safeErrorMessage(err, "Failed to load questionnaire") },
    };
  }
}

// ── POST /api/questionnaire/{token}/submit — public submit ───────────────────
async function submitHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const cors = corsFor("POST, OPTIONS");
  if (req.method === "OPTIONS") return { status: 204, headers: cors };

  try {
    const token = req.params.token;
    if (!token) return { status: 400, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Missing token." } };

    const link = await getLink(token);
    if (!link) return { status: 404, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Questionnaire not found." } };
    if (link.status === "expired") {
      return { status: 410, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "This questionnaire link has expired." } };
    }
    if (link.submissionCount >= MAX_SUBMISSIONS_PER_LINK) {
      return { status: 429, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Submission limit reached for this link." } };
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return { status: 400, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Invalid JSON body." } };
    }

    const email = str(body?.email, 254);
    if (!email || !EMAIL_RE.test(email)) {
      return { status: 400, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "A valid email is required." } };
    }
    const responses = Array.isArray(body?.responses) ? body.responses : [];
    if (responses.length > MAX_FIELD) {
      return { status: 400, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Too many responses." } };
    }
    const validationDetails = validateQuestionnaireResponses(link.config.questions, responses);
    if (validationDetails.length > 0) {
      return {
        status: 400,
        headers: { ...cors, ...JSON_HEADERS },
        jsonBody: { error: "Validation failed", details: validationDetails },
      };
    }

    const submission: QuestionnaireSubmission = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email,
      primaryStakeholder: str(body?.primaryStakeholder, 200),
      businessFunction: str(body?.businessFunction, 80),
      companyName: str(body?.companyName, 200),
      responses: responses as QuestionnaireResponse[],
      submittedAt: Date.now(),
    };

    await saveSubmission(token, submission);
    context.log(`Questionnaire submission received for token ${token.slice(0, 6)}…`);
    return { status: 201, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { ok: true, id: submission.id } };
  } catch (err) {
    const msg = safeErrorMessage(err, "Failed to submit questionnaire");
    const status = msg.startsWith("Payload too large") ? 413 : 500;
    context.error("questionnaire submit failed", err);
    return { status, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: msg } };
  }
}

// ── GET /api/questionnaire/{token}/responses — admin retrieval ───────────────
async function responsesHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const cors = corsFor("GET, OPTIONS", true);
  if (req.method === "OPTIONS") return { status: 204, headers: cors };

  try {
    const token = req.params.token;
    if (!token) return { status: 400, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Missing token." } };

    const link = await getLink(token);
    if (!link) return { status: 404, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Questionnaire not found." } };

    const adminToken = req.headers.get("x-admin-token") || "";
    if (!adminToken || !constantTimeEquals(adminToken, link.adminToken)) {
      return { status: 401, headers: { ...cors, ...JSON_HEADERS }, jsonBody: { error: "Invalid or missing admin token." } };
    }

    const submissions = await listSubmissions(token);
    return {
      status: 200,
      headers: { ...cors, ...JSON_HEADERS },
      jsonBody: { status: link.status, submissionCount: submissions.length, submissions },
    };
  } catch (err) {
    context.error("questionnaire responses failed", err);
    return {
      status: 500,
      headers: { ...cors, ...JSON_HEADERS },
      jsonBody: { error: safeErrorMessage(err, "Failed to retrieve responses") },
    };
  }
}

app.http("questionnaire-create", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "questionnaire",
  handler: createHandler,
});

app.http("questionnaire-get", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "questionnaire/{token}",
  handler: getHandler,
});

app.http("questionnaire-submit", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "questionnaire/{token}/submit",
  handler: submitHandler,
});

app.http("questionnaire-responses", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "questionnaire/{token}/responses",
  handler: responsesHandler,
});

export { createHandler, getHandler, submitHandler, responsesHandler };
