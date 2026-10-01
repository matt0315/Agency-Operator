import { getGeneration } from "@/lib/db";
import { ensureReady } from "@/lib/service";
import { readAssetBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureReady();
  const { id } = await context.params;
  const generation = await getGeneration(id);
  const index = Number(new URL(request.url).searchParams.get("i") || "0");
  const asset = generation?.output?.assets[Number.isFinite(index) ? index : 0] ?? generation?.output?.assets.find((item) => item.localPath);
  if (!asset?.localPath) return new Response("Not found", { status: 404 });
  const file = await readAssetBytes(asset.localPath);
  if (!file) return new Response("Not found", { status: 404 });
  const body = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: { "Content-Type": file.contentType || asset.contentType || "application/octet-stream" },
  });
}
