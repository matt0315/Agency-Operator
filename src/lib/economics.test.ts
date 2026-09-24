import assert from "node:assert/strict";
import test from "node:test";
import { decideJob } from "./economics";
import { rainAnalysis } from "./mock-analysis";
import { routeFromAnalysis } from "./router";
import type { BriefAnalysis, RouteStep } from "./types";

const now = new Date();
const future = new Date(now.getTime() + 72 * 3_600_000).toISOString();
const past = new Date(now.getTime() - 3_600_000).toISOString();

function pricedSteps(): RouteStep[] {
  return routeFromAnalysis(rainAnalysis(), "After the Rain: Glass Monument").map((step) =>
    step.conditional ? step : step,
  );
}

function decide(analysis: BriefAnalysis, extra?: Partial<Parameters<typeof decideJob>[0]>) {
  return decideJob({
    analysis,
    steps: pricedSteps().filter((step) => !step.conditional),
    clientPriceMicros: 2_800_000_000,
    sourceFeeBps: 1000,
    contingencyBps: 2000,
    targetMarginBps: 5500,
    maxProductionMicros: 40_000_000,
    deadlineAt: future,
    now,
    ...extra,
  });
}

test("accepts a clear priced job with room for margin", () => {
  const analysis = rainAnalysis();
  analysis.missingAssets = [];
  analysis.questionsForClient = [];
  const result = decide(analysis);
  assert.equal(result.decision, "accept");
  assert.equal(result.economics.priceDataComplete, true);
  assert.equal(result.economics.overBudget, false);
  assert.ok((result.economics.grossMarginBps ?? 0) >= 5500);
});

test("holds a job for review when a reference is missing", () => {
  const result = decide(rainAnalysis());
  assert.equal(result.decision, "human_review");
  assert.match(result.reasons.join(" "), /glass sample/i);
});

test("holds likeness, packaging, factual claims, music, and unclear rights", () => {
  const analysis = rainAnalysis();
  analysis.missingAssets = [];
  for (const kind of ["likeness", "voice", "logo", "packaging_text", "factual_claim", "licensed_music", "unclear_rights"] as const) {
    const result = decide({
      ...analysis,
      rightsAndConsentFlags: [{ kind, detail: "Needs a person." }],
    });
    assert.equal(result.decision, "human_review", kind);
  }
});

test("rejects deceptive impersonation", () => {
  const analysis = rainAnalysis();
  analysis.missingAssets = [];
  analysis.deceptiveImpersonation = true;
  const result = decide(analysis);
  assert.equal(result.decision, "reject");
});

test("rejects an empty deliverable", () => {
  const analysis = rainAnalysis();
  analysis.deliverables = [];
  analysis.missingAssets = [];
  const result = decide(analysis);
  assert.equal(result.decision, "reject");
});

test("rejects a passed deadline", () => {
  const analysis = rainAnalysis();
  analysis.missingAssets = [];
  const result = decide(analysis, { deadlineAt: past });
  assert.equal(result.decision, "reject");
});

test("rejects when generation plus contingency exceeds the production budget", () => {
  const analysis = rainAnalysis();
  analysis.missingAssets = [];
  const result = decide(analysis, { maxProductionMicros: 1_000 });
  assert.equal(result.decision, "reject");
  assert.match(result.reasons.join(" "), /production budget/);
});

test("reviews instead of guessing when a price is missing", () => {
  const analysis = rainAnalysis();
  analysis.missingAssets = [];
  const steps = pricedSteps()
    .filter((step) => !step.conditional)
    .map((step, index) => (index === 0 ? { ...step, unitCostMicros: null, priceKnown: false, modelName: "Unpriced lane" } : step));
  const result = decide(analysis, { steps });
  assert.equal(result.decision, "human_review");
  assert.match(result.reasons.join(" "), /Price data is missing/);
});

test("reviews a negative margin that is still inside the production budget", () => {
  const analysis = rainAnalysis();
  analysis.missingAssets = [];
  const result = decide(analysis, { clientPriceMicros: 100_000, sourceFeeBps: 0, maxProductionMicros: 50_000_000 });
  assert.equal(result.decision, "human_review");
  assert.match(result.reasons.join(" "), /negative|margin/i);
});

test("the model advisory decision does not override the calculator", () => {
  const analysis = rainAnalysis();
  analysis.missingAssets = [];
  analysis.decision = "reject";
  const result = decide(analysis);
  assert.equal(result.decision, "accept");
});
