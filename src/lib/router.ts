import { getModel, listModels } from "./catalog";
import { hydrateStepCosts } from "./economics";
import type { BriefAnalysis, ProductionRole, RouteStep } from "./types";

type Draft = Omit<
  RouteStep,
  | "modelName"
  | "unitCostMicros"
  | "priceKnown"
  | "priceNote"
  | "estimatedTotalMicros"
  | "maxAuthorizedMicros"
  | "unit"
  | "failureMode"
  | "alternativeName"
> & { failureMode?: string; unit?: RouteStep["unit"] };

function finish(drafts: Draft[]): RouteStep[] {
  return drafts.map((draft, index) => {
    const model = getModel(draft.modelId);
    const alt = getModel(draft.alternativeModelId);
    return hydrateStepCosts({
      ...draft,
      order: index + 1,
      modelName: model?.name ?? draft.modelId,
      alternativeName: alt?.name ?? draft.alternativeModelId,
      failureMode: draft.failureMode || model?.failureMode || "",
      unit: model?.unit ?? draft.unit ?? "image",
      unitCostMicros: model?.usdMicros ?? null,
      priceKnown: model?.usdMicros != null,
      priceNote: model?.priceNote ?? "",
      estimatedTotalMicros: null,
      maxAuthorizedMicros: null,
    });
  });
}

function rainRoute(attempts: Record<string, number>): RouteStep[] {
  return finish([
    {
      id: "concepts",
      order: 1,
      role: "search",
      capability: "Inexpensive cinematic still exploration",
      purpose: "Generate 8 monument-and-weather concepts and discard the ones that drift.",
      modelId: "higgsfield-ai/soul/v2/standard",
      why: "Soul 2 is the lowest published image rate and is documented for editorial stills. Eight frames is two batches of four.",
      failureMode: "Architecture and glass color can wander. These frames are not client-facing.",
      alternativeModelId: "marketing-studio/image",
      alternativeNote: "Marketing Studio Image is the control alternative if concepts need a product-style lock earlier.",
      attempts: attempts.concepts ?? 1,
      quantity: 8,
      inputs: "Monument silhouette description, weather arc, disliked references.",
      expectedOutputs: "Eight 16:9 concept stills.",
      settings: { resolution: "720p", aspect_ratio: "16:9", batch_size: 4, enhance_prompt: false },
      conditional: false,
    },
    {
      id: "keyframes",
      order: 2,
      role: "control",
      capability: "Controlled keyframes for material, scale, and site",
      purpose: "Lock three keyframes: downpour, cloud break, and low sun on wet stone.",
      modelId: "marketing-studio/image",
      why: "Marketing Studio Image accepts reference images and is the documented product/reference control lane.",
      failureMode: "Glass can look like plastic if the reference URLs are weak. Unenhanced auto aspect maps toward square, so aspect is set explicitly.",
      alternativeModelId: "alibaba/qwen-image-3/edit",
      alternativeNote: "Qwen Image 3 Edit is the correction tool if a keyframe needs a local material fix.",
      attempts: attempts.keyframes ?? 1,
      quantity: 3,
      inputs: "Chosen concept, monument silhouette, glass reference, site direction.",
      expectedOutputs: "Three approved 16:9 keyframes.",
      settings: { resolution: "2k", aspect_ratio: "16:9", quality: "high", enhance_prompt: false },
      conditional: false,
    },
    {
      id: "film-169",
      order: 3,
      role: "ship",
      capability: "Premium final motion, 16:9",
      purpose: "Animate the approved keyframe into a 12-second cinematic film with believable rain and reflections.",
      modelId: "kling-video/v3.0/pro/image-to-video",
      why: "Kling 3.0 Pro image-to-video is the premium motion lane: first frame in, native audio, multi-shot support.",
      failureMode: "Water, reflections, and rigid architecture can break between shots. Resolution is not a request field on this endpoint.",
      alternativeModelId: "bytedance/seedance-2.5/image-to-video",
      alternativeNote: "Seedance 2.5 is cheaper per second and preserves a start frame, but its documented max is 720p.",
      attempts: attempts["film-169"] ?? 2,
      quantity: 12,
      inputs: "Approved reveal keyframe and the weather-arc prompt.",
      expectedOutputs: "One 12-second 16:9 film.",
      settings: { duration: 12, aspect_ratio: "16:9", sound: "on", qaScript: "reflection_continuity" },
      conditional: false,
    },
    {
      id: "film-916",
      order: 4,
      role: "ship",
      capability: "Premium final motion, 9:16",
      purpose: "Reframe the same locked monument into a 12-second vertical film without changing architecture.",
      modelId: "kling-video/v3.0/pro/image-to-video",
      why: "The same premium lane keeps camera language consistent across the two deliveries.",
      failureMode: "Vertical reframes can crop the site or scale the monument. Treat a crop change as a failed component, not a new film.",
      alternativeModelId: "bytedance/seedance-2.5/image-to-video",
      alternativeNote: "Use Seedance only if the vertical pass is a single locked move and 720p is acceptable.",
      attempts: attempts["film-916"] ?? 2,
      quantity: 12,
      inputs: "Same keyframe, 9:16 safe-area note.",
      expectedOutputs: "One 12-second 9:16 film.",
      settings: { duration: 12, aspect_ratio: "9:16", sound: "on" },
      conditional: false,
    },
    {
      id: "repair",
      order: 5,
      role: "finish",
      capability: "Targeted continuity repair",
      purpose: "Repair one reflection or geometry failure without rerunning both films.",
      modelId: "bytedance/seedance-2.5/video-edit",
      why: "Seedance 2.5 video-edit takes the finished shot and a prompt. Docs say not to send duration; cost uses the 12-second source.",
      failureMode: "The edit can warm or cool the grade while fixing the reflection.",
      alternativeModelId: "kling-video/o3/video-edit",
      alternativeNote: "Kling O3 video edit is documented, but it has no published rate, so it cannot be pre-authorized.",
      attempts: attempts.repair ?? 1,
      quantity: 12,
      inputs: "The failed film and a one-sentence repair note.",
      expectedOutputs: "One repaired film matching the source frame.",
      settings: { derivedDuration: true },
      conditional: true,
    },
    {
      id: "grade-stills",
      order: 6,
      role: "finish",
      capability: "Finish the three keyframes",
      purpose: "Grade the approved stills so they match the film without adding people, logos, or type.",
      modelId: "higgsfield-ai/soul/cinema",
      why: "Soul Cinema is the documented graded-still finisher at the same published rate as Soul 2.",
      failureMode: "It is text-to-image with a fixed style, so it is a grade reference, not a pixel lock. Qwen edit is the override if the still must match exactly.",
      alternativeModelId: "alibaba/qwen-image-3/edit",
      alternativeNote: "Switch to Qwen when the still has to keep the keyframe and only change grade.",
      attempts: attempts["grade-stills"] ?? 1,
      quantity: 3,
      inputs: "Approved keyframe descriptions.",
      expectedOutputs: "Three finished stills.",
      settings: { resolution: "720p", aspect_ratio: "16:9", batch_size: 1, enhance_prompt: false },
      conditional: false,
    },
  ]);
}

