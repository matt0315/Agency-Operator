import type { AutonomySettings, AutoSendKey, MessageRecord, RevisionRecord } from "./types";

export const DEFAULT_AUTONOMY: AutonomySettings = {
  fullyAutomaticWithinLimits: true,
  autoRepair: true,
  autoAdvanceGenerations: true,
  maxAutomaticSpendPerJobMicros: 20_000_000,
  maxAutomaticSpendPerRepairMicros: 2_000_000,
  maxAttemptsPerStep: 3,
  allowedModelFamilies: [
    "soul",
    "marketing-studio",
    "qwen",
    "ideogram",
    "recraft",
    "pixverse",
    "kling",
    "seedance",
    "minimax",
    "ltx",
    "wan",
  ],
  autoSend: {
    intakeQuestions: false,
    proposals: false,
    progressUpdates: false,
    conceptShare: false,
    changeOrders: false,
    feedbackRequests: false,
  },
  finalDeliveryRequiresApproval: true,
  alwaysPause: {
    likenessOrVoice: true,
    unclearOwnership: true,
    factualClaims: true,
    exactPackagingOrRegulatedCopy: true,
    negativeMargin: true,
    missedDeadlineRisk: true,
    clientDispute: true,
  },
};

const MESSAGE_SETTING: Partial<Record<MessageRecord["kind"], AutoSendKey>> = {
  intake_question: "intakeQuestions",
  proposal: "proposals",
  progress: "progressUpdates",
  concept: "conceptShare",
  change_order: "changeOrders",
  feedback: "feedbackRequests",
};

export function dispatchDecision(input: {
  kind: MessageRecord["kind"];
  channel: MessageRecord["channel"];
  settings: AutonomySettings;
}): { status: "draft" | "sent" | "blocked"; reason: string } {
  if (input.kind === "delivery") {
    if (input.settings.finalDeliveryRequiresApproval) {
      return {
        status: "blocked",
        reason: "Final delivery always requires human approval under Autonomy Settings.",
      };
    }
  }
  if (input.channel === "marketplace") {
    return {
      status: "draft",
      reason: "Marketplace messages are draft-only. Agency Operator does not send them.",
    };
  }
  if (input.channel === "internal" || input.kind === "escalation" || input.kind === "revision") {
    return { status: "draft", reason: "Internal notes and revision interpretations stay in the studio until a person sends them." };
  }
  const key = MESSAGE_SETTING[input.kind];
  if (!key) return { status: "draft", reason: "This message type is not on the auto-send list." };
  if (input.channel !== "direct_email" && input.channel !== "first_party_portal") {
    return { status: "draft", reason: "Only direct email or the first-party portal can auto-send, and only when the type is enabled." };
  }
  if (!input.settings.autoSend[key]) {
    return { status: "draft", reason: `${key} is set to draft for approval.` };
  }
  return { status: "sent", reason: `${key} is enabled for ${input.channel}.` };
}

export function repairAllowed(input: {
  incrementalMicros: number | null;
  jobSpendMicros: number;
  attempts: number;
  family: string;
  settings: AutonomySettings;
  introducesRightsIssue: boolean;
}): { ok: boolean; reason: string } {
  if (input.introducesRightsIssue) {
    return { ok: false, reason: "The repair would create a rights, factual, or identity issue. It is escalated." };
  }
  if (input.incrementalMicros == null) {
    return { ok: false, reason: "The repair model has no catalog price. It is escalated instead of guessed." };
  }
  if (!input.settings.allowedModelFamilies.includes(input.family)) {
    return { ok: false, reason: `${input.family} is not in the allowed model families.` };
  }
  if (input.attempts > input.settings.maxAttemptsPerStep) {
    return { ok: false, reason: "The step would exceed the maximum generation attempts." };
  }
  if (input.incrementalMicros > input.settings.maxAutomaticSpendPerRepairMicros) {
    return { ok: false, reason: "Incremental repair cost exceeds the per-repair cap." };
  }
  if (input.jobSpendMicros + input.incrementalMicros > input.settings.maxAutomaticSpendPerJobMicros) {
    return { ok: false, reason: "The repair would exceed the per-job automatic spend cap." };
  }
  return { ok: true, reason: "Inside the pre-approved per-repair and per-job caps." };
}

