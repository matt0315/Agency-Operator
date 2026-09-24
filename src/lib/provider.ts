import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getModel } from "./catalog";
import { redact } from "./mode";
import type { NormalizedAsset, ProviderStatus } from "./types";

export type EstimateResult = {
  usdMicros: number | null;
  credits: string | null;
};

export type SubmitResult = {
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
  status: ProviderStatus;
};

export type StatusResult = {
  providerStatus: ProviderStatus;
  error: string | null;
  assets: NormalizedAsset[];
  actualUsdMicros: number | null;
};

const TERMINAL = new Set<ProviderStatus>(["completed", "failed", "nsfw", "canceled"]);

export function isTerminal(status: ProviderStatus): boolean {
  return TERMINAL.has(status);
}

function baseUrl(): string {
  return (process.env.HF_API_BASE || "https://api.higgsfield.ai").replace(/\/$/, "");
}

function authHeader(): string {
  const id = process.env.HF_API_KEY_ID;
  const secret = process.env.HF_API_KEY_SECRET;
  if (!id || !secret) throw new Error("Higgsfield credentials are not configured.");
  return `Key ${id}:${secret}`;
}

async function readError(response: Response): Promise<string> {
  let detail = `Higgsfield returned HTTP ${response.status}.`;
  try {
    const body = (await response.json()) as { detail?: string };
    if (body.detail) detail = `Higgsfield returned HTTP ${response.status}.`;
  } catch {
    /* ignore body */
  }
  return redact(detail);
}

export async function estimateRequest(endpoint: string, input: Record<string, unknown>): Promise<EstimateResult> {
  const response = await fetch(`${baseUrl()}/estimate/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { usd?: string; credits?: string };
  const usd = body.usd != null ? Number(body.usd) : null;
  return {
    usdMicros: usd != null && Number.isFinite(usd) ? Math.round(usd * 1_000_000) : null,
    credits: body.credits ?? null,
  };
}

export async function submitRequest(endpoint: string, input: Record<string, unknown>): Promise<SubmitResult> {
  const response = await fetch(`${baseUrl()}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as {
    status?: ProviderStatus;
    request_id?: string;
    status_url?: string;
    cancel_url?: string;
  };
  if (!body.request_id || !body.status_url || !body.cancel_url || !body.status) {
    throw new Error("Higgsfield accepted the request but omitted the request handle.");
  }
  return {
    requestId: body.request_id,
    statusUrl: body.status_url,
    cancelUrl: body.cancel_url,
    status: body.status,
  };
}

export async function fetchStatus(statusUrl: string): Promise<StatusResult> {
  const response = await fetch(statusUrl, { headers: { Authorization: authHeader() } });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as {
    status?: ProviderStatus;
    error?: string | null;
    images?: { url?: string; content_type?: string }[];
    video?: { url?: string; content_type?: string };
    audio?: { url?: string; content_type?: string };
    audios?: { url?: string; content_type?: string }[];
    usd?: string;
  };
  if (!body.status) throw new Error("Higgsfield status response did not include a status.");
  const assets: NormalizedAsset[] = [];
  for (const image of body.images ?? []) {
    if (image.url) assets.push(asset("image", image.url, image.content_type ?? "image/jpeg"));
  }
  if (body.video?.url) assets.push(asset("video", body.video.url, body.video.content_type ?? "video/mp4"));
  if (body.audio?.url) assets.push(asset("audio", body.audio.url, body.audio.content_type ?? "audio/mpeg"));
  for (const audio of body.audios ?? []) {
    if (audio.url) assets.push(asset("audio", audio.url, audio.content_type ?? "audio/mpeg"));
  }
  const usd = body.usd != null ? Number(body.usd) : null;
  return {
    providerStatus: body.status,
    error: body.error ?? null,
    assets,
    actualUsdMicros: usd != null && Number.isFinite(usd) ? Math.round(usd * 1_000_000) : null,
  };
}

export async function cancelRequest(cancelUrl: string): Promise<{ ok: boolean; reason: string }> {
  const response = await fetch(cancelUrl, { method: "POST", headers: { Authorization: authHeader() } });
  if (response.status === 202) return { ok: true, reason: "Cancellation accepted while the request was queued." };
  if (response.status === 400) return { ok: false, reason: "The provider refused cancellation because processing already started." };
  return { ok: false, reason: `Cancellation returned HTTP ${response.status}.` };
}

function asset(kind: NormalizedAsset["kind"], url: string, contentType: string): NormalizedAsset {
  const ext = kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "jpg";
  return { kind, sourceUrl: url, contentType, localPath: null, fileName: `output.${ext}` };
}

export async function persistAssets(jobId: string, generationId: string, assets: NormalizedAsset[]): Promise<NormalizedAsset[]> {
  const root = process.env.ASSET_DIR || path.join(process.cwd(), "data", "assets");
  const dir = path.join(root, jobId);
  mkdirSync(dir, { recursive: true });
  const saved: NormalizedAsset[] = [];
  for (let i = 0; i < assets.length; i += 1) {
    const item = assets[i];
    if (!item) continue;
    if (item.sourceUrl.startsWith("/")) {
      const fileName = `${generationId}-${i}${path.extname(item.sourceUrl) || ".svg"}`;
      const localPath = path.join(dir, fileName);
      const source = path.join(process.cwd(), "public", item.sourceUrl);
      try {
        const { readFileSync } = await import("node:fs");
        writeFileSync(localPath, readFileSync(source));
      } catch {
        writeFileSync(localPath, item.sourceUrl);
      }
      saved.push({ ...item, localPath, fileName });
      continue;
    }
    const response = await fetch(item.sourceUrl);
    if (!response.ok) {
      saved.push(item);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const ext = item.kind === "video" ? "mp4" : item.kind === "audio" ? "mp3" : "jpg";
    const fileName = `${generationId}-${i}.${ext}`;
    const localPath = path.join(dir, fileName);
    writeFileSync(localPath, bytes);
    saved.push({ ...item, localPath, fileName });
  }
  return saved;
}

export function mockEstimate(modelId: string, quantity: number): EstimateResult {
  const model = getModel(modelId);
  if (!model || model.usdMicros == null) return { usdMicros: null, credits: null };
  return { usdMicros: model.usdMicros * quantity, credits: null };
}

export function mockSubmit(id: string): SubmitResult {
  return {
    requestId: `mock_${id}`,
    statusUrl: `mock://requests/${id}/status`,
    cancelUrl: `mock://requests/${id}/cancel`,
    status: "queued",
  };
}

export function connectionTestInput(): { endpoint: string; input: Record<string, unknown>; note: string } {
  return {
    endpoint: "higgsfield-ai/soul/v2/standard",
    input: {
      prompt: "A quiet gray studio sweep, no people, no text, soft daylight.",
      resolution: "720p",
      aspect_ratio: "1:1",
      enhance_prompt: false,
      batch_size: 1,
    },
    note: "Smallest documented image used for the connection test: one Soul 2 still. Published representative rate is $0.0032. Live mode calls /estimate before submit.",
  };
}