function orchardRoute(attempts: Record<string, number>): RouteStep[] {
  return finish([
    {
      id: "orbit-studies",
      order: 1,
      role: "search",
      capability: "Fast orbit studies",
      purpose: "Test pacing with two 5-second orbit studies before touching the approved world.",
      modelId: "pixverse/v6/text-to-video",
      why: "PixVerse V6 has a published per-second rate and a 1–15 second duration, so short studies stay cheap.",
      failureMode: "These studies will not match the orchard. They only answer whether the move is slow enough.",
      alternativeModelId: "lightricks/ltx-2.5/text-to-video/fast",
      alternativeNote: "LTX 2.5 Fast is the other documented fast lane, but its rate is unpublished so it stays an alternative.",
      attempts: attempts["orbit-studies"] ?? 2,
      quantity: 5,
      inputs: "Camera note: slow 30-degree orbit, no whip pan.",
      expectedOutputs: "Two disposable 5-second motion studies.",
      settings: { duration: 5, resolution: "720p", aspect_ratio: "16:9" },
      conditional: false,
    },
    {
      id: "palette-lock",
      order: 2,
      role: "control",
      capability: "Low-light palette lock on the approved keyframe",
      purpose: "Edit the supplied orchard keyframe toward sodium green and wet bark without moving the trees.",
      modelId: "alibaba/qwen-image-3/edit",
      why: "Qwen Image 3 Edit is the documented still-edit model and requires the reference image.",
      failureMode: "Edits can repaint foliage. The prompt has to say what must not change.",
      alternativeModelId: "marketing-studio/image",
      alternativeNote: "Marketing Studio can take reference URLs, but it is aimed at product shots more than night landscapes.",
      attempts: attempts["palette-lock"] ?? 2,
      quantity: 1,
      inputs: "Approved orchard keyframe.",
      expectedOutputs: "One controlled hero still.",
      settings: { resolution: "1k", aspect_ratio: "16:9" },
      conditional: false,
    },
    {
      id: "orbit",
      order: 3,
      role: "ship",
      capability: "Smooth orbit from the locked still",
      purpose: "Generate an 8-second orbit that keeps world, depth, and spatial continuity.",
      modelId: "bytedance/seedance-2.5/image-to-video",
      why: "Seedance 2.5 image-to-video starts from image_url, which is the continuity requirement. 720p is the documented maximum on this endpoint, and the brief was qualified to that.",
      failureMode: "Low-light detail can crush. A 1080p master is not available on this endpoint.",
      alternativeModelId: "kling-video/v3.0/pro/image-to-video",
      alternativeNote: "Kling Pro is the cinematic alternative if the move needs harder camera drama. It costs more per second and does not expose resolution.",
      attempts: attempts.orbit ?? 2,
      quantity: 8,
      inputs: "Palette-locked hero still and the orbit direction.",
      expectedOutputs: "One 8-second 16:9 orbit at 720p.",
      settings: { duration: 8, resolution: "720p", bitrate_mode: "high", generate_audio: true },
      conditional: false,
    },
    {
      id: "orbit-repair",
      order: 4,
      role: "finish",
      capability: "Continuity repair if the orbit breaks",
      purpose: "Patch a single spatial or low-light failure on the orbit. No upscaler is available in the current catalog.",
      modelId: "bytedance/seedance-2.5/video-edit",
      why: "The same family can edit the shot it generated. Topaz and other upscalers are not in the current docs index.",
      failureMode: "Editing can disturb the orbit's speed.",
      alternativeModelId: "kling-video/o3/video-edit",
      alternativeNote: "Kling O3 edit has no published rate, so it is visible but not authorized.",
      attempts: attempts["orbit-repair"] ?? 1,
      quantity: 8,
      inputs: "The orbit and the failed-component note.",
      expectedOutputs: "One repaired 8-second orbit, or an escalation if the cap is exceeded.",
      settings: { derivedDuration: true },
      conditional: true,
    },
  ]);
}

