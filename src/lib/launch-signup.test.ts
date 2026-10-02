import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  holdingPageHtml,
  holdingStateFromUrl,
  unconfiguredDecision,
  UNCONFIGURED_MESSAGE,
} from "./holding-page";
import {
  handleLaunchSignup,
  LAUNCH_SIGNUP_MAX_ATTEMPTS,
  listLaunchSignups,
  normalizeEmail,
  parseSignupForm,
} from "./launch-signup";
import type { SqlClient, SqlRow } from "./sql";

function memorySql(): SqlClient {
  const database = new DatabaseSync(":memory:");
  return {
    async get(sql, params = []) {
      const row = database.prepare(sql).get(...params.map(bind)) as SqlRow | undefined;
      return row ?? null;
    },
    async all(sql, params = []) {
      return database.prepare(sql).all(...params.map(bind)) as SqlRow[];
    },
    async run(sql, params = []) {
      database.prepare(sql).run(...params.map(bind));
    },
  };
}

function bind(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

function signupRequest(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request("https://aiautomators.com.au/api/launch-signup", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cf-connecting-ip": "203.0.113.10",
      referer: "https://example.com/hello",
      "user-agent": "TestAgent/1.0",
      ...headers,
    },
    body: new URLSearchParams(fields),
  });
}

const now = new Date("2026-10-02T11:00:00.000Z");

function fields(extra: Record<string, string> = {}): Record<string, string> {
  return {
    email: "Matt@Example.com",
    name: " Matt ",
    hp_field: "",
    ...extra,
  };
}

test("accepts a normal email and rejects malformed ones", () => {
  assert.equal(normalizeEmail("  Ada@Studio.com.au "), "ada@studio.com.au");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail("a@b..com"), null);
  assert.equal(normalizeEmail(`${"a".repeat(250)}@b.co`), null);
});

test("honeypot does not look like a validation error", () => {
  const honeypot = parseSignupForm(formData({ ...fields(), hp_field: "acme" }));
  assert.deepEqual(honeypot, { ok: false, reason: "honeypot" });
  const missingEmail = parseSignupForm(formData({ ...fields(), email: "nope" }));
  assert.deepEqual(missingEmail, { ok: false, reason: "email" });
});

test("stores a signup, dedupes repeats, and keeps referrer and user agent", async () => {
  const db = memorySql();
  const created = await handleLaunchSignup(signupRequest(fields()), db, now);
  assert.equal(created.status, 303);
  assert.equal(created.headers.get("location"), "https://aiautomators.com.au/?joined=1");

  const again = await handleLaunchSignup(signupRequest(fields({ email: "matt@example.com", name: "Someone else" })), db, now);
  assert.equal(again.headers.get("location"), "https://aiautomators.com.au/?joined=1");

  const rows = await listLaunchSignups(db);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    email: "matt@example.com",
    name: "Matt",
    referrer: "https://example.com/hello",
    userAgent: "TestAgent/1.0",
    createdAt: now.toISOString(),
  });
});

test("optional name is stored as null when omitted", async () => {
  const db = memorySql();
  await handleLaunchSignup(signupRequest(fields({ name: "   " })), db, now);
  const rows = await listLaunchSignups(db);
  assert.equal(rows[0]?.name, null);
});

test("invalid email and honeypot do not store a row", async () => {
  const db = memorySql();
  const invalid = await handleLaunchSignup(signupRequest(fields({ email: "nope" })), db, now);
  assert.equal(invalid.headers.get("location"), "https://aiautomators.com.au/?error=email");
  const honeypot = await handleLaunchSignup(signupRequest(fields({ hp_field: "filled" })), db, now);
  assert.equal(honeypot.headers.get("location"), "https://aiautomators.com.au/?joined=1");
  assert.equal((await listLaunchSignups(db)).length, 0);
});

test("rate limit blocks another signup from the same address", async () => {
  const db = memorySql();
  for (let i = 0; i < LAUNCH_SIGNUP_MAX_ATTEMPTS; i += 1) {
    const response = await handleLaunchSignup(signupRequest(fields({ email: `person${i}@example.com` })), db, now);
    assert.equal(response.headers.get("location"), "https://aiautomators.com.au/?joined=1");
  }
  const limited = await handleLaunchSignup(signupRequest(fields({ email: "late@example.com" })), db, now);
  assert.equal(limited.headers.get("location"), "https://aiautomators.com.au/?error=limited");
  const rows = await listLaunchSignups(db);
  assert.equal(rows.length, LAUNCH_SIGNUP_MAX_ATTEMPTS);
  assert.equal(rows.some((row) => row.email === "late@example.com"), false);
});

test("a different address is not limited by someone else's attempts", async () => {
  const db = memorySql();
  for (let i = 0; i < LAUNCH_SIGNUP_MAX_ATTEMPTS; i += 1) {
    await handleLaunchSignup(signupRequest(fields({ email: `person${i}@example.com` })), db, now);
  }
  const other = await handleLaunchSignup(
    signupRequest(fields({ email: "other@example.com" }), { "cf-connecting-ip": "203.0.113.11" }),
    db,
    now,
  );
  assert.equal(other.headers.get("location"), "https://aiautomators.com.au/?joined=1");
  assert.equal((await listLaunchSignups(db)).some((row) => row.email === "other@example.com"), true);
});

test("holding page is the public response while secrets are missing", () => {
  const home = unconfiguredDecision(new Request("https://aiautomators.com.au/"));
  assert.deepEqual(home, { kind: "page", state: "ready" });
  const thanks = unconfiguredDecision(new Request("https://aiautomators.com.au/?joined=1"));
  assert.deepEqual(thanks, { kind: "page", state: "joined" });
  const signup = unconfiguredDecision(new Request("https://aiautomators.com.au/api/launch-signup", { method: "POST" }));
  assert.deepEqual(signup, { kind: "next" });
  const login = unconfiguredDecision(new Request("https://aiautomators.com.au/api/login", { method: "POST" }));
  assert.deepEqual(login, { kind: "unavailable" });

  const html = holdingPageHtml("ready", "https://aiautomators.com.au");
  assert.match(html, /AI Automators is launching soon/);
  assert.match(html, /name="email"/);
  assert.match(html, /name="name"/);
  assert.match(html, /name="hp_field"/);
  assert.match(html, /action="\/api\/launch-signup"/);
  assert.doesNotMatch(html, /OPERATOR_PASSWORD/);
  const joined = holdingPageHtml("joined");
  assert.match(joined, /You're on the list/);
  assert.doesNotMatch(joined, /<form/);
  assert.equal(holdingStateFromUrl(new URL("https://aiautomators.com.au/jobs/1?joined=1")), "ready");
  assert.match(UNCONFIGURED_MESSAGE, /OPERATOR_PASSWORD/);
});

test("migration creates the same signup table", () => {
  const sql = readFileSync(new URL("../../migrations/0003_launch_signups.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS launch_signups/);
  assert.match(sql, /email TEXT NOT NULL UNIQUE/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS launch_signup_attempts/);
});

function formData(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}
