import { clearLoginFailures, countRecentLoginFailures, recordLoginFailure } from "@/lib/db";
import { OPERATOR_HOME_PATH } from "@/lib/holding-page";
import { passwordsMatch, redirectWithCookie, sessionCookie, signSession } from "@/lib/session";
import { ensureReady } from "@/lib/service";

export const dynamic = "force-dynamic";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

async function secret(name: string): Promise<string | undefined> {
  if (process.env[name]) return process.env[name];
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as Record<string, unknown>)[name];
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  try {
    return await login(request);
  } catch (error) {
    console.error("login failed", error);
    return new Response("Login failed.", { status: 500 });
  }
}

async function login(request: Request) {
  const password = await secret("OPERATOR_PASSWORD");
  const sessionSecret = await secret("SESSION_SECRET");
  if (!password || !sessionSecret) {
    return new Response("Agency Operator is not configured. Set OPERATOR_PASSWORD and SESSION_SECRET.", { status: 503 });
  }
  await ensureReady();
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  if ((await countRecentLoginFailures(ip, since)) >= MAX_ATTEMPTS) {
    return Response.redirect(new URL("/login?error=limited", request.url), 303);
  }
  const form = await request.formData();
  const submitted = String(form.get("password") || "");
  if (!(await passwordsMatch(submitted, password))) {
    await recordLoginFailure(ip, new Date().toISOString());
    return Response.redirect(new URL("/login?error=1", request.url), 303);
  }
  await clearLoginFailures(ip);
  const token = await signSession(sessionSecret);
  const secure = new URL(request.url).protocol === "https:";
  return redirectWithCookie(new URL(OPERATOR_HOME_PATH, request.url).toString(), sessionCookie(token, secure));
}
