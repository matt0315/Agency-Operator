# Agency Operator

Agency Operator is an internal operating system for a one-person AI creative studio. A person pastes a brief from Upwork, Fiverr, Contra, email, a sales call, or a direct form. The app turns that brief into a priced production plan, then tracks generation, QA, revisions, and delivery.

It does not scrape a marketplace, submit a proposal, accept a contract, message through a marketplace, or deliver files through one.

The pipeline is:

brief → qualify → price → approve → route models → generate → QA → deliver

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no API keys, the app stays in mock mode. Paste a brief and the studio runs it. The seeded jobs are already on the board so each stage can be inspected.

```bash
npm test
```

Tests cover analysis schema validation and the deterministic accept / review / reject rules, plus autonomy caps and a mock walkthrough of both demos.

## Mock and live

`APP_MODE=mock` never calls OpenAI or Higgsfield.

If `APP_MODE` is unset or `live`:

- Brief analysis uses the OpenAI Responses API only when `OPENAI_API_KEY` is set. Otherwise it uses the built-in mock analysis.
- Generation uses Higgsfield only when both `HF_API_KEY_ID` and `HF_API_KEY_SECRET` are set. Otherwise generation is local.

Copy `.env.example` to `.env.local`. Leave the secrets empty. Do not put keys in client code. The connection test and provider adapter run on the server, and errors are redacted before they reach the UI.

## What runs alone

Fully automatic within limits is on by default. After one paste the app analyzes the brief, prices the route from the catalog, and — when the deterministic decision is accept, or the only soft hold is a positive margin under the target — approves the workflow, generates, runs QA, repairs inside the caps, and drafts the delivery package. The job timeline lists what ran without a person and what is waiting.

Client messages are drafted for approval. They send themselves only when that message type is enabled, and only on direct email or the first-party portal. The fully automatic preset may enable intake questions, progress notes, and feedback requests. Concept share and change orders stay off. Marketplace threads are never sent.

Recording mode is the demo step-through. It pauses before analysis, approval, generation, QA, and delivery. A normal job does not use it.

## What still needs a person

- Marketplace scrape, auto-apply, marketplace messaging, accepting a marketplace contract, or delivering through a marketplace
- Likeness, voice, logos, packaging or regulated claims, licensed music, and unclear ownership
- A missing price, a negative margin, a missing input, or a motion deadline under 12 hours
- Spend above the per-job or per-repair cap, or above the production ceiling
- A model override, a scope change, or any other change outside the approved route
- Final delivery while “final delivery always requires approval” is on (the default). The control is **Approve delivery**

Auto-repair and auto-advance generation are on by default. Turn **Fully automatic within limits** off to stop the paste-and-run path. The preset on Autonomy Settings restores the maximum safe profile without raising those hard stops.

## Models

### OpenAI

Official model guidance documents `gpt-6-astra` as a Responses-capable model with Structured Outputs. The app sends `model: gpt-6-astra` unless `OPENAI_MODEL` overrides it, with `reasoning.effort` set to `low` and a strict JSON schema. The model’s `decision` field is advisory. Prices are never taken from the model.

### Higgsfield

The adapter uses the documented REST lifecycle rather than `@higgsfield/client`. The TypeScript SDK’s `subscribe` helper polls to completion, but this product also needs `POST /estimate/{endpoint}` before a paid submit, explicit cancel-while-queued, and an application timeout that is not stored as a provider status. Those are documented on the REST API.

- Base URL: `https://api.higgsfield.ai` (OpenAPI server and model pages). Some overview snippets show `platform.higgsfield.ai`.
- Auth: `Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}`
- Statuses: `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled`
- Cancel: `POST` the `cancel_url` only while status is `queued` (202 accepted, 400 once processing has started)
- Failed, NSFW, and canceled requests are not billed in the internal ledger
- Completed files are stored because provider URLs are temporary. Local dev writes `data/assets`. On Cloudflare they go to the R2 bucket `agency-operator-assets` and are served from the authenticated route `/api/assets/:id`.
- If polling exceeds `POLL_TIMEOUT_MS`, the app status becomes `timed_out` and the provider status is left as-is
- Webhooks: `POST /api/higgsfield/webhook?token=$HF_WEBHOOK_TOKEN`. The route rejects requests when the token is missing. Polling remains the local path, because a laptop is not a public HTTPS endpoint.