function attemptsMap(analysis: BriefAnalysis): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of analysis.estimatedAttemptsByStep) map[row.stepId] = row.attempts;
  return map;
}

function genericRoute(analysis: BriefAnalysis): RouteStep[] {
  const attempts = attemptsMap(analysis);
  const wantsText = analysis.deliverables.some((d) => d.exactText.trim().length > 0);
  const wantsVideo = analysis.deliverables.some((d) => (d.durationSeconds ?? 0) > 0);
  const drafts: Draft[] = [];

  if (!wantsVideo || analysis.proposedWorkflow.some((s) => s.role === "search")) {
    drafts.push({
      id: "explore",
      order: 1,
      role: "search",
      capability: "Concept exploration",
      purpose: "Make inexpensive still concepts before any final motion.",
      modelId: "higgsfield-ai/soul/v2/standard",
      why: "Lowest published image rate for exploration.",
      alternativeModelId: "pixverse/v6/text-to-video",
      alternativeNote: "Use PixVerse only when the exploration itself must move.",
      attempts: attempts.explore ?? 1,
      quantity: 4,
      inputs: "Brief and references.",
      expectedOutputs: "Four concept stills.",
      settings: { batch_size: 4, resolution: "720p" },
      conditional: false,
    });
  }

  drafts.push({
    id: "control",
    order: 2,
    role: "control",
    capability: wantsText ? "Exact text or packaging control" : "Reference control",
    purpose: wantsText ? "Set type or packaging with an edit model." : "Lock the subject before the final asset.",
    modelId: wantsText ? "alibaba/qwen-image-3/edit" : "marketing-studio/image",
    why: wantsText
      ? "Exact text and packaging go to Qwen Image 3 Edit, not a fresh text-to-image roll."
      : "Marketing Studio Image is the documented reference-control image lane.",
    alternativeModelId: wantsText ? "ideogram/v4.0" : "alibaba/qwen-image-3/edit",
    alternativeNote: wantsText ? "Ideogram 4.0 is the poster alternative." : "Qwen edit is the local-correction alternative.",
    attempts: attempts.control ?? 2,
    quantity: 1,
    inputs: "References and exact text, if any.",
    expectedOutputs: "One controlled still.",
    settings: {},
    conditional: false,
  });

  if (wantsVideo) {
    const seconds = Math.max(...analysis.deliverables.map((d) => d.durationSeconds ?? 5));
    drafts.push({
      id: "final-motion",
      order: 3,
      role: "ship",
      capability: "Final motion",
      purpose: "Animate the controlled still.",
      modelId: "kling-video/v3.0/pro/image-to-video",
      why: "Default premium lane when the brief does not match a more specific route.",
      alternativeModelId: "bytedance/seedance-2.5/image-to-video",
      alternativeNote: "Seedance 2.5 if 720p and a quieter camera are enough.",
      attempts: attempts["final-motion"] ?? 2,
      quantity: Math.min(Math.max(seconds, 4), 15),
      inputs: "Controlled still.",
      expectedOutputs: "Final motion deliverable.",
      settings: { duration: Math.min(Math.max(seconds, 3), 15) },
      conditional: false,
    });
  }

  if (analysis.proposedWorkflow.some((step) => step.role === "finish") || wantsText) {
    drafts.push({
      id: "finish",
      order: 4,
      role: "finish",
      capability: "Finish",
      purpose: wantsText ? "Check designed type." : "Grade the delivery still.",
      modelId: wantsText ? "ideogram/v4.0" : "higgsfield-ai/soul/cinema",
      why: wantsText ? "Ideogram is the documented typography lane." : "Soul Cinema grades a still at a published image rate.",
      alternativeModelId: "recraft/v4.1/text-to-image",
      alternativeNote: "Recraft 4.1 is the other designed-graphic rate in the table.",
      attempts: attempts.finish ?? 1,
      quantity: 1,
      inputs: "Approved asset.",
      expectedOutputs: "Finished still.",
      settings: {},
      conditional: false,
    });
  }

  return finish(drafts);
}

