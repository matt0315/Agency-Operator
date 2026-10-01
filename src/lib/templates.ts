export type ServiceTemplate = {
  id: string;
  name: string;
  summary: string;
  requiredInputs: string[];
  acceptedFileTypes: string[];
  modelRecipe: string[];
  qualityChecklist: string[];
  includedRevisions: number;
  deliveryPackage: string[];
  timeline: string;
  targetGrossMarginBps: number;
  maxProductionMicros: number;
  priceMicros: number;
  escalation: string[];
};

export const TEMPLATES: ServiceTemplate[] = [
  {
    id: "launch-video",
    name: "Launch Video",
    summary: "One 15-second video, two aspect ratios, three stills, two revision rounds, 72-hour delivery.",
    requiredInputs: [
      "Product or subject reference",
      "Brand colors and type notes",
      "Offer and exact lines, if any",
      "Examples the client likes and dislikes",
      "Destination for 16:9 and 9:16",
    ],
    acceptedFileTypes: ["png", "jpg", "webp", "pdf"],
    modelRecipe: [
      "Search: Soul 2 concept stills",
      "Control: Marketing Studio Image keyframes",
      "Ship: Kling 3.0 Pro image-to-video for both aspect ratios",
      "Finish: Soul Cinema still grade, Seedance 2.5 video edit only for a capped repair",
    ],
    qualityChecklist: [
      "Both aspect ratios present",
      "Three stills match the film",
      "No unapproved people, logos, or claims",
      "Duration within the agreed cut",
    ],
    includedRevisions: 2,
    deliveryPackage: ["16:9 master", "9:16 master", "Three stills", "Usage note", "Client message"],
    timeline: "72 hours",
    targetGrossMarginBps: 6000,
    maxProductionMicros: 40_000_000,
    priceMicros: 2_800_000_000,
    escalation: [
      "Likeness or voice",
      "Exact packaging or regulated claims",
      "Spend above the production cap",
      "A third revision or a new deliverable",
    ],
  },
  {
    id: "ugc-ad-pack",
    name: "UGC Ad Pack",
    summary: "Three hooks, one body, three final variations, caption cards, one revision round.",
    requiredInputs: ["Product photo", "Offer", "Three hook lines", "Words the brand will not say", "Caption text"],
    acceptedFileTypes: ["png", "jpg", "webp", "txt"],
    modelRecipe: [
      "Search: PixVerse V6 short hook studies",
      "Control: Marketing Studio Image product frames",
      "Ship: Seedance 2.5 image-to-video for the body and variations at 720p",
      "Finish: Ideogram 4.0 caption cards. Burned-in video captions are not a documented endpoint.",
    ],
    qualityChecklist: ["Three hooks", "One body", "Three variations", "Caption text spelled as supplied", "No fake testimonial"],
    includedRevisions: 1,
    deliveryPackage: ["Hook cuts", "Body", "Three variations", "Caption cards", "Shot list"],
    timeline: "5 days",
    targetGrossMarginBps: 5500,
    maxProductionMicros: 25_000_000,
    priceMicros: 1_600_000_000,
    escalation: ["A real person's likeness or voice", "Medical or financial claims", "Extra hooks beyond the pack"],
  },
  {
    id: "localization-pack",
    name: "Localization Pack",
    summary: "One approved source ad adapted into five languages with translated graphics, voice, captions, and lip sync.",
    requiredInputs: [
      "Approved source ad",
      "Five language list",
      "Translated copy from a human, or a note that translation is still open",
      "Pronunciation guide",
      "Voice and likeness consent for every speaker",
    ],
    acceptedFileTypes: ["mp4", "mov", "png", "srt", "txt"],
    modelRecipe: [
      "Control: Qwen Image 3 Edit for translated graphic locks",
      "Finish: Ideogram 4.0 for designed title cards",
      "Voice, lip sync, and a talking-head pass are not in the current documented catalog. Those steps always escalate.",
      "MiniMax H3 is visible as a native-audio lane and is not a consent bypass.",
    ],
    qualityChecklist: [
      "Five language variants",
      "Translated lines match the supplied copy",
      "No new likeness",
      "Source edit stays inside the approved frame",
    ],
    includedRevisions: 1,
    deliveryPackage: ["Five graphic sets", "Caption files", "Escalation note for voice and lip sync", "Usage note"],
    timeline: "7 days after copy approval",
    targetGrossMarginBps: 5000,
    maxProductionMicros: 30_000_000,
    priceMicros: 3_200_000_000,
    escalation: [
      "Missing voice or likeness consent",
      "Lip sync or voice generation, because no such endpoint is documented",
      "Untranslated regulated claims",
      "A sixth language",
    ],
  },
];

export function getTemplate(id: string | null | undefined): ServiceTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