Catalog rates are the representative family list published by Higgsfield on 16 September 2026 in “How To Generate AI Videos Straight From the Higgsfield API” (for example Soul 2 at $0.0032 per image, Kling 3.0 at $0.112 per second, Seedance 2.5 at $0.0738 per second). They are not configuration-specific quotes. In live mode the estimate endpoint overwrites them before submit. Models with no published rate stay unpriced, and the decision engine sends those jobs to human review.

The docs index checked on 24 September 2026 has no Topaz, Flux, Seedream, lip-sync, or standalone voice endpoint. Those names are not offered as routes. Seedance 2.5 image-to-video documents 720p as its maximum. Localization voice and lip sync are escalation conditions for that reason.

The connection test, after a checkbox confirmation, estimates and optionally submits one Soul 2 still.

## Seeded demos

1. **After the Rain: Glass Monument** — Upwork-style paste, $2,800 package, 12-second 16:9 and 9:16 films plus three keyframes. Route: Soul 2 concepts, Marketing Studio keyframes, Kling 3.0 Pro motion, a Seedance 2.5 reflection repair, Soul Cinema stills. The job is parked in QA with a ledger, a failed unpaid concept, and a pending “warmer reveal” revision.
2. **Night Orchard: Slow Orbit** — one 8-second orbit and a hero still. Route: PixVerse studies, Qwen edit, Seedance 2.5 image-to-video at 720p. It waits in Needs Review so the two routes can be compared.

Recording mode on either demo resets the brief and pauses before analysis, approval, generation, QA, and delivery. Continue steps one gate at a time. The agent cannot mark the job delivered; **Approve delivery** is the human control. **Agent tries to deliver** stays blocked while final delivery requires approval. A new paste, outside recording mode, runs the automatic path instead.

Two extra fixtures fill the board: a rejected celebrity-voice request, and an unanalyzed email.

## Where things live

- `src/lib/schema.ts` — structured brief analysis
- `src/lib/economics.ts` — deterministic accept / review / reject
- `src/lib/router.ts` — visible model routes and overrides
- `src/lib/provider.ts` — Higgsfield REST adapter and mock completion
- `src/lib/qa.ts` — checklist and repair recommendation
- `src/lib/autonomy.ts` — spend caps, message policy, pause conditions
- `src/lib/db.ts` — async repository. `npm run dev` uses a local `node:sqlite` file. Cloudflare Workers use the D1 binding `DB`.
- `src/lib/launch-signup.ts` — public holding-page emails, stored in the same D1 database.
- `src/lib/templates.ts` — Launch Video, UGC Ad Pack, Localization Pack

Secrets and the sqlite file stay out of git. See `.env.example`.

## Deploy to Cloudflare

