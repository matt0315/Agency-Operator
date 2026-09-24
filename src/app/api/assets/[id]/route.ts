import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getGeneration } from "@/lib/db";
import { ensureReady } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  ensureReady();
  const { id } = await context.params;
  const generation = getGeneration(id);
  const asset = generation?.output?.assets.find((item) => item.localPath);
  if (!asset?.localPath) return new Response("Not found", { status: 404 });
  const root = path.resolve(process.env.ASSET_DIR || path.join(process.cwd(), "data", "assets"));
  const file = path.resolve(asset.localPath);
  if (!file.startsWith(root) || !existsSync(file)) return new Response("Not found", { status: 404 });
  const stream = createReadStream(file);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: { "Content-Type": asset.contentType || "application/octet-stream" },
  });
}
