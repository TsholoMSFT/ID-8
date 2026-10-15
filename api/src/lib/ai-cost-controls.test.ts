import assert from "node:assert/strict";
import test from "node:test";
import { getOutputTokenLimit, getReasoningEffort, MAX_AI_INPUT_BYTES, selectCompletionModel, validateAIInput } from "./ai-cost-controls";

test("uses lower output budgets for compact tasks", () => {
  assert.equal(getOutputTokenLimit("formatting"), 1000);
  assert.equal(getOutputTokenLimit("engagement-email"), 1200);
  assert.equal(getOutputTokenLimit("cost-optimization"), 2500);
});

test("allows larger bounded outputs for complex tasks", () => {
  assert.equal(getOutputTokenLimit("extraction"), 4000);
  assert.equal(getOutputTokenLimit("architecture"), 3500);
  assert.equal(getOutputTokenLimit("executive"), 2500);
  assert.equal(getOutputTokenLimit("use-case-generation"), 6000);
  assert.equal(getOutputTokenLimit("solution-mapping"), 5000);
});

test("reduces reasoning only for supported bounded structured tasks", () => {
  assert.equal(getReasoningEffort("extraction", true), "minimal");
  assert.equal(getReasoningEffort("formatting", true), "minimal");
  assert.equal(getReasoningEffort("analysis", true), undefined);
  assert.equal(getReasoningEffort("extraction", false), undefined);
});

test("falls back to the general budget for missing or unknown tasks", () => {
  assert.equal(getOutputTokenLimit(undefined), 2000);
  assert.equal(getOutputTokenLimit("unknown"), 2000);
});

test("caps combined prompt/system input in bytes, including multibyte text", () => {
  validateAIInput("a".repeat(MAX_AI_INPUT_BYTES));
  assert.throws(() => validateAIInput("a".repeat(MAX_AI_INPUT_BYTES), "x"), /input limit/);
  assert.throws(() => validateAIInput("\u4e00".repeat(MAX_AI_INPUT_BYTES / 2)), /input limit/);
  assert.throws(() => validateAIInput("  "), /required/);
});

test("uses a JSON-capable inexpensive model and requires an explicit premium opt-in", () => {
  assert.equal(selectCompletionModel("phi-4-mini-instruct", true, false), "gpt-5-nano");
  assert.equal(selectCompletionModel("phi-4-mini-instruct", false, false), "phi-4-mini-instruct");
  assert.equal(selectCompletionModel("gpt-4o", false, false), "gpt-4o-mini");
  assert.equal(selectCompletionModel("gpt-4o", false, true), "gpt-4o");
});
