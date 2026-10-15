import assert from "node:assert/strict";
import test from "node:test";
import { assertNoInlineSecrets, canonicalEntity, checksum, copyEntity, migrateWorkflowValues } from "./id8-migration-utils";

test("preserves quota data while excluding service-generated entity metadata", () => {
  const source = { partitionKey: "usage", rowKey: "global", requests: 15, tokens: 2000, etag: "source", timestamp: "old" };
  const copied = copyEntity(source);
  assert.equal(copied.tokens, 2000);
  assert.equal("etag" in copied, false);
  assert.equal(canonicalEntity(source), canonicalEntity({ ...copied, etag: "destination", timestamp: "new" }));
  assert.notEqual(canonicalEntity(source), canonicalEntity({ ...copied, tokens: 0 }));
});

test("moves workflow origins and branding without changing shared resource identifiers", () => {
  const source = { uri: "https://old.example/api/filings?company=ABSA", headers: { "User-Agent": "KARABO/1.0" }, company: "Karabo Mining", connections: [{ connectionId: "/shared/azureblob" }] };
  assert.deepEqual(migrateWorkflowValues(source, "https://old.example", "https://new.example"), {
    uri: "https://new.example/api/filings?company=ABSA", headers: { "User-Agent": "ID-8/1.0" }, company: "Karabo Mining", connections: [{ connectionId: "/shared/azureblob" }],
  });
});

test("refuses inline credentials but permits managed connection references", () => {
  assert.throws(() => assertNoInlineSecrets({ headers: { Authorization: "secret-value" } }), /Inline credential/);
  assert.throws(() => assertNoInlineSecrets({ uri: "https://example.invalid?sig=secret" }), /Inline credential URL/);
  assert.doesNotThrow(() => assertNoInlineSecrets({ authentication: { type: "ManagedServiceIdentity" }, connectionId: "/shared/azureblob" }));
});

test("verifies exact bytes rather than document counts alone", () => {
  assert.equal(checksum("original"), checksum(Buffer.from("original")));
  assert.notEqual(checksum("original"), checksum("modified"));
});
