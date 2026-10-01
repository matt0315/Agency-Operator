import { briefAnalysisJsonSchema, parseAnalysisResponse } from "./schema";
import { listModels } from "./catalog";
import { OPERATOR_PROMPT } from "./operator-prompt";
import { redact } from "./mode";
import type { BriefAnalysis } from "./types";

export async function analyzeWithOpenAI(input: { title: string; brief: string; source: string }): Promise<BriefAnalysis> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_MODEL || "gpt-6-astra";
  const catalog = listModels().map((item) => ({
    id: item.id,
    name: item.name,
    roles: item.roles,
    unit: item.unit,
    priced: item.usdMicros != null,
    note: item.strengths,
  }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: OPERATOR_PROMPT },
        {
          role: "user",
          content: `Title: ${input.title}\nSource: ${input.source}\n\nBrief:\n${input.brief}\n\nModel catalog (capabilities only — do not invent prices or endpoints beyond this list):\n${JSON.stringify(catalog)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "brief_analysis",
          strict: true,
          schema: briefAnalysisJsonSchema,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(redact(`OpenAI returned HTTP ${response.status}.`));
  }
  const payload = (await response.json()) as {
    output_text?: string;
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  const chunks: string[] = [];
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) chunks.push(part.text);
    }
  }
  const text = chunks.join("") || payload.output_text || "";
  const parsed = parseAnalysisResponse(text);
  if (!parsed.ok) throw new Error(`Structured output failed validation: ${parsed.error}`);
  return parsed.analysis;
}
