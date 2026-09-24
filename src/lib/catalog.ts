import type { ProductionRole } from "./types";

/**
 * Rates are representative family list rates published by Higgsfield on
 * 2026-09-16 in "How To Generate AI Videos Straight From the Higgsfield API".
 * They are not configuration-specific quotes. In live mode, POST /estimate/{endpoint}
 * is authoritative and replaces these numbers before a paid submit.
 * Models with no published rate stay null. The decision engine will not guess.
 */
export const PRICE_SOURCE =
  "Higgsfield, “How To Generate AI Videos Straight From the Higgsfield API” (2026-09-16), representative family list rate. Live POST /estimate/{endpoint} overrides this number.";

export const UNPRICED =
  "No representative rate was published for this model in the 2026-09-16 rate table. The app does not invent one. Live mode must call POST /estimate/{endpoint}.";

export type CatalogModel = {
  id: string;
  family: string;
  name: string;
  media: "image" | "video";
  roles: ProductionRole[];
  unit: "image" | "second" | "generation";
  usdMicros: number | null;
  priceNote: string;
  strengths: string;
  failureMode: string;
  docsUrl: string;
  /** Documented request fields for a minimal valid body. Media URLs are filled at submit time. */
  defaultInput: Record<string, unknown>;
};

const docs = (path: string) => `https://docs.higgsfield.ai/docs/models/${path}`;