export function classifyRevision(note: string, includedRoundsRemaining: number): Pick<
  RevisionRecord,
  "classification" | "recommendedAction" | "affectedDeliverable"
> {
  const text = note.toLowerCase();
  const scope =
    /another|additional|also deliver|extra|30-second|30 second|new language|translate|add a|second film|cutdown|director/.test(text) &&
    !/warmer|hopeful|grade|color|reveal/.test(text);
  if (scope || includedRoundsRemaining <= 0) {
    return {
      classification: "scope_change",
      affectedDeliverable: "Outside the agreed package",
      recommendedAction: "Draft a change order. Do not generate until a person approves the new price and spend.",
    };
  }
  return {
    classification: "included",
    affectedDeliverable: "Final reveal",
    recommendedAction: "Apply one targeted grade edit on the reveal. This uses an included revision, not a new scope.",
  };
}

export function pauseReasons(input: {
  settings: AutonomySettings;
  likeness: boolean;
  voice: boolean;
  unclearOwnership: boolean;
  factual: boolean;
  packaging: boolean;
  negativeMargin: boolean;
  deadlineRisk: boolean;
  dispute: boolean;
}): string[] {
  const reasons: string[] = [];
  const p = input.settings.alwaysPause;
  if (p.likenessOrVoice && (input.likeness || input.voice)) reasons.push("Likeness or voice always pauses the workflow.");
  if (p.unclearOwnership && input.unclearOwnership) reasons.push("Unclear asset ownership always pauses the workflow.");
  if (p.factualClaims && input.factual) reasons.push("Factual advertising claims always pause the workflow.");
  if (p.exactPackagingOrRegulatedCopy && input.packaging) reasons.push("Exact packaging or regulated copy always pauses the workflow.");
  if (p.negativeMargin && input.negativeMargin) reasons.push("Negative expected margin always pauses the workflow.");
  if (p.missedDeadlineRisk && input.deadlineRisk) reasons.push("Missed deadline risk always pauses the workflow.");
  if (p.clientDispute && input.dispute) reasons.push("A client dispute always pauses the workflow.");
  return reasons;
}

/** Maximum safe profile. Concept share and change orders stay off. Final delivery still needs a person. */
export function fullyAutomaticPreset(current: AutonomySettings): AutonomySettings {
  return {
    ...current,
    fullyAutomaticWithinLimits: true,
    autoRepair: true,
    autoAdvanceGenerations: true,
    autoSend: {
      intakeQuestions: true,
      proposals: false,
      progressUpdates: true,
      conceptShare: false,
      changeOrders: false,
      feedbackRequests: true,
    },
    finalDeliveryRequiresApproval: true,
    alwaysPause: {
      likenessOrVoice: true,
      unclearOwnership: true,
      factualClaims: true,
      exactPackagingOrRegulatedCopy: true,
      negativeMargin: true,
      missedDeadlineRisk: true,
      clientDispute: true,
    },
  };
}

const HARD_RIGHTS = new Set([
  "likeness",
  "voice",
  "logo",
  "packaging_text",
  "factual_claim",
  "licensed_music",
  "unclear_rights",
  "impersonation",
]);

