import { decideJob } from "./economics";
import { mockAnalyze, orchardAnalysis, rainAnalysis } from "./mock-analysis";
import { routeFromAnalysis } from "./router";
import { getTemplate } from "./templates";
import type { ClientMemory, ClientRecord, JobRecord } from "./types";
import {
  insertAnalysis,
  insertAudit,
  insertGeneration,
  insertJob,
  insertLedger,
  insertMessage,
  insertQa,
  insertRevision,
  saveWorkflow,
  setMeta,
  upsertClient,
} from "./db";

const emptyMemory = (): ClientMemory => ({
  logos: [],
  colors: [],
  fonts: [],
  tone: "",
  productDetails: [],
  winningAssets: [],
  rejectedStyles: [],
  deliveryPreferences: [],
  communicationPreferences: [],
  likenessConsent: "None. An earlier approval is not consent for a new person's likeness, voice, or a different use.",
});

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function stamp(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

export const RAIN_BRIEF = `Title: After the Rain: Glass Monument

Pasted from an Upwork message. Do not contact the marketplace. The client is now on our direct thread.

We need a short cinematic concept film of a civic glass monument that appears after a storm. This is not a product ad and not a talking-head video.

Deliverables
- One 12-second film, 16:9
- The same film in 9:16, 12 seconds
- Three approved keyframe stills, 16:9

Fixed package: $2,800
Deadline: 72 hours from kickoff

Supplied
- Approved monument silhouette (elevation)
- Glass material references: ribbed cast and smoked sheet. We still need to confirm which is final.
- Site direction: river terrace, low city behind, no identifiable private buildings
- Weather arc: hard rain, break in the cloud, low sun on wet stone
- Liked: quiet monumental scale, physically believable water
- Disliked: fantasy crystal, neon, people in frame, readable signage

Constraints
- The monument's architecture, material, scale, and site stay consistent across shots
- Water, reflections, and the transition after the storm stay believable
- No people, no logos, no exact packaging text, no licensed music
- Original score is out of scope. Native ambience or silence is fine.

Please confirm the glass sample before final motion.`;

export const ORCHARD_BRIEF = `Title: Night Orchard: Slow Orbit

Pasted from a sales-call note.

Deliverable
- One atmospheric short sequence, 8 seconds, 16:9, built around a smooth orbiting camera move
- One hero still

Supplied
- Approved orchard-world keyframe
- Low-light palette: sodium green, wet bark, no moonlight hotspot
- Camera direction: slow 30-degree orbit, no whip pans
- Pacing reference: hold, drift, settle
- No captions, no voice, no people, no text

Constraints
- Preserve the world, depth, low-light detail, and spatial continuity throughout the orbit
- We accept 720p if that is the ceiling of the reference-preserving model you can price today

Fixed package: $900
Deadline: 48 hours`;

export const REJECT_BRIEF = `Need a 15-second ad. Make a famous singer appear to endorse our canned drink and say the slogan in their real voice. Pull the likeness from a public interview. Budget $500. Need it tomorrow.`;

export const NEW_BRIEF = `Email from Priya Raman.

We may want three seasonal stills for a ceramic pour-over next month. No brief yet, no logo, no deadline. Please wait for the product photos before anyone starts.`;

function client(id: string, name: string, channel: ClientRecord["channel"], memory: Partial<ClientMemory>): ClientRecord {
  return { id, name, channel, memory: { ...emptyMemory(), ...memory } };
}

export function seedDatabase(): void {
  const rainClient = client("client_northline", "Northline Civic Atelier", "first_party_portal", {
    colors: ["storm gray", "wet stone", "smoked glass"],
    tone: "Quiet, monumental, physical. No hype.",
    productDetails: ["Civic glass monument on a river terrace"],
    rejectedStyles: ["Fantasy crystal", "Neon", "People in frame", "Readable signage"],
    deliveryPreferences: ["16:9 and 9:16", "No licensed music"],
    communicationPreferences: ["Short milestone notes", "Ask only when a choice changes the film"],
  });
  const orchardClient = client("client_hollow", "Hollow & Wick", "direct_email", {
    colors: ["sodium green", "wet bark", "near-black"],
    tone: "Hushed. No moonlight hotspot.",
    productDetails: ["Night orchard world"],
    rejectedStyles: ["Whip pans", "People", "Text"],
    deliveryPreferences: ["720p accepted on the priced orbit route"],
    communicationPreferences: ["Email"],
  });
  const priya = client("client_priya", "Priya Raman", "direct_email", { tone: "Practical" });
  upsertClient(rainClient);
  upsertClient(orchardClient);
  upsertClient(priya);
  upsertClient(client("client_reject", "Unassigned", "marketplace", {}));

  const rainJob: JobRecord = {
    id: "job_rain",
    title: "After the Rain: Glass Monument",
    source: "Upwork (pasted)",
    rawBrief: RAIN_BRIEF,
    clientPriceMicros: 2_800_000_000,
    deadlineAt: hoursFromNow(36),
    status: "qa",
    clientId: rainClient.id,
    clientNotes: "Client confirmed the smoked sheet after the intake question. Included revisions: 2.",
    templateId: "launch-video",
    sourceFeeBps: 1000,
    contingencyBps: 2000,
    targetMarginBps: 5500,
    maxProductionMicros: 40_000_000,
    recordingGate: null,
    createdAt: stamp(86_400_000),
    updatedAt: stamp(3_600_000),
  };
  insertJob(rainJob);

  const rainModel = rainAnalysis();
  const rainRoute = routeFromAnalysis(rainModel, rainJob.title);
  const rainModelDecision = decideJob({
    analysis: rainModel,
    steps: rainRoute,
    clientPriceMicros: rainJob.clientPriceMicros,
    sourceFeeBps: rainJob.sourceFeeBps,
    contingencyBps: rainJob.contingencyBps,
    targetMarginBps: rainJob.targetMarginBps,
    maxProductionMicros: rainJob.maxProductionMicros,
    deadlineAt: rainJob.deadlineAt,
  });
  insertAnalysis({
    id: "analysis_rain_model",
    jobId: rainJob.id,
    kind: "model",
    analysis: rainModel,
    decision: rainModelDecision,
    createdAt: stamp(80_000_000),
  });

  const rainHuman = {
    ...rainModel,
    missingAssets: [],
    assumptions: [...rainModel.assumptions, "Client confirmed the smoked sheet. Ribbed cast is rejected."],
    decision: "accept" as const,
    decisionReasons: ["Glass sample confirmed. Advisory accept; the calculator still has to agree."],
    confidence: 86,
  };
  const rainHumanDecision = decideJob({
    analysis: rainHuman,
    steps: rainRoute,
    clientPriceMicros: rainJob.clientPriceMicros,
    sourceFeeBps: rainJob.sourceFeeBps,
    contingencyBps: rainJob.contingencyBps,
    targetMarginBps: rainJob.targetMarginBps,
    maxProductionMicros: rainJob.maxProductionMicros,
    deadlineAt: rainJob.deadlineAt,
  });
  insertAnalysis({
    id: "analysis_rain_human",
    jobId: rainJob.id,
    kind: "human",
    analysis: rainHuman,
    decision: rainHumanDecision,
    createdAt: stamp(70_000_000),
  });

  saveWorkflow({
    id: "wf_rain",
    jobId: rainJob.id,
    status: "approved",
    steps: rainRoute,
    approvedMaxMicros: rainJob.maxProductionMicros,
    createdAt: stamp(69_000_000),
    updatedAt: stamp(20_000_000),
  });

  const gens: { id: string; stepId: string; modelId: string; estimate: number; actual: number; status: "completed" | "failed"; asset?: string; kind?: "image" | "video"; qa?: string; error?: string }[] = [
    { id: "gen_concepts", stepId: "concepts", modelId: "higgsfield-ai/soul/v2/standard", estimate: 25_600, actual: 25_600, status: "completed", asset: "/demo/rain-concept.svg", kind: "image" },
    { id: "gen_fail", stepId: "concepts", modelId: "higgsfield-ai/soul/v2/standard", estimate: 3_200, actual: 0, status: "failed", error: "Mock failure on an extra concept. Failed generations are not billed." },
    { id: "gen_kf1", stepId: "keyframes", modelId: "marketing-studio/image", estimate: 5_900, actual: 5_900, status: "completed", asset: "/demo/rain-keyframe-1.svg", kind: "image" },
    { id: "gen_kf2", stepId: "keyframes", modelId: "marketing-studio/image", estimate: 5_900, actual: 5_900, status: "completed", asset: "/demo/rain-keyframe-2.svg", kind: "image" },
    { id: "gen_kf3", stepId: "keyframes", modelId: "marketing-studio/image", estimate: 5_900, actual: 5_900, status: "completed", asset: "/demo/rain-keyframe-3.svg", kind: "image" },
    { id: "gen_169", stepId: "film-169", modelId: "kling-video/v3.0/pro/image-to-video", estimate: 1_344_000, actual: 1_344_000, status: "completed", asset: "/demo/rain-film-169.svg", kind: "video", qa: "reflection_continuity" },
    { id: "gen_916", stepId: "film-916", modelId: "kling-video/v3.0/pro/image-to-video", estimate: 1_344_000, actual: 1_344_000, status: "completed", asset: "/demo/rain-film-916.svg", kind: "video" },
    { id: "gen_repair", stepId: "repair", modelId: "bytedance/seedance-2.5/video-edit", estimate: 885_600, actual: 885_600, status: "completed", asset: "/demo/rain-repair.svg", kind: "video" },
    { id: "gen_grade", stepId: "grade-stills", modelId: "higgsfield-ai/soul/cinema", estimate: 9_600, actual: 9_600, status: "completed", asset: "/demo/rain-grade.svg", kind: "image" },
  ];

  for (const [index, gen] of gens.entries()) {
    const created = stamp(60_000_000 - index * 1_000_000);
    insertGeneration({
      id: gen.id,
      jobId: rainJob.id,
      stepId: gen.stepId,
      modelId: gen.modelId,
      provider: "mock",
      requestId: `mock_${gen.id}`,
      statusUrl: `mock://requests/${gen.id}/status`,
      cancelUrl: `mock://requests/${gen.id}/cancel`,
      providerStatus: gen.status,
      appStatus: gen.status,
      estimateMicros: gen.estimate,
      actualMicros: gen.actual,
      input: { prompt: gen.stepId, settings: { qaScript: gen.qa ?? "" }, mockAsset: gen.asset ?? "" },
      output: gen.asset
        ? { assets: [{ kind: gen.kind ?? "image", sourceUrl: gen.asset, contentType: "image/svg+xml", localPath: null, fileName: gen.asset.split("/").pop() ?? "asset.svg" }], rawNote: "Mock storyboard stored for the demo." }
        : null,
      error: gen.error ?? null,
      retryOf: null,
      createdAt: created,
      updatedAt: created,
    });
    if (gen.actual > 0) {
      insertLedger({
        id: `led_${gen.id}`,
        jobId: rainJob.id,
        generationId: gen.id,
        label: `${gen.stepId} completed`,
        amountMicros: gen.actual,
        createdAt: created,
      });
    }
  }

  insertQa({
    id: "qa_169",
    jobId: rainJob.id,
    generationId: "gen_169",
    checks: [
      { id: "deliverable-type", label: "Deliverable type", result: "pass", note: "Video storyboard is present." },
      { id: "duration", label: "Duration", result: "pass", note: "12 seconds." },
      { id: "aspect", label: "Aspect ratio", result: "pass", note: "16:9" },
      { id: "resolution", label: "Resolution", result: "pass", note: "Kling image-to-video does not take a resolution field." },
      { id: "brand", label: "Product and brand consistency", result: "pass", note: "Monument silhouette holds." },
      { id: "text", label: "Exact text, label, logo, spelling", result: "na", note: "No readable type in this brief." },
      { id: "scenes", label: "Required scenes and prohibited elements", result: "pass", note: "No people or signage." },
      { id: "motion", label: "Face, hand, motion, audio, lip-sync", result: "fail", note: "The monument reflection breaks on the cloud-break cut." },
    ],
    verdict: "needs_controlled_edit",
    failedComponent: "reflection on the cloud-break cut",
    recommendedAction: "One Seedance 2.5 video edit stays inside the repair cap.",
    createdAt: stamp(18_000_000),
  });

  insertRevision({
    id: "rev_warm",
    jobId: rainJob.id,
    clientNote: "Make the final reveal warmer and more hopeful.",
    affectedDeliverable: "Final reveal, 16:9 and 9:16",
    affectedStepId: "repair",
    classification: "included",
    recommendedAction: "Included revision. One targeted grade on the reveal, not a new film.",
    expectedIncrementalMicros: 885_600,
    approval: "pending",
    appliedGenerationId: null,
    createdAt: stamp(5_000_000),
  });

  const messages = [
    ["msg_q", "intake_question", "sent", "Which glass is the monument?", "Which glass reference is approved for the monument skin — the ribbed cast sample or the smoked sheet? Everything else can wait.", "Human approved this question. It was the one missing input that changes the film."],
    ["msg_progress", "progress", "sent", "Keyframes are ready", "Three keyframes are up for a look: downpour, cloud break, and low sun on wet stone. The smoked sheet is locked. No decision is needed unless the site feels wrong.", "Human approved a milestone note after the keyframes completed."],
    ["msg_concept", "concept", "sent", "Two directions from the batch", "Eight concepts came back. We kept the two that hold the silhouette and threw out the crystal-looking ones. The next spend is the 12-second motion pass.", "Concepts were shared after approval. Auto-share is off."],
    ["msg_delivery", "delivery", "draft", "Delivery is ready for your approval", "The 16:9 film, the 9:16 film, and three stills are in the package. A reflection repair is in the 16:9 cut. Final delivery has not been sent.", "Final delivery requires approval."],
  ] as const;
  for (const [index, message] of messages.entries()) {
    insertMessage({
      id: message[0],
      jobId: rainJob.id,
      kind: message[1],
      channel: "first_party_portal",
      audience: "client",
      status: message[2],
      subject: message[3],
      body: message[4],
      reason: message[5],
      createdAt: stamp(75_000_000 - index * 10_000_000),
    });
  }

  const audits = [
    ["model_decision", "Operator recommended human review until the glass sample was confirmed."],
    ["message_draft", "Intake question drafted, then sent after human approval."],
    ["approval", "Human approved the workflow and a $40 production ceiling."],
    ["generation", "Soul 2 concepts, Marketing Studio keyframes, and Kling films recorded."],
    ["repair", "Reflection failure on the 16:9 cut. Seedance 2.5 video edit ran inside the repair cap."],
    ["cost_change", "Repair added $0.8856. Failed concept was not billed."],
    ["escalation", "Warmer reveal is an included revision and is waiting for a person to apply it."],
  ] as const;
  for (const [index, audit] of audits.entries()) {
    insertAudit({
      id: `audit_rain_${index}`,
      jobId: rainJob.id,
      kind: audit[0],
      summary: audit[1],
      payload: {},
      createdAt: stamp(80_000_000 - index * 8_000_000),
    });
  }

  const orchard = orchardAnalysis();
  const orchardRoute = routeFromAnalysis(orchard, "Night Orchard: Slow Orbit");
  const orchardJob: JobRecord = {
    id: "job_orchard",
    title: "Night Orchard: Slow Orbit",
    source: "Sales call (pasted)",
    rawBrief: ORCHARD_BRIEF,
    clientPriceMicros: 900_000_000,
    deadlineAt: hoursFromNow(48),
    status: "needs_review",
    clientId: orchardClient.id,
    clientNotes: "Different problem from the monument film: one orbit, one still, low light.",
    templateId: null,
    sourceFeeBps: 0,
    contingencyBps: 2000,
    targetMarginBps: 5500,
    maxProductionMicros: 15_000_000,
    recordingGate: null,
    createdAt: stamp(20_000_000),
    updatedAt: stamp(2_000_000),
  };
  insertJob(orchardJob);
  insertAnalysis({
    id: "analysis_orchard",
    jobId: orchardJob.id,
    kind: "model",
    analysis: orchard,
    decision: decideJob({
      analysis: orchard,
      steps: orchardRoute,
      clientPriceMicros: orchardJob.clientPriceMicros,
      sourceFeeBps: 0,
      contingencyBps: 2000,
      targetMarginBps: 5500,
      maxProductionMicros: 15_000_000,
      deadlineAt: orchardJob.deadlineAt,
    }),
    createdAt: stamp(19_000_000),
  });
  saveWorkflow({
    id: "wf_orchard",
    jobId: orchardJob.id,
    status: "draft",
    steps: orchardRoute,
    approvedMaxMicros: null,
    createdAt: stamp(19_000_000),
    updatedAt: stamp(19_000_000),
  });
  insertAudit({
    id: "audit_orchard",
    jobId: orchardJob.id,
    kind: "model_decision",
    summary: "Route uses PixVerse for studies, Qwen for the still, and Seedance 2.5 for the orbit. Not the Kling monument route.",
    payload: {},
    createdAt: stamp(19_000_000),
  });

  const rejectAnalysis = mockAnalyze("Celebrity voice clone", REJECT_BRIEF);
  const rejectRoute = routeFromAnalysis(rejectAnalysis, REJECT_BRIEF);
  const rejectJob: JobRecord = {
    id: "job_reject",
    title: "Rejected fixture — celebrity voice clone",
    source: "Direct form (pasted)",
    rawBrief: REJECT_BRIEF,
    clientPriceMicros: 500_000_000,
    deadlineAt: hoursFromNow(20),
    status: "rejected",
    clientId: "client_reject",
    clientNotes: "Policy fixture. Deceptive impersonation is rejected.",
    templateId: null,
    sourceFeeBps: 1000,
    contingencyBps: 2000,
    targetMarginBps: 5500,
    maxProductionMicros: 40_000_000,
    recordingGate: null,
    createdAt: stamp(10_000_000),
    updatedAt: stamp(9_000_000),
  };
  insertJob(rejectJob);
  insertAnalysis({
    id: "analysis_reject",
    jobId: rejectJob.id,
    kind: "model",
    analysis: rejectAnalysis,
    decision: decideJob({
      analysis: rejectAnalysis,
      steps: rejectRoute,
      clientPriceMicros: rejectJob.clientPriceMicros,
      sourceFeeBps: 1000,
      contingencyBps: 2000,
      targetMarginBps: 5500,
      maxProductionMicros: 40_000_000,
      deadlineAt: rejectJob.deadlineAt,
    }),
    createdAt: stamp(9_000_000),
  });

  insertJob({
    id: "job_new",
    title: "Email — seasonal stills inquiry",
    source: "Email",
    rawBrief: NEW_BRIEF,
    clientPriceMicros: 0,
    deadlineAt: hoursFromNow(24 * 21),
    status: "new",
    clientId: priya.id,
    clientNotes: "Waiting on product photos. Not analyzed.",
    templateId: null,
    sourceFeeBps: 0,
    contingencyBps: 2000,
    targetMarginBps: 5500,
    maxProductionMicros: 10_000_000,
    recordingGate: null,
    createdAt: stamp(1_000_000),
    updatedAt: stamp(1_000_000),
  });

  void getTemplate("launch-video");
  setMeta("seed", "1");
}
