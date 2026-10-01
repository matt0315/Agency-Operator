import { isCloudflareWorker, workerBindings } from "./cloudflare-env";
import { importNodeModule } from "./node-import";

export async function saveAssetBytes(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (isCloudflareWorker()) {
    const env = await workerBindings();
    if (!env?.ASSETS_BUCKET) throw new Error("R2 binding ASSETS_BUCKET is not configured.");
    await env.ASSETS_BUCKET.put(key, bytes, { httpMetadata: { contentType } });
    return key;
  }
  const { mkdir, writeFile } = await importNodeModule<typeof import("node:fs/promises")>(["node", "fs/promises"].join(":"));
  const path = await importNodeModule<typeof import("node:path")>(["node", "path"].join(":"));
  const root = process.env.ASSET_DIR || path.join(process.cwd(), "data", "assets");
  const full = path.join(root, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return full;
}

export async function readAssetBytes(stored: string): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  if (isCloudflareWorker()) {
    const env = await workerBindings();
    const object = await env?.ASSETS_BUCKET.get(stored);
    if (!object) return null;
    const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
    return { bytes, contentType: object.httpMetadata?.contentType ?? null };
  }
  const { readFile } = await importNodeModule<typeof import("node:fs/promises")>(["node", "fs/promises"].join(":"));
  const path = await importNodeModule<typeof import("node:path")>(["node", "path"].join(":"));
  const root = path.resolve(process.env.ASSET_DIR || path.join(process.cwd(), "data", "assets"));
  const file = path.resolve(stored);
  if (!file.startsWith(root)) return null;
  try {
    const bytes = new Uint8Array(await readFile(file));
    return { bytes, contentType: null };
  } catch {
    return null;
  }
}
