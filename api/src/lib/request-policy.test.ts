import assert from "node:assert/strict";
import test from "node:test";
import { HttpRequest, InvocationContext } from "@azure/functions";
import { authenticatedUser, guardHttpHandler, isPublicRequest } from "./request-policy";
import { QuotaExceededError } from "./quota-store";

function request(route: string, method = "GET", provider?: string): HttpRequest {
  const principal = provider ? Buffer.from(JSON.stringify({
    identityProvider: provider, userId: "user-1", userDetails: "test", userRoles: ["anonymous", "authenticated"],
  })).toString("base64") : undefined;
  return new HttpRequest({
    url: `https://example.azurestaticapps.net/api/${route}`,
    method,
    headers: principal ? { "x-ms-client-principal": principal } : {},
  });
}

test("keeps only health, scheduled feeds and token-based questionnaire operations public", () => {
  assert.equal(isPublicRequest(request("questionnaire/token")), true);
  assert.equal(isPublicRequest(request("questionnaire/token/submit", "POST")), true);
  assert.equal(isPublicRequest(request("questionnaire", "POST")), false);
  assert.equal(isPublicRequest(request("questionnaire/token/responses")), false);
  assert.equal(isPublicRequest(request("ai-readiness")), true);
  assert.equal(isPublicRequest(request("ai-readiness?refresh=true")), false);
  assert.equal(isPublicRequest(request("chat", "POST")), false);
  assert.equal(isPublicRequest(request("image", "POST")), false);
});

test("accepts Entra platform identity but rejects other providers and production dev bypass", () => {
  assert.equal(authenticatedUser(request("chat", "POST", "aad"), {}), "aad:user-1");
  assert.equal(authenticatedUser(request("chat", "POST", "github"), {}), null);
  assert.equal(authenticatedUser(request("chat", "POST"), { ID8_ALLOW_ANONYMOUS_LOCAL: "true", NODE_ENV: "production" }), null);
  assert.equal(authenticatedUser(request("chat", "POST"), { ID8_ALLOW_ANONYMOUS_LOCAL: "true" }), "local-development");
});

test("anonymous metered requests never reach quota storage or the provider", async () => {
  let invoked = false;
  let reserved = false;
  const handler = guardHttpHandler(async () => { invoked = true; return { status: 200 }; },
    async () => { reserved = true; });
  const response = await handler(request("chat", "POST"), new InvocationContext());
  assert.equal(response?.status, 401);
  assert.equal(invoked, false);
  assert.equal(reserved, false);
});

test("quota exhaustion returns 429 and never invokes the handler", async () => {
  let invoked = false;
  const handler = guardHttpHandler(async () => { invoked = true; return { status: 200 }; },
    async () => { throw new QuotaExceededError(60); });
  const response = await handler(request("chat", "POST", "aad"), new InvocationContext());
  assert.equal(response?.status, 429);
  assert.equal(invoked, false);
});

test("does not misreport handler failures as quota storage failures after authorization", async () => {
  const handler = guardHttpHandler(async () => { throw new Error("Handler failure"); }, async () => undefined);
  await assert.rejects(Promise.resolve(handler(request("chat", "POST", "aad"), new InvocationContext())), /Handler failure/);
});

test("charges metered routes consistently for case, trailing slash and percent-encoded spellings", async () => {
  for (const route of ["image", "IMAGE/", "%69mage/"]) {
    let imageCharge = 0;
    const handler = guardHttpHandler(async () => ({ status: 200 }), async (_userId, charge) => { imageCharge = charge.images ?? 0; });
    const response = await handler(request(route, "POST", "aad"), new InvocationContext());
    assert.equal(response?.status, 200);
    assert.equal(imageCharge, 1, `Missing image reservation for ${route}`);
  }
});

test("migration mode pauses metered work without reserving quota", async () => {
  const previous = process.env.ID8_MIGRATION_MODE;
  process.env.ID8_MIGRATION_MODE = "true";
  let reserved = false;
  let invoked = false;
  try {
    const handler = guardHttpHandler(async () => { invoked = true; return { status: 200 }; }, async () => { reserved = true; });
    const result = await handler(request("chat", "POST", "aad"), new InvocationContext());
    assert.equal(result?.status, 503);
    assert.equal(reserved, false);
    assert.equal(invoked, false);
  } finally {
    if (previous === undefined) delete process.env.ID8_MIGRATION_MODE;
    else process.env.ID8_MIGRATION_MODE = previous;
  }
});
