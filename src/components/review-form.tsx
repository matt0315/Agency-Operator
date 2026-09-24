"use client";

import { useState, useTransition } from "react";
import { saveReviewAction } from "@/app/actions";
import type { BriefAnalysis } from "@/lib/types";
import { Button } from "./ui";

export function ReviewForm({ jobId, initial }: { jobId: string; initial: BriefAnalysis }) {
  const [analysis, setAnalysis] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function lines(value: string): string[] {
    return value.split("\n").map((line) => line.trim()).filter(Boolean);
  }

  return (
    <form
      className="panel space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await saveReviewAction(jobId, analysis);
          setError(result.ok ? "Saved. The model version is still on the job." : result.error);
        });
      }}
    >
      <label className="block text-sm">
        Summary
        <textarea className="mt-1 w-full rounded-lg border bg-transparent p-2" rows={3} value={analysis.conciseSummary} onChange={(event) => setAnalysis({ ...analysis, conciseSummary: event.target.value })} />
      </label>
      <label className="block text-sm">
        Missing assets, one per line
        <textarea className="mt-1 w-full rounded-lg border bg-transparent p-2" rows={3} value={analysis.missingAssets.join("\n")} onChange={(event) => setAnalysis({ ...analysis, missingAssets: lines(event.target.value) })} />
      </label>
      <label className="block text-sm">
        Questions, one per line
        <textarea className="mt-1 w-full rounded-lg border bg-transparent p-2" rows={3} value={analysis.questionsForClient.join("\n")} onChange={(event) => setAnalysis({ ...analysis, questionsForClient: lines(event.target.value) })} />
      </label>
      <label className="block text-sm">
        Assumptions, one per line
        <textarea className="mt-1 w-full rounded-lg border bg-transparent p-2" rows={3} value={analysis.assumptions.join("\n")} onChange={(event) => setAnalysis({ ...analysis, assumptions: lines(event.target.value) })} />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Advisory decision
          <select className="mt-1 w-full rounded border bg-[#141210] px-2 py-2" value={analysis.decision} onChange={(event) => setAnalysis({ ...analysis, decision: event.target.value as BriefAnalysis["decision"] })}>
            <option value="accept">accept</option>
            <option value="human_review">human_review</option>
            <option value="reject">reject</option>
          </select>
        </label>
        <label className="text-sm">
          Revision risk
          <select className="mt-1 w-full rounded border bg-[#141210] px-2 py-2" value={analysis.revisionRisk} onChange={(event) => setAnalysis({ ...analysis, revisionRisk: event.target.value as BriefAnalysis["revisionRisk"] })}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className="text-sm">
          Confidence
          <input className="mt-1 w-full rounded border bg-transparent px-2 py-2" type="number" min={0} max={100} value={analysis.confidence} onChange={(event) => setAnalysis({ ...analysis, confidence: Number(event.target.value) })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={analysis.deceptiveImpersonation} onChange={(event) => setAnalysis({ ...analysis, deceptiveImpersonation: event.target.checked })} />
        Deceptive impersonation
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={analysis.cannotDeliverReliably} onChange={(event) => setAnalysis({ ...analysis, cannotDeliverReliably: event.target.checked })} />
        Cannot deliver reliably
      </label>
      <Button disabled={pending} type="submit">Save human version</Button>
      {error ? <p className="text-sm text-[var(--color-warn)]">{error}</p> : null}
      <p className="text-xs text-[var(--color-muted)]">Saving writes a new human version and reruns the deterministic decision. The original model analysis stays.</p>
    </form>
  );
}
