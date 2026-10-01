"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { advanceAction, approveDeliveryAction, deliverAction, resetAction } from "@/app/actions";
import { formatUsdAuto } from "@/lib/format";
import type { JobBundle } from "@/lib/types";
import { ProfitabilityPanel } from "./profitability";
import { Button } from "./ui";

const GATES = ["analysis", "approval", "generation", "qa", "delivery"] as const;

export function RecordingConsole({ bundle }: { bundle: JobBundle }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [liveGate, setLiveGate] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const gate = liveGate ?? bundle.job.recordingGate;

  useEffect(() => {
    setLiveGate(null);
  }, [bundle.job.recordingGate, bundle.job.updatedAt]);
  const actual = bundle.ledger.reduce((sum, entry) => sum + entry.amountMicros, 0);
  return (
    <div className="space-y-4">
      <section className="panel p-6">
        <p className="kicker">Recording mode</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">{bundle.job.title}</h1>
        <p className="mt-4 text-3xl text-[var(--color-accent)]">
          {gate ? `Paused before ${gate}` : bundle.job.status.replaceAll("_", " ")}
        </p>
        <p className="mt-3 max-w-3xl text-lg text-[var(--color-muted)]">
          This is the demo step-through. A normal paste runs on its own. Reset returns this demo to the brief, and Continue stops before the next stage.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {GATES.map((item) => (
            <span key={item} className={`rounded-full border px-3 py-1 text-sm ${gate === item ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "text-[var(--color-muted)]"}`}>
              {item}
            </span>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={pending || (bundle.job.id !== "job_rain" && bundle.job.id !== "job_orchard")} onClick={() => start(async () => {
            await resetAction(bundle.job.id);
            setLiveGate("analysis");
            setMessage("Reset. Paused before analysis.");
            router.refresh();
          })}>
            Reset to seeded brief
          </Button>
          <Button variant="ghost" disabled={pending || !gate} onClick={() => start(async () => {
            const result = await advanceAction(bundle.job.id);
            if (result.ok) {
              const next = /before ([a-z]+)/i.exec(result.message)?.[1]?.toLowerCase();
              if (next) setLiveGate(next);
              setMessage(result.message);
            } else setMessage(result.error);
            router.refresh();
          })}>
            Continue
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => start(async () => {
            const result = await deliverAction(bundle.job.id);
            setMessage("status" in result && result.status === "blocked" ? result.reason : "error" in result ? result.error : "Sent");
          })}>
            Agent tries to deliver
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => start(async () => {
            const result = await approveDeliveryAction(bundle.job.id);
            setMessage(result.ok ? "Human approved final delivery." : result.error);
          })}>
            Approve final delivery
          </Button>
          <Link href={`/jobs/${bundle.job.id}`} className="rounded-full border px-4 py-2 text-sm">Job detail</Link>
        </div>
        {message ? <p className="mt-4 text-lg">{message}</p> : null}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfitabilityPanel jobId={bundle.job.id} economics={bundle.economics} ledger={bundle.ledger} />
        <section className="panel p-4">
          <h2 className="text-sm font-medium">Cost ledger</h2>
          <p className="mt-1 text-2xl">{formatUsdAuto(actual)}</p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {bundle.ledger.map((entry) => (
                <tr key={entry.id} className="border-t border-[var(--color-line)]">
                  <td className="py-2">{entry.label}</td>
                  <td className="py-2 text-right">{formatUsdAuto(entry.amountMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <section className="panel p-4">
        <h2 className="text-sm font-medium">Deliverables</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {bundle.generations.filter((generation) => generation.output?.assets.length).map((generation) => (
            <a key={generation.id} href={generation.output?.assets[0]?.sourceUrl} className="rounded-lg border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={generation.output?.assets[0]?.sourceUrl} alt={generation.stepId} className="h-40 w-full rounded object-cover" />
              <div className="mt-2 text-sm">{generation.stepId}</div>
              <div className="text-xs text-[var(--color-muted)]">{generation.modelId}</div>
            </a>
          ))}
        </div>
        {bundle.messages.filter((item) => item.kind === "delivery" || item.kind === "escalation").slice(-3).map((item) => (
          <article key={item.id} className="mt-4 rounded-lg border p-3">
            <p className="kicker">{item.kind} · {item.status}</p>
            <h3 className="mt-1 text-sm font-medium">{item.subject}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p>
            <p className="mt-2 text-xs text-[var(--color-muted)]">{item.reason}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
