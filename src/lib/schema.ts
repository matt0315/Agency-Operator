import { z } from "zod";
import type { BriefAnalysis } from "./types";

export const deliverableSchema = z
  .object({
    name: z.string().min(1),
    format: z.string().min(1),
    aspectRatio: z.string().min(1),
    durationSeconds: z.number().nullable(),
    resolution: z.string().min(1),
    exactText: z.string(),
  })
  .strict();

export const rightsFlagSchema = z
  .object({
    kind: z.enum([
      "likeness",
      "voice",
      "logo",
      "packaging_text",
      "factual_claim",
      "licensed_music",
      "unclear_rights",
      "impersonation",
      "other",
    ]),
    detail: z.string().min(1),
  })
  .strict();

export const proposedStepSchema = z
  .object({
    id: z.string().min(1),
    capability: z.string().min(1),
    role: z.enum(["search", "control", "ship", "finish"]),
    purpose: z.string().min(1),
  })
  .strict();

export const briefAnalysisSchema = z
  .object({
    jobType: z.string().min(1),
    conciseSummary: z.string().min(1),
    deliverables: z.array(deliverableSchema),
    suppliedAssets: z.array(z.string()),
    missingAssets: z.array(z.string()),
    questionsForClient: z.array(z.string()),
    brandConstraints: z.array(z.string()),
    rightsAndConsentFlags: z.array(rightsFlagSchema),
    technicalRisks: z.array(z.string()),
    revisionRisk: z.enum(["low", "medium", "high"]),
    confidence: z.number().int().min(0).max(100),
    decision: z.enum(["accept", "human_review", "reject"]),
    decisionReasons: z.array(z.string()),
    proposedWorkflow: z.array(proposedStepSchema),
    estimatedAttemptsByStep: z.array(
      z
        .object({
          stepId: z.string().min(1),
          attempts: z.number().int().positive(),
        })
        .strict(),
    ),
    assumptions: z.array(z.string()),
    cannotDeliverReliably: z.boolean(),
    deceptiveImpersonation: z.boolean(),
  })
  .strict();

export type ParseResult =
  | { ok: true; analysis: BriefAnalysis }
  | { ok: false; error: string };

export function parseAnalysis(input: unknown): ParseResult {
  const parsed = briefAnalysisSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") || "analysis";
    return { ok: false, error: `${path}: ${issue?.message ?? "invalid analysis"}` };
  }
  return { ok: true, analysis: parsed.data };
}

export function parseAnalysisResponse(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Response was not valid JSON." };
  }
  return parseAnalysis(data);
}

/** Strict Structured Outputs schema for the OpenAI Responses API. */
export const briefAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "jobType",
    "conciseSummary",
    "deliverables",
    "suppliedAssets",
    "missingAssets",
    "questionsForClient",
    "brandConstraints",
    "rightsAndConsentFlags",
    "technicalRisks",
    "revisionRisk",
    "confidence",
    "decision",
    "decisionReasons",
    "proposedWorkflow",
    "estimatedAttemptsByStep",
    "assumptions",
    "cannotDeliverReliably",
    "deceptiveImpersonation",
  ],
  properties: {
    jobType: { type: "string" },
    conciseSummary: { type: "string" },
    deliverables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "format", "aspectRatio", "durationSeconds", "resolution", "exactText"],
        properties: {
          name: { type: "string" },
          format: { type: "string" },
          aspectRatio: { type: "string" },
          durationSeconds: { type: ["number", "null"] },
          resolution: { type: "string" },
          exactText: { type: "string" },
        },
      },
    },
    suppliedAssets: { type: "array", items: { type: "string" } },
    missingAssets: { type: "array", items: { type: "string" } },
    questionsForClient: { type: "array", items: { type: "string" } },
    brandConstraints: { type: "array", items: { type: "string" } },
    rightsAndConsentFlags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "detail"],
        properties: {
          kind: {
            type: "string",
            enum: [
              "likeness",
              "voice",
              "logo",
              "packaging_text",
              "factual_claim",
              "licensed_music",
              "unclear_rights",
              "impersonation",
              "other",
            ],
          },
          detail: { type: "string" },
        },
      },
    },
    technicalRisks: { type: "array", items: { type: "string" } },
    revisionRisk: { type: "string", enum: ["low", "medium", "high"] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    decision: { type: "string", enum: ["accept", "human_review", "reject"] },
    decisionReasons: { type: "array", items: { type: "string" } },
    proposedWorkflow: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "capability", "role", "purpose"],
        properties: {
          id: { type: "string" },
          capability: { type: "string" },
          role: { type: "string", enum: ["search", "control", "ship", "finish"] },
          purpose: { type: "string" },
        },
      },
    },
    estimatedAttemptsByStep: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stepId", "attempts"],
        properties: {
          stepId: { type: "string" },
          attempts: { type: "integer", minimum: 1 },
        },
      },
    },
    assumptions: { type: "array", items: { type: "string" } },
    cannotDeliverReliably: { type: "boolean" },
    deceptiveImpersonation: { type: "boolean" },
  },
} as const;