export const CATALOG: CatalogModel[] = [
  {
    id: "higgsfield-ai/soul/v2/standard",
    family: "soul",
    name: "Soul 2",
    media: "image",
    roles: ["search", "control"],
    unit: "image",
    usdMicros: 3_200,
    priceNote: PRICE_SOURCE,
    strengths: "Editorial stills and inexpensive concept batches. batch_size is 1 or 4.",
    failureMode: "Can drift from a supplied silhouette or exact material if the prompt is loose.",
    docsUrl: docs("soul-2/generate"),
    defaultInput: {
      prompt: "",
      resolution: "720p",
      aspect_ratio: "16:9",
      enhance_prompt: false,
      batch_size: 1,
    },
  },
  {
    id: "higgsfield-ai/soul/cinema",
    family: "soul",
    name: "Soul Cinema",
    media: "image",
    roles: ["ship", "finish"],
    unit: "image",
    usdMicros: 3_200,
    priceNote: PRICE_SOURCE,
    strengths: "Graded cinematic stills. Cinema uses a fixed style; client style_id is ignored.",
    failureMode: "Text-to-image only, so it will not preserve an uploaded frame pixel for pixel.",
    docsUrl: docs("soul-cinema/generate"),
    defaultInput: {
      prompt: "",
      resolution: "720p",
      aspect_ratio: "16:9",
      enhance_prompt: false,
      batch_size: 1,
    },
  },
  {
    id: "marketing-studio/image",
    family: "marketing-studio",
    name: "Marketing Studio Image",
    media: "image",
    roles: ["control", "search"],
    unit: "image",
    usdMicros: 5_900,
    priceNote: PRICE_SOURCE,
    strengths: "Product and reference stills. Omit image_urls for text-to-image; up to 16 URLs when enhance_prompt is false.",
    failureMode: "enhance_prompt true requires a preset_id and 1–2 images. Unenhanced auto aspect maps to square in current production notes.",
    docsUrl: docs("marketing-studio-image/generate-and-edit"),
    defaultInput: {
      prompt: "",
      resolution: "2k",
      aspect_ratio: "16:9",
      quality: "high",
      enhance_prompt: false,
    },
  },
  {
    id: "alibaba/qwen-image-3/edit",
    family: "qwen",
    name: "Qwen Image 3 Edit",
    media: "image",
    roles: ["control", "finish"],
    unit: "image",
    usdMicros: 30_000,
    priceNote: PRICE_SOURCE,
    strengths: "Targeted still edits. Requires 1–3 image URLs. Fits palette, label, and packaging corrections.",
    failureMode: "Thinking mode defaults on and expects prompt_extend. Exact small type can still miss.",
    docsUrl: docs("qwen-image-3/edit"),
    defaultInput: {
      prompt: "",
      image_urls: [],
      resolution: "1k",
      aspect_ratio: "16:9",
    },
  },
  {
    id: "alibaba/qwen-image-3/text-to-image",
    family: "qwen",
    name: "Qwen Image 3",
    media: "image",
    roles: ["control", "search"],
    unit: "image",
    usdMicros: 30_000,
    priceNote: PRICE_SOURCE,
    strengths: "Text-to-image when an edit reference is not available yet.",
    failureMode: "Weaker identity lock than the edit endpoint.",
    docsUrl: docs("qwen-image-3/text-to-image"),
    defaultInput: { prompt: "", resolution: "1k", aspect_ratio: "16:9" },
  },
  {
    id: "ideogram/v4.0",
    family: "ideogram",
    name: "Ideogram 4.0",
    media: "image",
    roles: ["control", "finish"],
    unit: "image",
    usdMicros: 60_000,
    priceNote: PRICE_SOURCE,
    strengths: "Typography, posters, and designed promotional frames.",
    failureMode: "Long legal lines and tiny label copy still need a human read.",
    docsUrl: docs("ideogram-4/generate"),
    defaultInput: { prompt: "", aspect_ratio: "16:9" },
  },
  {
    id: "recraft/v4.1/text-to-image",
    family: "recraft",
    name: "Recraft 4.1",
    media: "image",
    roles: ["control", "finish"],
    unit: "image",
    usdMicros: 35_000,
    priceNote: PRICE_SOURCE,
    strengths: "Designed graphics and alternative poster route.",
    failureMode: "No reference-image input is declared on the text-to-image schema.",
    docsUrl: docs("recraft-v4-1/text-to-image"),
    defaultInput: { prompt: "", aspect_ratio: "16:9" },
  },
  {
    id: "pixverse/v6/text-to-video",
    family: "pixverse",
    name: "PixVerse V6 Text to Video",
    media: "video",
    roles: ["search"],
    unit: "second",
    usdMicros: 115_000,
    priceNote: PRICE_SOURCE,
    strengths: "Fast concept motion. Duration 1–15 seconds. Resolutions include 360p through 1080p.",
    failureMode: "World and identity drift. Not the continuity lock for a supplied keyframe.",
    docsUrl: docs("pixverse-v6/text-to-video"),
    defaultInput: { prompt: "", duration: 5, resolution: "720p", aspect_ratio: "16:9" },
  },
  {
    id: "pixverse/v6/image-to-video",
    family: "pixverse",
    name: "PixVerse V6 Image to Video",
    media: "video",
    roles: ["search", "control"],
    unit: "second",
    usdMicros: 115_000,
    priceNote: PRICE_SOURCE,
    strengths: "Image-conditioned concept tests when a first frame exists.",
    failureMode: "Weaker cinematic camera control than Kling or Seedance.",
    docsUrl: docs("pixverse-v6/image-to-video"),
    defaultInput: { prompt: "", image_url: "", duration: 5, resolution: "720p" },
  },
  {
    id: "lightricks/ltx-2.5/text-to-video/fast",
    family: "ltx",
    name: "LTX 2.5 Fast Text to Video",
    media: "video",
    roles: ["search"],
    unit: "second",
    usdMicros: null,
    priceNote: UNPRICED + " The published LTX rate is for LTX 2.5 Pro ($0.17/sec), not Fast.",
    strengths: "Documented fast lane. Duration enum is 6, 8, or 10. Aspect 16:9 or 9:16.",
    failureMode: "Price is unpublished, so the router will not select it for an approved budget.",
    docsUrl: docs("ltx-2-5/text-to-video-fast"),
    defaultInput: { prompt: "", duration: 6, resolution: "720p", aspect_ratio: "16:9", generate_audio: false },
  },
  {
    id: "lightricks/ltx-2.5/text-to-video/pro",
    family: "ltx",
    name: "LTX 2.5 Pro Text to Video",
    media: "video",
    roles: ["ship"],
    unit: "second",
    usdMicros: 170_000,
    priceNote: PRICE_SOURCE,
    strengths: "Higher LTX tier with a published representative rate.",
    failureMode: "Text-to-video will not lock a supplied monument or orchard frame.",
    docsUrl: docs("ltx-2-5/text-to-video-pro"),
    defaultInput: { prompt: "", duration: 6, resolution: "720p", aspect_ratio: "16:9" },
  },
  {
    id: "kling-video/v3.0/pro/image-to-video",
    family: "kling",
    name: "Kling 3.0 Pro Image to Video",
    media: "video",
    roles: ["ship"],
    unit: "second",
    usdMicros: 112_000,
    priceNote: PRICE_SOURCE + " Applied as the published Kling 3.0 family rate. Pro vs Standard is not split in that table.",
    strengths: "Premium final motion from a first frame, optional last frame, native audio, multi-shot.",
    failureMode: "Reflections, water, and rigid architecture can drift between shots. The schema does not expose a resolution field.",
    docsUrl: docs("kling-3/pro-image-to-video"),
    defaultInput: { prompt: "", image_url: "", duration: 5, aspect_ratio: "16:9", sound: "on" },
  },
  {
    id: "kling-video/v3.0/std/text-to-video",
    family: "kling",
    name: "Kling 3.0 Standard Text to Video",
    media: "video",
    roles: ["ship", "search"],
    unit: "second",
    usdMicros: 112_000,
    priceNote: PRICE_SOURCE + " Family rate, not a Standard-only quote.",
    strengths: "Cinematic text-to-video when no locked frame exists yet. Duration 3–15.",
    failureMode: "No image lock. Same reflection and geometry risks as Pro.",
    docsUrl: docs("kling-3/standard-text-to-video"),
    defaultInput: { prompt: "", duration: 5, aspect_ratio: "16:9", sound: "off" },
  },
  {
    id: "bytedance/seedance-2.5/image-to-video",
    family: "seedance",
    name: "Seedance 2.5 Image to Video",
    media: "video",
    roles: ["ship", "control"],
    unit: "second",
    usdMicros: 73_800,
    priceNote: PRICE_SOURCE,
    strengths: "Reference-preserving motion from image_url. Duration 4–30. Resolution 480p or 720p only.",
    failureMode: "Cannot fulfill a 1080p or 4k delivery on this endpoint. Low-light detail can crush at 720p.",
    docsUrl: docs("seedance-2-5/image-to-video"),
    defaultInput: {
      prompt: "",
      image_url: "",
      duration: 8,
      resolution: "720p",
      bitrate_mode: "high",
      generate_audio: true,
    },
  },
  {
    id: "bytedance/seedance-2.5/video-edit",
    family: "seedance",
    name: "Seedance 2.5 Video Edit",
    media: "video",
    roles: ["finish", "control"],
    unit: "second",
    usdMicros: 73_800,
    priceNote: PRICE_SOURCE + " The table does not split edit from generate. Duration is derived from the source video; do not send duration.",
    strengths: "Targeted repair of an existing shot. Output framing follows the source.",
    failureMode: "Can shift grade or camera feel while fixing the failed component.",
    docsUrl: docs("seedance-2-5/video-edit"),
    defaultInput: { prompt: "", video_url: "" },
  },
  {
    id: "bytedance/seedance-2.0/image-to-video",
    family: "seedance",
    name: "Seedance 2.0 Image to Video",
    media: "video",
    roles: ["ship"],
    unit: "second",
    usdMicros: null,
    priceNote: UNPRICED + " Supports 1080p and 4k, unlike Seedance 2.5 image-to-video, but the 2.5 rate must not be copied onto 2.0.",
    strengths: "Higher resolution image-to-video when the client spec exceeds 720p.",
    failureMode: "Unpriced in the catalog, so approval waits for a live estimate.",
    docsUrl: docs("seedance-2/image-to-video"),
    defaultInput: { prompt: "", image_url: "", duration: 5, resolution: "1080p", generate_audio: false },
  },
  {
    id: "minimax/h3/text-to-video",
    family: "minimax",
    name: "MiniMax H3 Text to Video",
    media: "video",
    roles: ["ship"],
    unit: "second",
    usdMicros: 130_000,
    priceNote: PRICE_SOURCE,
    strengths: "Native-audio scenes. Resolution enum on this endpoint is 2K. Duration 5–15.",
    failureMode: "Not a likeness or lip-sync tool. No voice-consent bypass.",
    docsUrl: docs("minimax-h3/text-to-video"),
    defaultInput: { prompt: "", duration: 5, resolution: "2K", aspect_ratio: "16:9", aigc_watermark: false },
  },
  {
    id: "alibaba/wan-3.0/text-to-video",
    family: "wan",
    name: "Wan 3.0 Text to Video",
    media: "video",
    roles: ["ship", "search"],
    unit: "second",
    usdMicros: 200_000,
    priceNote: PRICE_SOURCE,
    strengths: "Alternate audio-video lane with a published Wan 3.0 rate.",
    failureMode: "Higher representative rate than PixVerse or Seedance 2.5. Not an identity lock.",
    docsUrl: docs("wan-3/text-to-video"),
    defaultInput: { prompt: "", duration: 5, resolution: "720p", aspect_ratio: "16:9" },
  },
  {
    id: "kling-video/o3/video-edit",
    family: "kling",
    name: "Kling O3 Video Edit",
    media: "video",
    roles: ["finish"],
    unit: "second",
    usdMicros: null,
    priceNote: UNPRICED,
    strengths: "Documented video edit alternative. Requires prompt and video_urls.",
    failureMode: "No published rate, so it cannot be auto-selected inside a spend cap.",
    docsUrl: docs("kling-o3/video-edit"),
    defaultInput: { prompt: "", video_urls: [], mode: "std" },
  },
];

const byId = new Map(CATALOG.map((model) => [model.id, model]));

export function getModel(id: string): CatalogModel | undefined {
  return byId.get(id);
}

export function listModels(): CatalogModel[] {
  return CATALOG;
}

export const DOCUMENTED_GAPS = [
  "The docs sitemap checked on 2026-09-24 has no Topaz, Flux, Seedream, lip-sync, or standalone voice endpoint. Those names are not offered as routes.",
  "Seedance 2.5 image-to-video documents 480p and 720p only. A 1080p lock on that family requires Seedance 2.0, which has no published rate here.",
  "Kling 3.0 image-to-video does not expose a resolution field in the current request schema.",
  "Failed, NSFW, and canceled Higgsfield requests are not billed. The internal ledger follows that rule.",
  "Some overview examples use platform.higgsfield.ai. Model pages and the OpenAPI server use https://api.higgsfield.ai, which this app calls.",
];
