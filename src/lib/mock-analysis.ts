import type { BriefAnalysis } from "./types";

function base(partial: Partial<BriefAnalysis> & Pick<BriefAnalysis, "jobType" | "conciseSummary">): BriefAnalysis {
  return {
    deliverables: [],
    suppliedAssets: [],
    missingAssets: [],
    questionsForClient: [],
    brandConstraints: [],
    rightsAndConsentFlags: [],
    technicalRisks: [],
    revisionRisk: "medium",
    confidence: 70,
    decision: "human_review",
    decisionReasons: ["Advisory only. The application decides from catalog prices."],
    proposedWorkflow: [
      { id: "explore", capability: "Concept exploration", role: "search", purpose: "Find a direction before spending on a final." },
      { id: "control", capability: "Reference control", role: "control", purpose: "Lock the subject." },
      { id: "final-motion", capability: "Final motion", role: "ship", purpose: "Deliver the approved asset." },
      { id: "finish", capability: "Finish", role: "finish", purpose: "Make the approved asset deliverable." },
    ],
    estimatedAttemptsByStep: [
      { stepId: "explore", attempts: 1 },
      { stepId: "control", attempts: 2 },
      { stepId: "final-motion", attempts: 2 },
      { stepId: "finish", attempts: 1 },
    ],
    assumptions: [],
    cannotDeliverReliably: false,
    deceptiveImpersonation: false,
    ...partial,
  };
}

export function rainAnalysis(): BriefAnalysis {
  return base({
    jobType: "Cinematic concept film",
    conciseSummary:
      "After the Rain: a 12-second cinematic film of a civic glass monument, delivered in 16:9 and 9:16, plus three keyframes. No people, no type, no licensed music.",
    deliverables: [
      { name: "Cinematic film", format: "video", aspectRatio: "16:9", durationSeconds: 12, resolution: "1080p", exactText: "" },
      { name: "Vertical film", format: "video", aspectRatio: "9:16", durationSeconds: 12, resolution: "1080p", exactText: "" },
      { name: "Keyframe stills", format: "image", aspectRatio: "16:9", durationSeconds: null, resolution: "2k", exactText: "" },
    ],
    suppliedAssets: [
      "Approved monument silhouette",
      "Glass material references",
      "Site direction for the river terrace",
      "Weather arc",
      "Liked and disliked visual references",
    ],
    missingAssets: ["Confirmed glass sample: ribbed cast or smoked sheet"],
    questionsForClient: [
      "Which glass reference is approved for the monument skin — the ribbed cast sample or the smoked sheet?",
    ],
    brandConstraints: [
      "Architecture, material, scale, and site stay consistent across shots.",
      "Water, reflections, and the post-storm transition stay physically believable.",
      "No people, no logos, no readable signage, no licensed music.",
    ],
    rightsAndConsentFlags: [],
    technicalRisks: [
      "Kling 3.0 image-to-video does not expose a resolution field, so 1080p is a client ask rather than a request parameter.",
      "Reflections on glass are the likely continuity failure.",
    ],
    revisionRisk: "medium",
    confidence: 78,
    decision: "human_review",
    decisionReasons: ["The glass sample is still unconfirmed, so a person should approve the assumption before motion spend."],
    proposedWorkflow: [
      { id: "concepts", capability: "Inexpensive cinematic still exploration", role: "search", purpose: "Eight weather-and-monument concepts." },
      { id: "keyframes", capability: "Controlled keyframes", role: "control", purpose: "Three locked frames." },
      { id: "film-169", capability: "Premium final motion", role: "ship", purpose: "12-second 16:9 film." },
      { id: "film-916", capability: "Premium final motion", role: "ship", purpose: "12-second 9:16 film." },
      { id: "repair", capability: "Targeted continuity repair", role: "finish", purpose: "One reflection repair if needed." },
      { id: "grade-stills", capability: "Finish stills", role: "finish", purpose: "Grade the three keyframes." },
    ],
    estimatedAttemptsByStep: [
      { stepId: "concepts", attempts: 1 },
      { stepId: "keyframes", attempts: 1 },
      { stepId: "film-169", attempts: 2 },
      { stepId: "film-916", attempts: 2 },
      { stepId: "repair", attempts: 1 },
      { stepId: "grade-stills", attempts: 1 },
    ],
    assumptions: ["Native generated ambience is acceptable. Original score is out of scope."],
  });
}

