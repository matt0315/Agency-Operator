import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AUTONOMY, autoAdvanceDecision, dispatchDecision, fullyAutomaticPreset, openWaits, repairAllowed } from "./autonomy";
import { orchardAnalysis } from "./mock-analysis";

test("marketplace messages are never sent", () => {
  const settings = {
    ...DEFAULT_AUTONOMY,
    autoSend: { ...DEFAULT_AUTONOMY.autoSend, progressUpdates: true, proposals: true },
  };
  const result = dispatchDecision({ kind: "proposal", channel: "marketplace", settings });
  assert.equal(result.status, "draft");
  assert.match(result.reason, /Marketplace/);
});

test("final delivery stays blocked when approval is required", () => {
  const result = dispatchDecision({
    kind: "delivery",
    channel: "first_party_portal",
    settings: DEFAULT_AUTONOMY,
  });
  assert.equal(result.status, "blocked");
});

test("a direct progress note sends only when the setting allows it", () => {
  const drafted = dispatchDecision({ kind: "progress", channel: "direct_email", settings: DEFAULT_AUTONOMY });
  assert.equal(drafted.status, "draft");
  const sent = dispatchDecision({
    kind: "progress",
    channel: "direct_email",
    settings: { ...DEFAULT_AUTONOMY, autoSend: { ...DEFAULT_AUTONOMY.autoSend, progressUpdates: true } },
  });
  assert.equal(sent.status, "sent");
});

test("repairs stop at the per-repair cap, the job cap, and missing prices", () => {
  const overRepair = repairAllowed({
    incrementalMicros: 3_000_000,
    jobSpendMicros: 0,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: false,
  });
  assert.equal(overRepair.ok, false);
  const overJob = repairAllowed({
    incrementalMicros: 1_000_000,
    jobSpendMicros: 19_500_000,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: false,
  });
  assert.equal(overJob.ok, false);
  const missing = repairAllowed({
    incrementalMicros: null,
    jobSpendMicros: 0,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: false,
  });
  assert.equal(missing.ok, false);
  const rights = repairAllowed({
    incrementalMicros: 100,
    jobSpendMicros: 0,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: true,
  });
  assert.equal(rights.ok, false);
  const ok = repairAllowed({
    incrementalMicros: 885_600,
    jobSpendMicros: 4_000_000,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: false,
  });
  assert.equal(ok.ok, true);
});

const clean = orchardAnalysis();

test("defaults draft messages, keep concept share off, and run routine production", () => {
  assert.equal(DEFAULT_AUTONOMY.fullyAutomaticWithinLimits, true);
  assert.equal(DEFAULT_AUTONOMY.autoRepair, true);
  assert.equal(DEFAULT_AUTONOMY.autoAdvanceGenerations, true);
  assert.equal(DEFAULT_AUTONOMY.autoSend.conceptShare, false);
  assert.equal(DEFAULT_AUTONOMY.autoSend.proposals, false);
  assert.equal(DEFAULT_AUTONOMY.finalDeliveryRequiresApproval, true);
});

test("a clean accept inside both ceilings runs without a person", () => {
  const result = autoAdvanceDecision({
    settings: DEFAULT_AUTONOMY,
    decision: "accept",
    analysis: clean,
    productionMicros: 6_000_000,
    generationMicros: 5_000_000,
    maxProductionMicros: 40_000_000,
    priceDataComplete: true,
    negativeMargin: false,
    belowTargetMargin: false,
    overBudget: false,
    hoursUntilDeadline: 36,
  });
  assert.equal(result.action, "run");
});

test("likeness, missing inputs, and spend caps wait", () => {
  const likeness = autoAdvanceDecision({
    settings: DEFAULT_AUTONOMY,
    decision: "human_review",
    analysis: { ...clean, rightsAndConsentFlags: [{ kind: "likeness" }] },
    productionMicros: 6_000_000,
    generationMicros: 5_000_000,
    maxProductionMicros: 40_000_000,
    priceDataComplete: true,
    negativeMargin: false,
    belowTargetMargin: false,
    overBudget: false,
    hoursUntilDeadline: 36,
  });
  assert.equal(likeness.action, "wait");
  assert.match(likeness.reasons.join(" "), /likeness/i);

  const missing = autoAdvanceDecision({
    settings: DEFAULT_AUTONOMY,
    decision: "human_review",
    analysis: { ...clean, missingAssets: ["Glass sample"] },
    productionMicros: 6_000_000,
    generationMicros: 5_000_000,
    maxProductionMicros: 40_000_000,
    priceDataComplete: true,
    negativeMargin: false,
    belowTargetMargin: false,
    overBudget: false,
    hoursUntilDeadline: 36,
  });
  assert.equal(missing.action, "wait");

  const cap = autoAdvanceDecision({
    settings: DEFAULT_AUTONOMY,
    decision: "accept",
    analysis: clean,
    productionMicros: 25_000_000,
    generationMicros: 21_000_000,
    maxProductionMicros: 40_000_000,
    priceDataComplete: true,
    negativeMargin: false,
    belowTargetMargin: false,
    overBudget: false,
    hoursUntilDeadline: 36,
  });
  assert.equal(cap.action, "wait");
  assert.match(cap.reasons.join(" "), /cap/i);
});

test("a below-target positive margin can auto-approve, and a reject cannot", () => {
  const soft = autoAdvanceDecision({
    settings: DEFAULT_AUTONOMY,
    decision: "human_review",
    analysis: clean,
    productionMicros: 6_000_000,
    generationMicros: 5_000_000,
    maxProductionMicros: 40_000_000,
    priceDataComplete: true,
    negativeMargin: false,
    belowTargetMargin: true,
    overBudget: false,
    hoursUntilDeadline: 36,
  });
  assert.equal(soft.action, "run");
  const rejected = autoAdvanceDecision({
    settings: DEFAULT_AUTONOMY,
    decision: "reject",
    analysis: clean,
    productionMicros: 6_000_000,
    generationMicros: 5_000_000,
    maxProductionMicros: 40_000_000,
    priceDataComplete: true,
    negativeMargin: false,
    belowTargetMargin: false,
    overBudget: false,
    hoursUntilDeadline: 36,
  });
  assert.equal(rejected.action, "stop");
});

test("the fully automatic preset never enables marketplace delivery or concept share", () => {
  const preset = fullyAutomaticPreset({ ...DEFAULT_AUTONOMY, maxAutomaticSpendPerJobMicros: 12_000_000 });
  assert.equal(preset.maxAutomaticSpendPerJobMicros, 12_000_000);
  assert.equal(preset.autoSend.conceptShare, false);
  assert.equal(preset.autoSend.changeOrders, false);
  assert.equal(preset.autoSend.progressUpdates, true);
  assert.equal(preset.finalDeliveryRequiresApproval, true);
  assert.equal(dispatchDecision({ kind: "proposal", channel: "marketplace", settings: preset }).status, "draft");
  assert.equal(dispatchDecision({ kind: "delivery", channel: "first_party_portal", settings: preset }).status, "blocked");
  const waiting = openWaits({ status: "qa", settings: preset, decision: "accept", reasons: [] });
  assert.match(waiting.join(" "), /Approve delivery/);
});
