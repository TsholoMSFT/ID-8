import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";

const root = resolve(__dirname, "..", "..", "..");
function json(...segments: string[]): unknown {
  return JSON.parse(readFileSync(resolve(root, ...segments), "utf8"));
}

test("lifecycle policy is valid JSON and never expires knowledge, backups or questionnaires", () => {
  const policy = z.object({ rules: z.array(z.object({
    name: z.string(), definition: z.object({ filters: z.object({ prefixMatch: z.array(z.string()) }) }),
  })) }).parse(json("infra", "kaaborsstorage-lifecycle.json"));
  assert.equal(new Set(policy.rules.map((rule) => rule.name)).size, policy.rules.length);
  const prefixes = policy.rules.flatMap((rule) => rule.definition.filters.prefixMatch);
  assert.equal(prefixes.includes("ai-response-cache/"), true);
  assert.equal(prefixes.some((prefix) => ["knowledge-index/", "knowledge-backups/", "questionnaires/"].includes(prefix)), false);
});

test("managed deployment config includes the API and authentication protects catch-all API routes", () => {
  const cli = z.object({ configurations: z.object({ karabo: z.object({ apiLocation: z.literal("api"), outputLocation: z.literal("dist") }) }) })
    .parse(json("swa-cli.config.json"));
  assert.equal(cli.configurations.karabo.apiLocation, "api");
  const config = z.object({ routes: z.array(z.object({ route: z.string(), allowedRoles: z.array(z.string()).optional() })) })
    .parse(json("public", "staticwebapp.config.json"));
  assert.deepEqual(config.routes.find((route) => route.route === "/api/*")?.allowedRoles, ["authenticated"]);
  assert.deepEqual(config.routes.find((route) => route.route === "/api/questionnaire/*")?.allowedRoles, ["anonymous"]);
});