export function orchardAnalysis(): BriefAnalysis {
  return base({
    jobType: "Atmospheric camera study",
    conciseSummary:
      "Night Orchard: Slow Orbit. One 8-second 16:9 orbit from an approved keyframe, plus one hero still. The priced Seedance 2.5 route caps resolution at 720p.",
    deliverables: [
      { name: "Orbit sequence", format: "video", aspectRatio: "16:9", durationSeconds: 8, resolution: "720p", exactText: "" },
      { name: "Hero still", format: "image", aspectRatio: "16:9", durationSeconds: null, resolution: "1k", exactText: "" },
    ],
    suppliedAssets: [
      "Approved orchard-world keyframe",
      "Low-light palette",
      "Camera direction",
      "Pacing reference",
      "Delivery format note",
    ],
    missingAssets: [],
    questionsForClient: [],
    brandConstraints: [
      "Preserve the world, depth, low-light detail, and spatial continuity through the orbit.",
      "No people, no text, no logos.",
    ],
    rightsAndConsentFlags: [],
    technicalRisks: [
      "Seedance 2.5 image-to-video documents 720p as its maximum. 1080p would move to unpriced Seedance 2.0.",
    ],
    revisionRisk: "low",
    confidence: 84,
    decision: "accept",
    decisionReasons: ["Deliverable, references, and deadline are clear. Resolution was qualified to a priced endpoint."],
    proposedWorkflow: [
      { id: "orbit-studies", capability: "Fast orbit studies", role: "search", purpose: "Pacing tests that do not touch the world." },
      { id: "palette-lock", capability: "Low-light edit of the keyframe", role: "control", purpose: "Hold the orchard and shift palette." },
      { id: "orbit", capability: "Smooth final orbit", role: "ship", purpose: "8-second move from the locked still." },
      { id: "orbit-repair", capability: "Continuity repair", role: "finish", purpose: "Only if the orbit breaks." },
    ],
    estimatedAttemptsByStep: [
      { stepId: "orbit-studies", attempts: 2 },
      { stepId: "palette-lock", attempts: 2 },
      { stepId: "orbit", attempts: 2 },
      { stepId: "orbit-repair", attempts: 1 },
    ],
    assumptions: ["720p is the accepted master because that is the documented maximum on the priced image-to-video route."],
  });
}

export function mockAnalyze(title: string, brief: string): BriefAnalysis {
  const blob = `${title}\n${brief}`.toLowerCase();
  if (blob.includes("after the rain") || blob.includes("glass monument")) return rainAnalysis();
  if (blob.includes("night orchard") || blob.includes("slow orbit")) return orchardAnalysis();

  const impersonation = /impersonat|deepfake|celebrity|pretend to be|clone (his|her|their) voice|fake testimonial/.test(blob);
  const flags: BriefAnalysis["rightsAndConsentFlags"] = [];
  if (impersonation) flags.push({ kind: "impersonation", detail: "The brief asks for a fake identity, voice, or endorsement." });
  if (/likeness|real person|my face|spokesperson/.test(blob)) flags.push({ kind: "likeness", detail: "A real person's likeness appears to be in scope." });
  if (/voiceover of me|clone .{0,20}voice|my voice/.test(blob)) flags.push({ kind: "voice", detail: "A real person's voice appears to be in scope." });
  if (/logo/.test(blob)) flags.push({ kind: "logo", detail: "The brief mentions a logo." });
  if (/packaging|label text|exact text/.test(blob)) flags.push({ kind: "packaging_text", detail: "Exact packaging or label text is in scope." });
  if (/clinically|guaranteed|cure|financial advice|will double/.test(blob)) flags.push({ kind: "factual_claim", detail: "The brief includes a factual advertising claim." });
  if (/licensed music|popular song|soundtrack by/.test(blob)) flags.push({ kind: "licensed_music", detail: "Licensed music is requested." });
  if (/not sure (who owns|if we can)|unclear rights|found online/.test(blob)) {
    flags.push({ kind: "unclear_rights", detail: "Ownership of a supplied asset is unclear." });
  }

  const aspects = Array.from(blob.matchAll(/\b(9:16|16:9|1:1|4:5|4:3)\b/g)).map((m) => m[1] ?? "16:9");
  const durations = Array.from(blob.matchAll(/(\d+)\s*-?\s*seconds?/g)).map((m) => Number(m[1]));
  const deliverables: BriefAnalysis["deliverables"] = [];
  if (/video|film|spot|ugc|reel/.test(blob)) {
    deliverables.push({
      name: "Video",
      format: "video",
      aspectRatio: aspects[0] ?? "16:9",
      durationSeconds: durations[0] ?? 15,
      resolution: /1080/.test(blob) ? "1080p" : "720p",
      exactText: "",
    });
  }
  if (/still|keyframe|image|poster/.test(blob) || deliverables.length === 0) {
    deliverables.push({
      name: /poster/.test(blob) ? "Poster" : "Still",
      format: "image",
      aspectRatio: aspects[0] ?? "1:1",
      durationSeconds: null,
      resolution: "1k",
      exactText: "",
    });
  }

  const missing: string[] = [];
  if (/logo/.test(blob) && !/logo (is attached|attached|supplied)/.test(blob)) missing.push("Logo file");
  if (deliverables.length === 0) missing.push("A description of the finished file");

  return base({
    jobType: /video|film/.test(blob) ? "Motion" : "Still",
    conciseSummary: title.trim() || brief.trim().slice(0, 180) || "Untitled brief",
    deliverables: impersonation ? deliverables : deliverables,
    suppliedAssets: [],
    missingAssets: impersonation ? [] : missing,
    questionsForClient: missing.map((item) => `Please send the ${item.toLowerCase()} before production.`),
    brandConstraints: [],
    rightsAndConsentFlags: flags,
    technicalRisks: [],
    revisionRisk: flags.length ? "high" : "medium",
    confidence: impersonation ? 90 : 62,
    decision: impersonation ? "reject" : "human_review",
    decisionReasons: ["Mock analysis. The deterministic calculator makes the final call."],
    cannotDeliverReliably: deliverables.length === 0,
    deceptiveImpersonation: impersonation,
  });
}
