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

Open http://localhost:3000. With no API keys, the app stays in mock mode and the seeded jobs are already on the board.

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
- Completed files are copied into `data/assets` because provider URLs are temporary
- If polling exceeds `POLL_TIMEOUT_MS`, the app status becomes `timed_out` and the provider status is left as-is
- Webhooks: `POST /api/higgsfield/webhook?token=$HF_WEBHOOK_TOKEN`. The route rejects requests when the token is missing. Polling remains the local path, because a laptop is not a public HTTPS endpoint.

Catalog rates are the representative family list published by Higgsfield on 16 September 2026 in “How To Generate AI Videos Straight From the Higgsfield API” (for example Soul 2 at $0.0032 per image, Kling 3.0 at $0.112 per second, Seedance 2.5 at $0.0738 per second). They are not configuration-specific quotes. In live mode the estimate endpoint overwrites them before submit. Models with no published rate stay unpriced, and the decision engine sends those jobs to human review.

The docs index checked on 24 September 2026 has no Topaz, Flux, Seedream, lip-sync, or standalone voice endpoint. Those names are not offered as routes. Seedance 2.5 image-to-video documents 720p as its maximum. Localization voice and lip sync are escalation conditions for that reason.

The connection test, after a checkbox confirmation, estimates and optionally submits one Soul 2 still.

## Seeded demos

1. **After the Rain: Glass Monument** — Upwork-style paste, $2,800 package, 12-second 16:9 and 9:16 films plus three keyframes. Route: Soul 2 concepts, Marketing Studio keyframes, Kling 3.0 Pro motion, a Seedance 2.5 reflection repair, Soul Cinema stills. The job is parked in QA with a ledger, a failed unpaid concept, and a pending “warmer reveal” revision.
2. **Night Orchard: Slow Orbit** — one 8-second orbit and a hero still. Route: PixVerse studies, Qwen edit, Seedance 2.5 image-to-video at 720p. It waits in Needs Review so the two routes can be compared.

Recording mode on either demo resets the brief and pauses before analysis, approval, generation, QA, and delivery. Continue steps one gate at a time. The agent cannot mark the job delivered; **Approve final delivery** is a separate control. **Agent tries to deliver** stays blocked while final delivery requires approval.

Two extra fixtures fill the board: a rejected celebrity-voice request, and an unanalyzed email.

## Where things live

- `src/lib/schema.ts` — structured brief analysis
- `src/lib/economics.ts` — deterministic accept / review / reject
- `src/lib/router.ts` — visible model routes and overrides
- `src/lib/provider.ts` — Higgsfield REST adapter and mock completion
- `src/lib/qa.ts` — checklist and repair recommendation
- `src/lib/autonomy.ts` — spend caps, message policy, pause conditions
- `src/lib/db.ts` — sqlite behind a repository module (`node:sqlite`). Swap this file for Postgres later.
- `src/lib/templates.ts` — Launch Video, UGC Ad Pack, Localization Pack

Secrets and the sqlite file stay out of git. See `.env.example`.
