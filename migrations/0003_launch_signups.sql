-- Public holding-page emails. Idempotent.
-- The signup handler also creates these tables, so the form works before this file is applied.
-- Existing rows are kept. Applying this file does not delete signups.

CREATE TABLE IF NOT EXISTS launch_signups (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS launch_signup_attempts (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS launch_signup_attempts_ip_created ON launch_signup_attempts (ip_hash, created_at);