export function autoAdvanceDecision(input: {
  settings: AutonomySettings;
  decision: "accept" | "human_review" | "reject";
  analysis: { missingAssets: string[]; rightsAndConsentFlags: { kind: string }[]; deliverables: { format: string; aspectRatio: string; durationSeconds: number | null }[] };
  productionMicros: number;
  generationMicros: number;
  maxProductionMicros: number;
  priceDataComplete: boolean;
  negativeMargin: boolean;
  belowTargetMargin: boolean;
  overBudget: boolean;
  hoursUntilDeadline: number;
}): { action: "run" | "wait" | "stop"; reasons: string[] } {
  if (input.decision === "reject" || input.overBudget) {
    return {
      action: "stop",
      reasons: ["The job is rejected or over the production budget. Nothing will generate."],
    };
  }
  if (!input.settings.fullyAutomaticWithinLimits) {
    return { action: "wait", reasons: ["Fully automatic within limits is off. A person runs the next step."] };
  }
  const waits: string[] = [];
  if (!input.priceDataComplete) waits.push("A selected model has no price. Waiting on a person instead of guessing.");
  if (input.negativeMargin && input.settings.alwaysPause.negativeMargin) {
    waits.push("Expected margin is negative. Waiting on a person.");
  }
  if (input.productionMicros > input.maxProductionMicros) {
    waits.push("Generation plus contingency is over the production ceiling.");
  }
  if (
    input.generationMicros > input.settings.maxAutomaticSpendPerJobMicros ||
    input.productionMicros > input.settings.maxAutomaticSpendPerJobMicros
  ) {
    waits.push("Expected spend is over the per-job automatic cap. Waiting on a person.");
  }
  const pausedRights = input.analysis.rightsAndConsentFlags.filter((flag) => HARD_RIGHTS.has(flag.kind));
  if (pausedRights.length) {
    waits.push(`Rights or identity hold: ${pausedRights.map((flag) => flag.kind.replaceAll("_", " ")).join(", ")}.`);
  }
  if (input.analysis.missingAssets.length) {
    waits.push("A required input is missing. The client agent drafted the question. Production waits.");
  }
  if (input.analysis.deliverables.some((item) => !item.format || !item.aspectRatio)) {
    waits.push("A deliverable is missing format or aspect ratio.");
  }
  const motion = input.analysis.deliverables.some((item) => (item.durationSeconds ?? 0) > 0);
  if (motion && input.hoursUntilDeadline >= 0 && input.hoursUntilDeadline < 12 && input.settings.alwaysPause.missedDeadlineRisk) {
    waits.push("The motion deadline is under 12 hours. Waiting on a person.");
  }
  if (waits.length) return { action: "wait", reasons: waits };
  if (input.decision === "accept") {
    return { action: "run", reasons: ["Accepted inside the production ceiling and the automatic spend cap."] };
  }
  if (input.decision === "human_review" && input.belowTargetMargin) {
    return {
      action: "run",
      reasons: ["Margin is below target, still positive, and inside both ceilings. Auto-approved."],
    };
  }
  return { action: "wait", reasons: ["The review is not on the auto-approve list. Waiting on a person."] };
}

export function openWaits(input: {
  status: "new" | "needs_review" | "approved" | "generating" | "qa" | "delivered" | "rejected";
  settings: AutonomySettings;
  decision: "accept" | "human_review" | "reject" | null;
  reasons: string[];
}): string[] {
  if (input.status === "rejected") return ["Stopped. This job was rejected and will not generate."];
  if (input.status === "delivered") return [];
  if (input.status === "new" && !input.settings.fullyAutomaticWithinLimits) {
    return ["Waiting on a person to analyze the pasted brief."];
  }
  if (input.status === "needs_review") {
    return input.reasons.length ? input.reasons : ["Waiting on a person to approve the workflow."];
  }
  if (input.status === "approved" && !input.settings.autoAdvanceGenerations) {
    return ["Workflow is approved. Waiting on a person to start generation."];
  }
  if (input.status === "qa" && input.settings.finalDeliveryRequiresApproval) {
    return ["Approve delivery. The package is drafted and has not been sent."];
  }
  if (input.status === "generating") return [];
  return [];
}

export function boardHint(status: "new" | "needs_review" | "approved" | "generating" | "qa" | "delivered" | "rejected"): string {
  if (status === "new" || status === "needs_review") return "Waiting on you";
  if (status === "approved" || status === "generating") return "Running";
  if (status === "qa") return "Approve delivery";
  if (status === "delivered") return "Delivered";
  return "Stopped";
}
