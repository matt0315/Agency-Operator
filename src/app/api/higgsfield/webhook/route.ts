import { applyWebhook } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.HF_WEBHOOK_TOKEN;
  const provided = new URL(request.url).searchParams.get("token");
  if (!expected || provided !== expected) {
    return Response.json({ ok: false, reason: "Webhook token rejected." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const result = await applyWebhook(body);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
