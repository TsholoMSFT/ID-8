export type AITask =
  | "extraction"
  | "use-case-generation"
  | "solution-mapping"
  | "formatting"
  | "analysis"
  | "architecture"
  | "journey"
  | "governance"
  | "business-case"
  | "cost-optimization"
  | "executive"
  | "engagement-agenda"
  | "engagement-email"
  | "engagement-timeline"
  | "engagement-closeout"
  | "engagement-diagram"
  | "general";

const OUTPUT_TOKEN_LIMITS: Record<AITask, number> = {
  extraction: 2000,
  "use-case-generation": 6000,
  "solution-mapping": 5000,
  formatting: 1000,
  analysis: 2500,
  architecture: 3500,
  journey: 3000,
  governance: 2500,
  "business-case": 2500,
  "cost-optimization": 2500,
  executive: 2500,
  "engagement-agenda": 3000,
  "engagement-email": 1200,
  "engagement-timeline": 3000,
  "engagement-closeout": 3000,
  "engagement-diagram": 3000,
  general: 2000,
};

const AI_TASKS = new Set<AITask>(Object.keys(OUTPUT_TOKEN_LIMITS) as AITask[]);

export function getOutputTokenLimit(task: unknown): number {
  return typeof task === "string" && AI_TASKS.has(task as AITask)
    ? OUTPUT_TOKEN_LIMITS[task as AITask]
    : OUTPUT_TOKEN_LIMITS.general;
}

export const MAX_AI_INPUT_BYTES = 48_000;

export function selectCompletionModel(model: AIModel, expectJson: boolean, allowPremium: boolean): AIModel {
  if (model === "gpt-4o" && !allowPremium) return "gpt-4o-mini";
  // The deployed Phi model does not complete strict JSON-mode requests reliably.
  if (model === "phi-4-mini-instruct" && expectJson) return "gpt-5-nano";
  return model;
}

export function validateAIInput(prompt: unknown, systemPrompt?: unknown): asserts prompt is string {
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("Prompt is required.");
  if (systemPrompt !== undefined && typeof systemPrompt !== "string") throw new Error("System prompt must be a string.");
  if (Buffer.byteLength(prompt + (systemPrompt || ""), "utf8") > MAX_AI_INPUT_BYTES) {
    throw new Error(`Prompt exceeds the combined ${MAX_AI_INPUT_BYTES}-byte input limit.`);
  }
}
import type { AIModel } from "./ai-provider";
