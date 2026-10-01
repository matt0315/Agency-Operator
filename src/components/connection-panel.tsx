"use client";

import { useState, useTransition } from "react";
import { estimateConnectionAction, submitConnectionAction } from "@/app/actions";
import { formatUsdAuto } from "@/lib/format";
import { Button } from "./ui";

export function ConnectionPanel({ mode }: { mode: "mock" | "live" }) {
  const [confirmed, setConfirmed] = useState(false);
  const [estimate, setEstimate] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="panel space-y-3 p-4">
      <p className="text-sm text-[var(--color-muted)]">
        Mode: {mode}. The test is one Soul 2 still, the smallest documented image in the priced catalog. Live mode calls the estimate endpoint before submit. Credentials stay on the server and are not shown here.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        I confirm this {mode === "live" ? "may spend a few cents" : "runs locally and spends nothing"}.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!confirmed || pending} onClick={() => start(async () => {
          const response = await estimateConnectionAction();
          setEstimate(response.ok ? `Estimate ${formatUsdAuto(response.usdMicros)}. ${response.note}` : response.error);
        })}>Estimate</Button>
        <Button disabled={!confirmed || pending || !estimate} onClick={() => start(async () => {
          const response = await submitConnectionAction();
          setResult(response.ok ? `Submitted ${response.requestId} · ${response.status}` : response.error);
        })}>Submit test</Button>
      </div>
      {estimate ? <p className="text-sm">{estimate}</p> : null}
      {result ? <p className="text-sm">{result}</p> : null}
    </section>
  );
}