export function routeFromAnalysis(analysis: BriefAnalysis, hint?: string): RouteStep[] {
  const blob = `${hint ?? ""} ${analysis.conciseSummary} ${analysis.jobType} ${analysis.deliverables.map((d) => d.name).join(" ")}`.toLowerCase();
  const attempts = attemptsMap(analysis);
  if (blob.includes("glass monument") || blob.includes("after the rain")) return rainRoute(attempts);
  if (blob.includes("night orchard") || blob.includes("slow orbit") || blob.includes("orchard")) return orchardRoute(attempts);
  return genericRoute(analysis);
}

export function replaceStepModel(steps: RouteStep[], stepId: string, modelId: string): RouteStep[] {
  const model = getModel(modelId);
  if (!model) return steps;
  return steps.map((step) => {
    if (step.id !== stepId) return step;
    const others = listModels().filter((candidate) => candidate.id !== modelId && candidate.media === model.media);
    const alt = others.find((candidate) => candidate.roles.includes(step.role as ProductionRole)) ?? others[0];
    return hydrateStepCosts({
      ...step,
      modelId: model.id,
      modelName: model.name,
      unit: model.unit,
      unitCostMicros: model.usdMicros,
      priceKnown: model.usdMicros != null,
      priceNote: model.priceNote,
      failureMode: model.failureMode,
      why: `Manual override to ${model.name}. ${model.strengths}`,
      alternativeModelId: alt?.id ?? step.alternativeModelId,
      alternativeName: alt?.name ?? step.alternativeName,
      alternativeNote: alt ? `${alt.name} remains available. ${alt.failureMode}` : step.alternativeNote,
      estimatedTotalMicros: null,
      maxAuthorizedMicros: null,
    });
  });
}

export const ROUTE_STORY = [
  "Generate inexpensive concepts",
  "Human chooses the frames that hold",
  "Make controlled keyframes",
  "Generate final motion",
  "Repair one continuity failure only if it stays inside the cap",
  "Finish and QA",
];
