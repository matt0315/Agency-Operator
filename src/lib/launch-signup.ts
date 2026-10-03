import type { SqlClient } from "./sql";

export const LAUNCH_SIGNUP_PATH = "/api/launch-signup";
export const LAUNCH_SIGNUP_MAX_ATTEMPTS = 8;
export const LAUNCH_SIGNUP_WINDOW_MS = 15 * 60 * 1000;

const IP_HASH_PREFIX = "agency-operator-launch-signup-v1";
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const LAUNCH_SIGNUP_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS launch_signups (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    referrer TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS launch_signup_attempts (
    id TEXT PRIMARY KEY,
    ip_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS launch_signup_attempts_ip_created ON launch_signup_attempts (ip_hash, created_at)`,
] as const;

export type LaunchSignup = {
  email: string;
  name: string | null;
  referrer: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type SignupParse =
  | { ok: true; email: string; name: string | null }
  | { ok: false; reason: "honeypot" | "email" };

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (email.includes("..")) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function normalizeName(raw: string): string | null {
  const name = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return null;
  return name.slice(0, 80);
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

export function parseSignupForm(form: FormData): SignupParse {
  const trap = form.get("hp_field");
  if (typeof trap === "string" && trap.trim()) return { ok: false, reason: "honeypot" };

  const email = normalizeEmail(typeof form.get("email") === "string" ? String(form.get("email")) : "");
  if (!email) return { ok: false, reason: "email" };
  const name = normalizeName(typeof form.get("name") === "string" ? String(form.get("name")) : "");
  return { ok: true, email, name };
}

export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 128);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 128);
  return "unknown";
}

export async function hashClientIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${IP_HASH_PREFIX}:${ip}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ensureLaunchSignupSchema(db: SqlClient): Promise<void> {
  for (const statement of LAUNCH_SIGNUP_SCHEMA) {
    await db.run(statement);
  }
}

async function countAttempts(db: SqlClient, ipHash: string, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - LAUNCH_SIGNUP_WINDOW_MS).toISOString();
  await db.run("DELETE FROM launch_signup_attempts WHERE created_at < ?", [cutoff]);
  await db.run("INSERT INTO launch_signup_attempts (id, ip_hash, created_at) VALUES (?, ?, ?)", [
    crypto.randomUUID(),
    ipHash,
    now.toISOString(),
  ]);
  const row = await db.get("SELECT COUNT(*) AS count FROM launch_signup_attempts WHERE ip_hash = ? AND created_at >= ?", [
    ipHash,
    cutoff,
  ]);
  return Number(row?.count ?? 0);
}

function isUniqueError(error: unknown): boolean {
  return String(error).toLowerCase().includes("unique");
}

export async function listLaunchSignups(db: SqlClient): Promise<LaunchSignup[]> {
  await ensureLaunchSignupSchema(db);
  const rows = await db.all("SELECT email, name, referrer, user_agent, created_at FROM launch_signups ORDER BY created_at DESC");
  return rows.map((row) => ({
    email: String(row.email),
    name: row.name == null || row.name === "" ? null : String(row.name),
    referrer: row.referrer == null || row.referrer === "" ? null : String(row.referrer),
    userAgent: row.user_agent == null || row.user_agent === "" ? null : String(row.user_agent),
    createdAt: String(row.created_at),
  }));
}

function redirectTo(request: Request, query: string): Response {
  const url = new URL("/", request.url);
  url.search = query;
  return new Response(null, {
    status: 303,
    headers: {
      location: url.toString(),
      "cache-control": "no-store",
    },
  });
}

export async function handleLaunchSignup(request: Request, db: SqlClient, now = new Date()): Promise<Response> {
  await ensureLaunchSignupSchema(db);
  const ipHash = await hashClientIp(clientIp(request));
  const attempts = await countAttempts(db, ipHash, now);
  if (attempts > LAUNCH_SIGNUP_MAX_ATTEMPTS) return redirectTo(request, "?error=limited");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(request, "?error=email");
  }

  const parsed = parseSignupForm(form);
  if (!parsed.ok) {
    if (parsed.reason === "email") return redirectTo(request, "?error=email");
    return redirectTo(request, "?joined=1");
  }

  const referrer = clip(request.headers.get("referer"), 500);
  const userAgent = clip(request.headers.get("user-agent"), 400);
  const existing = await db.get("SELECT id FROM launch_signups WHERE email = ?", [parsed.email]);
  if (!existing) {
    try {
      await db.run(
        "INSERT INTO launch_signups (id, email, name, referrer, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), parsed.email, parsed.name, referrer, userAgent, now.toISOString()],
      );
    } catch (error) {
      if (!isUniqueError(error)) throw error;
    }
  }
  return redirectTo(request, "?joined=1");
}
