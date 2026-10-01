export type CloudflareEnv = {
  DB: D1Database;
  ASSETS_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_MODE?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  HF_API_KEY_ID?: string;
  HF_API_KEY_SECRET?: string;
  HF_API_BASE?: string;
  HF_WEBHOOK_TOKEN?: string;
  OPERATOR_PASSWORD?: string;
  SESSION_SECRET?: string;
  POLL_TIMEOUT_MS?: string;
  APP_RUNTIME?: string;
};

const SECRET_NAMES = [
  "APP_MODE",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "HF_API_KEY_ID",
  "HF_API_KEY_SECRET",
  "HF_API_BASE",
  "HF_WEBHOOK_TOKEN",
  "OPERATOR_PASSWORD",
  "SESSION_SECRET",
  "POLL_TIMEOUT_MS",
  "APP_RUNTIME",
] as const;

const cache = new Map<string, string>();

export function isCloudflareWorker(): boolean {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Cloudflare-Workers/i.test(ua)) return true;
  // OpenNext sets this for the duration of a Worker request. `npm run dev` does not.
  const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")];
  return Boolean(ctx && typeof ctx === "object" && "env" in ctx);
}

export async function workerBindings(): Promise<CloudflareEnv | null> {
  if (!isCloudflareWorker()) return null;
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  return env as CloudflareEnv;
}

export async function envValue(name: (typeof SECRET_NAMES)[number]): Promise<string | undefined> {
  const cached = cache.get(name);
  if (cached) return cached;
  const fromProcess = process.env[name];
  if (fromProcess) {
    cache.set(name, fromProcess);
    return fromProcess;
  }
  const env = await workerBindings();
  const value = env?.[name];
  if (typeof value === "string" && value) {
    cache.set(name, value);
    return value;
  }
  return undefined;
}

export async function hydrateProcessEnv(): Promise<void> {
  for (const name of SECRET_NAMES) {
    const value = await envValue(name);
    if (value && !process.env[name]) {
      try {
        process.env[name] = value;
      } catch {
        cache.set(name, value);
      }
    }
  }
}