Production is a Next.js app on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`). The Worker name is `agency-operator`. `wrangler.jsonc` attaches `aiautomators.com.au` and `www.aiautomators.com.au` as custom domains, binds D1 database `agency-operator` as `DB`, and binds R2 bucket `agency-operator-assets` as `ASSETS_BUCKET`.

Deploy from a machine that has Wrangler and a Cloudflare API token. This repository does not deploy itself.

The token that can deploy cannot run D1 commands. Apply the SQL files yourself, in this order, against the remote D1 database `agency-operator` (id `a2fba81d-a3f2-465d-a4ed-c8621e39168f`):

1. `migrations/0001_init.sql` — tables
2. `migrations/0002_seed.sql` — both demos, the reject and unanalyzed fixtures, service templates, and autonomy defaults
3. `migrations/0003_launch_signups.sql` — holding-page emails. The signup handler also creates this table, so the public form works before the file is applied. Applying it does not delete captured rows.

The files are idempotent. Run the first two before the first login. The Worker does not migrate D1 on boot, except that a holding-page signup creates its own tables if they are missing.

If a token later gains D1 access, the same files can be applied with:

```bash
npx wrangler d1 execute agency-operator --remote --file=migrations/0001_init.sql
npx wrangler d1 execute agency-operator --remote --file=migrations/0002_seed.sql
npx wrangler d1 execute agency-operator --remote --file=migrations/0003_launch_signups.sql
```

The current deploy token cannot run those commands. Execute the SQL files directly. `0003` is optional because the first signup creates the same tables.

Set secrets from the repo root. Wrangler prompts for each value and does not print it back. Until both required secrets exist, including when `APP_MODE=mock`, the public site serves a holding page instead of the operator app. Visitors can leave an email. Signups are stored in D1 table `launch_signups` on database `agency-operator` (binding `DB`). Repeats of the same email are ignored. The form includes a honeypot and allows 8 submissions per network address every 15 minutes.

Read the captured emails before or after the secrets are set:

```bash
npx wrangler d1 execute agency-operator --remote --command "SELECT email, name, created_at, referrer, user_agent FROM launch_signups ORDER BY created_at DESC;"
```

After `OPERATOR_PASSWORD` and `SESSION_SECRET` are set, the holding page is gone and the operator app behaves as before. The rows stay in D1. A logged-in operator can also open **Signups** (`/settings/signups`).

```bash
npx wrangler secret put OPERATOR_PASSWORD
npx wrangler secret put SESSION_SECRET
```

Optional. Leave them unset to stay in mock mode (the header shows a Mock mode badge). Set them only when you want live model calls.

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL
npx wrangler secret put HF_API_KEY_ID
npx wrangler secret put HF_API_KEY_SECRET
npx wrangler secret put HF_API_BASE
npx wrangler secret put HF_WEBHOOK_TOKEN
npx wrangler secret put APP_MODE
npx wrangler secret put POLL_TIMEOUT_MS
```

`APP_MODE=mock` forces mock even if keys are present. Unset `APP_MODE` uses live analysis only when `OPENAI_API_KEY` is set, and live generation only when both Higgsfield secrets are set.

Deploy:

```bash
npm install
npm run deploy
```

`npm run deploy` is `opennextjs-cloudflare build && opennextjs-cloudflare deploy`.

Local `npm run dev` still uses the sqlite file. It skips the password only when `APP_MODE=mock` and `NODE_ENV=development`. Preview the Worker runtime locally with a gitignored `.dev.vars` (copy `.dev.vars.example`) and a local D1:

```bash
npx wrangler d1 execute agency-operator --local --file=migrations/0001_init.sql
npx wrangler d1 execute agency-operator --local --file=migrations/0002_seed.sql
npm run preview
```

Login is one operator password, checked with a SHA-256 digest and a constant-time compare. The session cookie `ao_session` is HttpOnly and SameSite=Lax, signed with `SESSION_SECRET`. It is marked Secure on HTTPS, which the custom domain is. Eight failed attempts per IP in 15 minutes are rejected. Once the two secrets are set, every page and API route except `/login`, `/api/login`, and static assets requires the cookie. That includes `POST /api/higgsfield/webhook`. While the secrets are missing, visitors get the holding page, and `POST /api/launch-signup` is the only write that is accepted. Live status still arrives through the browser poll below. A provider callback would need its own exemption later; the route already rejects requests when `HF_WEBHOOK_TOKEN` is unset.

This repository does not deploy from GitHub. Workers Builds has no builds for `agency-operator`. Merging a pull request does not publish the site. Deploy with `npm run deploy` from a machine that holds the Cloudflare API token.

Generation does not hold one request open for the provider poll window. While a job status is `generating`, the browser calls `POST /api/jobs/:id/poll` every few seconds.

A local OpenNext preview bundle was about 1.2 MB gzipped (about 5.6 MB uncompressed), under the Workers script size limit.
