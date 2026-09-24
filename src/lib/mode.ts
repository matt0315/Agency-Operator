export function analysisMode(): "mock" | "live" {
  if (process.env.APP_MODE === "mock") return "mock";
  return process.env.OPENAI_API_KEY ? "live" : "mock";
}

export function generationMode(): "mock" | "live" {
  if (process.env.APP_MODE === "mock") return "mock";
  return process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET ? "live" : "mock";
}

export function redact(text: string): string {
  const secrets = [process.env.OPENAI_API_KEY, process.env.HF_API_KEY_ID, process.env.HF_API_KEY_SECRET, process.env.HF_WEBHOOK_TOKEN];
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length > 4) out = out.split(secret).join("[redacted]");
  }
  return out.replace(/Key\s+[A-Za-z0-9_\-]+:[A-Za-z0-9_\-]+/g, "Key [redacted]");
}
