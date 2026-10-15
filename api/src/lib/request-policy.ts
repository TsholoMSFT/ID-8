import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import type { HttpHandler, HttpRequest, HttpResponseInit } from "@azure/functions";
import { reserveQuota, QuotaExceededError, type QuotaCharge } from "./quota-store";
import { makeCorsHeaders } from "./xml-utils";
import { AIProviderError } from "./ai-provider";

interface RequestScope {
  userId: string;
}

export const requestScope = new AsyncLocalStorage<RequestScope>();

function apiRoute(request: HttpRequest): string {
  return decodeURIComponent(new URL(request.url).pathname).replace(/^\/api\//i, "").replace(/\/+$/, "").toLowerCase();
}

export function isPublicRequest(request: HttpRequest): boolean {
  const route = apiRoute(request);
  if (request.method === "OPTIONS") return true;
  if (request.method === "GET" && ["health", "rss-feeds", "filings-feeds", "regulatory-feeds"].includes(route)) return true;
  if (route === "ai-readiness" && request.method === "GET" && request.query.get("refresh") !== "true") return true;
  return request.method === "GET" && /^questionnaire\/[^/]+$/.test(route)
    || request.method === "POST" && /^questionnaire\/[^/]+\/submit$/.test(route);
}

export function authenticatedUser(request: HttpRequest, env: NodeJS.ProcessEnv = process.env): string | null {
  const production = Boolean(env.WEBSITE_HOSTNAME || env.WEBSITE_INSTANCE_ID)
    || env.NODE_ENV?.toLowerCase() === "production"
    || env.AZURE_FUNCTIONS_ENVIRONMENT?.toLowerCase() === "production";
  if (!production && (env.ID8_ALLOW_ANONYMOUS_LOCAL ?? env.KARABO_ALLOW_ANONYMOUS_LOCAL) === "true") return "local-development";
  const user = request.user;
  return user?.type === "StaticWebApps" && user.identityProvider === "aad" && user.id
    ? `aad:${user.id}`
    : null;
}

export async function reserveAIUsage(charge: QuotaCharge): Promise<void> {
  const scope = requestScope.getStore();
  if (!scope) return;
  try {
    await reserveQuota(scope.userId, charge);
  } catch (error) {
    if (error instanceof QuotaExceededError) throw error;
    console.error("AI quota reservation failed:", error);
    throw new AIProviderError("COST_CONTROL_UNAVAILABLE", "Cost-control storage is unavailable. No AI request was authorized.", false, 503);
  }
}

export function guardHttpHandler(
  handler: HttpHandler,
  reserve: typeof reserveQuota = reserveQuota,
): HttpHandler {
  return async (request, context) => {
    if (isPublicRequest(request)) return handler(request, context);
    const correlationId = request.headers.get("x-correlation-id") || randomUUID();
    const headers = { ...makeCorsHeaders(), "Content-Type": "application/json", "Cache-Control": "no-store" };
    const userId = authenticatedUser(request);
    if (!userId) {
      context.warn(`API access denied correlationId=${correlationId}`);
      return {
        status: 401,
        headers,
        jsonBody: {
          error: "Sign in with Microsoft Entra ID to use this feature.",
          code: "AUTH_REQUIRED",
          retryable: false,
          loginUrl: "/.auth/login/aad",
          correlationId,
        },
      };
    }
    if (process.env.ID8_MIGRATION_MODE === "true") {
      return { status: 503, headers, jsonBody: { error: "ID-8 is completing a verified data migration. Please try again shortly.", code: "MIGRATION_IN_PROGRESS", retryable: false, correlationId } };
    }
    try {
      const route = apiRoute(request);
      const length = Number(request.headers.get("content-length") || 0);
      const maxBytes = route === "ocr" ? 10 * 1024 * 1024 + 65536 : 256 * 1024;
      if (length > maxBytes) {
        return { status: 413, headers, jsonBody: { error: "Request body exceeds the size limit.", code: "INVALID_REQUEST", retryable: false, correlationId } };
      }
      await reserve(userId, {
        requests: 1,
        images: route === "image" ? 1 : 0,
        ocrPages: route === "ocr" ? 10 : 0,
        agentRuns: route === "agent-run" && request.method === "POST" ? 1 : 0,
      });
    } catch (error) {
      const quotaError = error instanceof QuotaExceededError;
      const providerError = error instanceof AIProviderError;
      context.error(`API policy failed correlationId=${correlationId}:`, error);
      const response: HttpResponseInit = {
        status: providerError ? error.status : 503,
        headers: { ...headers, ...(quotaError ? { "Retry-After": String(error.retryAfter) } : {}) },
        jsonBody: {
          error: providerError ? error.message : "Cost-control storage is unavailable. No new request was authorized.",
          code: providerError ? error.code : "COST_CONTROL_UNAVAILABLE",
          retryable: false,
          correlationId,
        },
      };
      return response;
    }
    return requestScope.run({ userId }, () => handler(request, context));
  };
}
