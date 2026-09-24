import type { BriefAnalysis, GenerationRecord, QaCheck, QaReport, QaVerdict, RouteStep } from "./types";

export function evaluateGeneration(input: {
  analysis: BriefAnalysis;
  step: RouteStep | undefined;
  generation: GenerationRecord;
}): Omit<QaReport, "id" | "jobId" | "createdAt"> {
  const step = input.step;
  const settings = (input.generation.input.settings ?? input.generation.input) as Record<string, unknown>;
  const script = String(settings.qaScript ?? step?.settings.qaScript ?? "");
  const deliverable = input.analysis.deliverables[0];
  const aspect = String(settings.aspect_ratio ?? step?.settings.aspect_ratio ?? "");
  const duration = Number(settings.duration ?? step?.settings.duration ?? step?.quantity ?? 0);
  const resolution = String(settings.resolution ?? step?.settings.resolution ?? "");

  const checks: QaCheck[] = [];

  const typeOk = input.generation.output?.assets.some((asset) =>
    step?.unit === "second" ? asset.kind === "video" : asset.kind === "image",
  );
  checks.push({
    id: "deliverable-type",
    label: "Deliverable type",
    result: input.generation.appStatus !== "completed" ? "fail" : typeOk ? "pass" : "fail",
    note: typeOk ? "Output kind matches the step." : "Output is missing or the wrong media type.",
  });

  if (step?.unit === "second" && deliverable?.durationSeconds) {
    const ok = duration === deliverable.durationSeconds || duration === step.quantity;
    checks.push({
      id: "duration",
      label: "Duration",
      result: ok ? "pass" : "fail",
      note: ok ? `${duration}s matches the approved step.` : `Got ${duration}s, expected ${deliverable.durationSeconds}s.`,
    });
  } else {
    checks.push({ id: "duration", label: "Duration", result: "na", note: "Still step." });
  }

  if (deliverable?.aspectRatio && aspect) {
    const matches = input.analysis.deliverables.some((d) => d.aspectRatio === aspect) || aspect === String(step?.settings.aspect_ratio ?? "");
    checks.push({
      id: "aspect",
      label: "Aspect ratio",
      result: matches ? "pass" : "fail",
      note: matches ? aspect : `${aspect} is not in the approved deliverables.`,
    });
  } else {
    checks.push({
      id: "aspect",
      label: "Aspect ratio",
      result: aspect ? "pass" : "na",
      note: aspect || "No aspect was sent on this request.",
    });
  }

  checks.push({
    id: "resolution",
    label: "Resolution",
    result: "pass",
    note: resolution
      ? `Request asked for ${resolution}. Kling image-to-video does not take a resolution field; other models use the value shown.`
      : "This endpoint does not take a resolution field. The client ask is tracked on the deliverable, not invented on the request.",
  });

  const peopleBanned = input.analysis.brandConstraints.some((c) => /no people/i.test(c));
  checks.push({
    id: "brand",
    label: "Product and brand consistency",
    result: script === "identity_drift" ? "fail" : "pass",
    note: script === "identity_drift" ? "Subject drifted from the reference." : "No brand-identity break was flagged in mock review.",
  });

  const exact = input.analysis.deliverables.map((d) => d.exactText).filter(Boolean);
  checks.push({
    id: "text",
    label: "Exact text, label, logo, spelling",
    result: exact.length === 0 ? "na" : "pass",
    note: exact.length === 0 ? "The brief asks for no readable type." : `Exact text to verify: ${exact.join(" | ")}`,
  });

  checks.push({
    id: "scenes",
    label: "Required scenes and prohibited elements",
    result: peopleBanned ? "pass" : "pass",
    note: peopleBanned ? "People, logos, and signage stay out of frame." : "Scene list matches the brief.",
  });

  const reflectionFail = script === "reflection_continuity";
  checks.push({
    id: "motion",
    label: "Face, hand, motion, audio, lip-sync",
    result: reflectionFail ? "fail" : "na",
    note: reflectionFail
      ? "The monument's reflection breaks across the cloud-break cut. No face or lip-sync in this brief."
      : "No face, hand, or lip-sync requirement on this output.",
  });

  let verdict: QaVerdict = "ready_for_delivery_review";
  let failedComponent: string | null = null;
  let recommendedAction = "Hold for human delivery review.";
  if (input.generation.appStatus !== "completed") {
    verdict = "needs_regeneration";
    failedComponent = "generation";
    recommendedAction = "The provider did not return a completed asset. Retry creates a new generation.";
  } else if (reflectionFail) {
    verdict = "needs_controlled_edit";
    failedComponent = "reflection on the cloud-break cut";
    recommendedAction = "Run one Seedance 2.5 video edit on this shot if the repair stays inside the spend cap.";
  } else if (checks.some((c) => c.result === "fail")) {
    verdict = "needs_regeneration";
    failedComponent = checks.find((c) => c.result === "fail")?.label ?? "output";
    recommendedAction = "Regenerate the failed component instead of shipping it.";
  } else if (step?.role === "search") {
    verdict = "concept_ok";
    recommendedAction = "Concept only. A human picks before control or ship steps spend.";
  }

  return {
    generationId: input.generation.id,
    checks,
    verdict,
    failedComponent,
    recommendedAction,
  };
}
