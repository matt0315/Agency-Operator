import { LAUNCH_SIGNUP_PATH } from "./launch-signup";

export type HoldingState = "ready" | "joined" | "invalid" | "limited";

export const OPERATOR_HOME_PATH = "/app";

export type PublicDecision =
  | { kind: "next" }
  | { kind: "page"; state: HoldingState }
  | { kind: "app" };

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
} as const;

export function holdingStateFromUrl(url: URL): HoldingState {
  if (url.pathname !== "/") return "ready";
  if (url.searchParams.get("joined") === "1") return "joined";
  if (url.searchParams.get("error") === "email") return "invalid";
  if (url.searchParams.get("error") === "limited") return "limited";
  return "ready";
}

export function publicDecision(request: Request): PublicDecision {
  const url = new URL(request.url);
  const read = request.method === "GET" || request.method === "HEAD";
  if (read && url.pathname === "/") return { kind: "page", state: holdingStateFromUrl(url) };
  if (request.method === "POST" && url.pathname === LAUNCH_SIGNUP_PATH) return { kind: "next" };
  if (read && url.pathname === "/login") return { kind: "next" };
  if (request.method === "POST" && url.pathname === "/api/login") return { kind: "next" };
  return { kind: "app" };
}

export const UNCONFIGURED_MESSAGE =
  "Agency Operator is not configured. Set OPERATOR_PASSWORD and SESSION_SECRET before serving.";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageCopy(state: HoldingState): { title: string; body: string } {
  if (state === "joined") {
    return {
      title: "You're on the list — AI Automators",
      body: `
        <h1>You're on the list</h1>
        <p class="lede" role="status">Thanks. We'll email you when AI Automators opens.</p>
      `,
    };
  }
  const alert =
    state === "invalid"
      ? `<p class="alert" role="alert">Enter a valid email address.</p>`
      : state === "limited"
        ? `<p class="alert" role="alert">Too many attempts from this network. Wait a few minutes and try again.</p>`
        : "";
  return {
    title: "AI Automators — Launching soon",
    body: `
      <h1>Launching soon</h1>
      <p class="lede">AI Automators is launching soon. Leave your email and we'll send one note when it's open.</p>
      <form method="post" action="${LAUNCH_SIGNUP_PATH}">
        ${alert}
        <label>
          Name <span>(optional)</span>
          <input name="name" type="text" maxlength="80" autocomplete="name" placeholder="Alex">
        </label>
        <label>
          Email
          <input name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email" placeholder="you@studio.com">
        </label>
        <div class="hp" aria-hidden="true">
          <label for="hp_field">Company</label>
          <input id="hp_field" name="hp_field" type="text" tabindex="-1" autocomplete="off" value="">
        </div>
        <button type="submit">Notify me</button>
        <p class="fine">One email when we launch. No newsletter.</p>
      </form>
    `,
  };
}

export function holdingPageHtml(state: HoldingState, origin = "https://aiautomators.com.au"): string {
  const canonical = escapeHtml(`${origin.replace(/\/$/, "")}/`);
  const { title, body } = pageCopy(state);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="AI Automators is launching soon. Leave your email and we'll tell you when the studio opens.">
  <link rel="canonical" href="${canonical}">
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: #f4f0e8;
      background:
        radial-gradient(900px 420px at 50% -10%, rgba(224, 161, 90, 0.16), transparent 55%),
        #100e0c;
    }
    main {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .card {
      width: min(100%, 440px);
      padding: 28px 22px 22px;
      border: 1px solid #3a342e;
      border-radius: 18px;
      background: rgba(26, 24, 21, 0.94);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    }
    .kicker {
      margin: 0;
      font-family: ui-monospace, "SFMono-Regular", monospace;
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #e0a15a;
    }
    h1 {
      margin: 14px 0 0;
      font-size: 2rem;
      line-height: 1.1;
      font-weight: 560;
      letter-spacing: -0.03em;
    }
    .lede { margin: 12px 0 0; color: #d9d0c4; font-size: 1.05rem; line-height: 1.45; }
    form { margin-top: 22px; display: grid; gap: 14px; }
    label { display: grid; gap: 6px; font-size: 0.92rem; color: #d9d0c4; }
    label span { color: #a3988c; }
    input {
      width: 100%;
      min-height: 48px;
      padding: 12px 14px;
      border: 1px solid #3a342e;
      border-radius: 12px;
      background: #141210;
      color: #f4f0e8;
      font: inherit;
      font-size: 16px;
    }
    input:focus { outline: 2px solid #e0a15a; border-color: #e0a15a; }
    button {
      min-height: 48px;
      border: 0;
      border-radius: 999px;
      background: #e0a15a;
      color: #1a1208;
      font: inherit;
      font-size: 1rem;
      font-weight: 650;
      cursor: pointer;
    }
    button:focus { outline: 2px solid #f4f0e8; outline-offset: 3px; }
    .fine, .domain { margin: 0; color: #a3988c; font-size: 0.85rem; line-height: 1.4; }
    .domain { margin-top: 18px; }
    .alert { margin: 0; color: #e0a090; font-size: 0.95rem; }
    .hp {
      position: absolute;
      left: -10000px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <p class="kicker">AI Automators</p>
      ${body}
      <p class="domain">aiautomators.com.au</p>
    </section>
  </main>
</body>
</html>`;
}

export function holdingPageResponse(request: Request, state: HoldingState): Response {
  const url = new URL(request.url);
  return new Response(holdingPageHtml(state, url.origin), {
    status: 200,
    headers: PAGE_HEADERS,
  });
}
