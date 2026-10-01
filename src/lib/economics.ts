import { getModel } from "./catalog";
import { hoursUntil } from "./format";
import type { BriefAnalysis, DecisionResult, Economics, RouteStep } from "./types";

export function stepCostMicros(step: Pick<RouteStep, "unitCostMicros" | "attempts" | "quantity">): number | null {
  if (step.unitCostMicros == null) return null;
  return step.unitCostMicros * step.attempts * step.quantity;
}

export function generationSubtotalMicros(steps: RouteStep[], includeConditional = false): {
  total: number;
  missing: string[];
} {
  let total = 0;
  const missing: string[] = [];
  for (const step of steps) {
    if (step.conditional && !includeConditional) continue;
    const cost = stepCostMicros(step);
    if (cost == null) {
      missing.push(step.modelName || step.modelId);
      continue;
    }
    total += cost;
  }
  return { total, missing };
}

export function computeEconomics(input: {
  steps: RouteStep[];
  clientPriceMicros: number;
  sourceFeeBps: number;
  contingencyBps: number;
  targetMarginBps: number;
  maxProductionMicros: number;
  includeConditional?: boolean;
}): Economics {
  const { total, missing } = generationSubtotalMicros(input.steps, input.includeConditional ?? false);
  const sourceFeeMicros = Math.round((input.clientPriceMicros * input.sourceFeeBps) / 10_000);
  const contingencyMicros = Math.round((total * input.contingencyBps) / 10_000);
  const productionMicros = total + contingencyMicros;
  const grossProfitMicros = input.clientPriceMicros - sourceFeeMicros - productionMicros;
  const grossMarginBps =
    input.clientPriceMicros > 0 ? Math.round((grossProfitMicros * 10_000) / input.clientPriceMicros) : null;
  return {
    clientPriceMicros: input.clientPriceMicros,
    sourceFeeBps: input.sourceFeeBps,
    sourceFeeMicros,
    generationMicros: total,
    contingencyBps: input.contingencyBps,
    contingencyMicros,
    productionMicros,
    grossProfitMicros,
    grossMarginBps,
    targetMarginBps: input.targetMarginBps,
    maxProductionMicros: input.maxProductionMicros,
    overBudget: productionMicros > input.maxProductionMicros,
    negativeMargin: grossProfitMicros < 0,
    belowTargetMargin: grossMarginBps == null || grossMarginBps < input.targetMarginBps,
    missingPrices: missing,
    priceDataComplete: missing.length === 0,
  };
}

const REVIEW_RIGHTS = new Set([
  "likeness",
  "voice",
  "logo",
  "packaging_text",
  "factual_claim",
  "licensed_music",
  "unclear_rights",
]);

export function decideJob(input: {
  analysis: BriefAnalysis;
  steps: RouteStep[];
  clientPriceMicros: number;
  sourceFeeBps: number;
  contingencyBps: number;
  targetMarginBps: number;
  maxProductionMicros: number;
  deadlineAt: string;
  now?: Date;
  includeConditional?: boolean;
}): DecisionResult {
  const economics = computeEconomics({
    steps: input.steps,
    clientPriceMicros: input.clientPriceMicros,
    sourceFeeBps: input.sourceFeeBps,
    contingencyBps: input.contingencyBps,
    targetMarginBps: input.targetMarginBps,
    maxProductionMicros: input.maxProductionMicros,
    includeConditional: input.includeConditional,
  });

  const reject: string[] = [];
  const review: string[] = [];

  if (input.analysis.deceptiveImpersonation || input.analysis.rightsAndConsentFlags.some((f) => f.kind === "impersonation")) {
    reject.push("The request asks for deceptive impersonation. That work is rejected.");
  }
  if (input.analysis.cannotDeliverReliably || input.analysis.deliverables.length === 0) {
    reject.push("There is no clear deliverable the studio can produce reliably.");
  }
  const hours = hoursUntil(input.deadlineAt, input.now ?? new Date());
  if (Number.isFinite(hours) && hours < 0) {
    reject.push("The deadline has already passed.");
  }
  if (!economics.priceDataComplete) {
    review.push(
      `Price data is missing for ${economics.missingPrices.join(", ")}. The job is held for a live estimate instead of a guessed rate.`,
    );
  }
  if (economics.priceDataComplete && economics.overBudget) {
    reject.push("Generation cost plus contingency exceeds the configured production budget.");
  }
  if (economics.priceDataComplete && economics.negativeMargin) {
    review.push("Expected gross profit is negative. The workflow pauses for a human.");
  }

  for (const flag of input.analysis.rightsAndConsentFlags) {
    if (REVIEW_RIGHTS.has(flag.kind)) {
      review.push(`Human review required: ${flag.kind.replaceAll("_", " ")} — ${flag.detail}`);
    }
  }
  if (input.analysis.missingAssets.length > 0) {
    review.push(`Reference material is incomplete: ${input.analysis.missingAssets.join("; ")}`);
  }
  const hasVideo = input.analysis.deliverables.some((d) => d.durationSeconds != null && d.durationSeconds > 0);
  if (hasVideo && hours >= 0 && hours < 12) {
    review.push("The deadline is under 12 hours for a motion deliverable, which is not a comfortable production window.");
  }
  if (input.analysis.deliverables.some((d) => !d.format || !d.aspectRatio)) {
    review.push("A deliverable is missing format or aspect ratio.");
  }
  if (economics.priceDataComplete && !economics.overBudget && economics.belowTargetMargin) {
    review.push("Expected gross margin is below the configured target.");
  }

  let decision: DecisionResult["decision"] = "accept";
  if (reject.length) decision = "reject";
  else if (review.length) decision = "human_review";

  const reasons =
    decision === "accept"
      ? [
          "The deliverable is clear, priced models cover the route, the deadline is still open, and expected margin clears the target.",
        ]
      : decision === "reject"
        ? reject
        : review;

  return { decision, reasons, economics };
}

export function hydrateStepCosts(step: RouteStep): RouteStep {
  const model = getModel(step.modelId);
  const unitCostMicros = model ? model.usdMicros : step.unitCostMicros;
  const priceKnown = unitCostMicros != null;
  const estimated = priceKnown ? unitCostMicros * step.attempts * step.quantity : null;
  return {
    ...step,
    modelName: model?.name ?? step.modelName,
    unit: model?.unit ?? step.unit,
    unitCostMicros,
    priceKnown,
    priceNote: model?.priceNote ?? step.priceNote,
    failureMode: step.failureMode || model?.failureMode || "",
    estimatedTotalMicros: estimated,
    maxAuthorizedMicros: estimated,
  };
}
