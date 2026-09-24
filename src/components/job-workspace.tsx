"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  analyzeAction,
  applyRevisionAction,
  approveAction,
  approveDeliveryAction,
  cancelAction,
  deliverAction,
  deliveryDraftAction,
  generateAction,
  overrideAction,
  pollAction,
  qaAction,
  rejectAction,
  retryAction,
  revisionAction,
} from "@/app/actions";
import { listModels } from "@/lib/catalog";
import { computeEconomics } from "@/lib/economics";
import { formatUsdAuto, formatWhen } from "@/lib/format";
import { ROUTE_STORY } from "@/lib/router";
import type { JobBundle, RouteStep } from "@/lib/types";
import { ProfitabilityPanel } from "./profitability";
import { Badge, Button } from "./ui";

const TABS = ["Brief", "Decision", "Workflow", "Costs", "Outputs", "Revisions", "Client", "Audit"] as const;

export function JobWorkspace({ bundle, initialTab = "Brief" }: { bundle: JobBundle; initialTab?: (typeof TABS)[number] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS.includes(initialTab) ? initialTab : "Brief");
  const [note, setNote] = useState("Make the final reveal warmer and more hopeful.");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const analysis = bundle.analyses.filter((row) => row.kind === "human").at(-1) ?? bundle.analyses.at(-1);
  const steps = bundle.workflow?.steps ?? [];
  const economics = useMemo(() => {
    if (!analysis) return bundle.economics;
    return computeEconomics({
      steps,
      clientPriceMicros: bundle.job.clientPriceMicros,
      sourceFeeBps: bundle.job.sourceFeeBps,
      contingencyBps: bundle.job.contingencyBps,
      targetMarginBps: bundle.job.targetMarginBps,
      maxProductionMicros: bundle.job.maxProductionMicros,
    });
  }, [analysis, steps, bundle]);

  function run(task: () => Promise<{ ok?: boolean; error?: string; message?: string; reason?: string; status?: string } | void>) {
    start(async () => {
      const result = await task();
      if (result && "error" in result && result.error) setMessage(result.error);
      else if (result && "reason" in result && result.reason) setMessage(result.reason);
      else if (result && "message" in result && result.message) setMessage(result.message);
      else setMessage(null);
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <header className="panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="kicker">{bundle.job.source}</p>
              <h1 className="mt-1 text-2xl font-medium tracking-tight">{bundle.job.title}</h1>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                {bundle.client.name} · due {formatWhen(bundle.job.deadlineAt)} · {formatUsdAuto(bundle.job.clientPriceMicros)}
              </p>
            </div>
            <Badge tone={bundle.job.status === "rejected" ? "bad" : bundle.job.status === "delivered" ? "good" : "accent"}>
              {bundle.job.status.replaceAll("_", " ")}
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run(() => analyzeAction(bundle.job.id))}>
              Analyze brief
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => approveAction(bundle.job.id))}>
              Approve workflow
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(async () => generateAction(bundle.job.id))}>
              Generate
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => qaAction(bundle.job.id))}>
              Run QA
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => run(async () => rejectAction(bundle.job.id))}>
              Reject
            </Button>
            <Link href={`/jobs/${bundle.job.id}/review`} className="rounded-full border px-4 py-2 text-sm">
              Review analysis
            </Link>
            <Link href={`/jobs/${bundle.job.id}/record`} className="rounded-full border px-4 py-2 text-sm">
              Recording mode
            </Link>
          </div>
          {message ? <p className="mt-3 text-sm text-[var(--color-warn)]">{message}</p> : null}
          <ol className="mt-4 grid gap-2 md:grid-cols-3">
            {ROUTE_STORY.map((item, index) => (
              <li key={item} className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-muted)]">
                <span className="kicker mr-2">{index + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        </header>

        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button key={item} className={`rounded-full border px-3 py-1.5 text-sm ${tab === item ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "text-[var(--color-muted)]"}`} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>

        {tab === "Brief" ? (
          <section className="panel space-y-3 p-4">
            <h2 className="text-sm font-medium">Pasted brief</h2>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink)]">{bundle.job.rawBrief}</pre>
            <p className="text-xs text-[var(--color-muted)]">{bundle.job.clientNotes}</p>
          </section>
        ) : null}

        {tab === "Decision" && analysis ? (
          <section className="panel space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={analysis.decision.decision === "accept" ? "good" : analysis.decision.decision === "reject" ? "bad" : "warn"}>
                {analysis.decision.decision.replaceAll("_", " ")}
              </Badge>
              <span className="text-xs text-[var(--color-muted)]">
                {analysis.kind} version · advisory {analysis.analysis.decision} · confidence {analysis.analysis.confidence}
              </span>
            </div>
            <p className="text-sm">{analysis.analysis.conciseSummary}</p>
            <ul className="space-y-1 text-sm text-[var(--color-muted)]">
              {analysis.decision.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <div className="grid gap-3 md:grid-cols-2">
              <List title="Deliverables" items={analysis.analysis.deliverables.map((item) => `${item.name} · ${item.format} · ${item.aspectRatio} · ${item.durationSeconds ?? "still"} · ${item.resolution}`)} />
              <List title="Missing" items={analysis.analysis.missingAssets} />
              <List title="Questions" items={analysis.analysis.questionsForClient} />
              <List title="Rights" items={analysis.analysis.rightsAndConsentFlags.map((flag) => `${flag.kind}: ${flag.detail}`)} />
            </div>
          </section>
        ) : null}

        {tab === "Workflow" ? (
          <section className="space-y-3">
            {steps.map((step) => (
              <StepCard key={step.id} step={step} jobId={bundle.job.id} onOverride={(modelId) => run(() => overrideAction(bundle.job.id, step.id, modelId))} />
            ))}
          </section>
        ) : null}

        {tab === "Costs" ? (
          <section className="panel p-4">
            <h2 className="text-sm font-medium">Cost ledger</h2>
            <table className="mt-3 w-full text-left text-sm">
              <tbody>
                {bundle.ledger.map((entry) => (
                  <tr key={entry.id} className="border-t border-[var(--color-line)]">
                    <td className="py-2">{entry.label}</td>
                    <td className="py-2 text-right">{formatUsdAuto(entry.amountMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bundle.ledger.length === 0 ? <p className="mt-2 text-sm text-[var(--color-muted)]">No spend recorded.</p> : null}
          </section>
        ) : null}

        {tab === "Outputs" ? (
          <section className="grid gap-3 md:grid-cols-2">
            {bundle.generations.map((generation) => (
              <article key={generation.id} className="panel p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{generation.stepId}</h3>
                  <Badge tone={generation.appStatus === "completed" ? "good" : generation.appStatus === "failed" ? "bad" : "warn"}>
                    {generation.appStatus}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {generation.modelId}
                  <br />
                  Provider {generation.providerStatus ?? "—"} · estimate {formatUsdAuto(generation.estimateMicros)} · actual {formatUsdAuto(generation.actualMicros)}
                </p>
                {generation.output?.assets.map((asset) => (
                  <a key={asset.sourceUrl} href={asset.sourceUrl} className="mt-3 block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.sourceUrl} alt={generation.stepId} className="max-h-56 w-full rounded-lg object-cover" />
                  </a>
                ))}
                {generation.error ? <p className="mt-2 text-xs text-[var(--color-bad)]">{generation.error}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => run(() => pollAction(generation.id, bundle.job.id))}>Refresh</Button>
                  <Button variant="ghost" onClick={() => run(() => cancelAction(generation.id, bundle.job.id))}>Cancel if queued</Button>
                  <Button variant="ghost" onClick={() => run(() => retryAction(generation.id, bundle.job.id))}>Retry</Button>
                </div>
              </article>
            ))}
            {bundle.qaReports.map((report) => (
              <article key={report.id} className="panel p-3 md:col-span-2">
                <h3 className="text-sm font-medium">QA · {report.verdict.replaceAll("_", " ")}</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {report.checks.map((check) => (
                    <li key={check.id} className="flex justify-between gap-3">
                      <span>{check.label}</span>
                      <span className="text-[var(--color-muted)]">{check.result} — {check.note}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm">{report.recommendedAction}</p>
              </article>
            ))}
          </section>
        ) : null}

        {tab === "Revisions" ? (
          <section className="panel space-y-3 p-4">
            {bundle.revisions.map((revision) => (
              <article key={revision.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={revision.classification === "included" ? "good" : "warn"}>{revision.classification.replaceAll("_", " ")}</Badge>
                  <Badge>{revision.approval}</Badge>
                </div>
                <p className="mt-2 text-sm">{revision.clientNote}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {revision.affectedDeliverable} · {revision.recommendedAction} · {formatUsdAuto(revision.expectedIncrementalMicros)}
                </p>
                {revision.approval === "pending" && revision.classification === "included" ? (
                  <Button className="mt-3" onClick={() => run(() => applyRevisionAction(bundle.job.id, revision.id))}>Apply included revision</Button>
                ) : null}
              </article>
            ))}
            <label className="block text-sm">
              Client note
              <textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-lg border bg-transparent p-2" rows={3} />
            </label>
            <Button onClick={() => run(async () => revisionAction(bundle.job.id, note))}>Interpret revision</Button>
          </section>
        ) : null}

        {tab === "Client" ? (
          <section className="space-y-3">
            <article className="panel p-4 text-sm">
              <h2 className="font-medium">{bundle.client.name}</h2>
              <p className="mt-1 text-[var(--color-muted)]">{bundle.client.channel}</p>
              <p className="mt-2">{bundle.client.memory.tone}</p>
              <p className="mt-2 text-xs text-[var(--color-muted)]">{bundle.client.memory.likenessConsent}</p>
            </article>
            {bundle.messages.map((message) => (
              <article key={message.id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{message.kind.replaceAll("_", " ")}</Badge>
                  <Badge tone={message.status === "sent" ? "good" : message.status === "blocked" ? "bad" : "warn"}>{message.status}</Badge>
                </div>
                <h3 className="mt-2 text-sm font-medium">{message.subject}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                <p className="mt-2 text-xs text-[var(--color-muted)]">{message.reason}</p>
              </article>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => run(async () => deliveryDraftAction(bundle.job.id))}>Draft delivery note</Button>
              <Button variant="ghost" onClick={() => run(() => deliverAction(bundle.job.id))}>Try automatic delivery</Button>
              <Button onClick={() => run(() => approveDeliveryAction(bundle.job.id))}>Approve final delivery</Button>
            </div>
          </section>
        ) : null}

        {tab === "Audit" ? (
          <section className="panel divide-y divide-[var(--color-line)] p-4">
            {bundle.audit.map((entry) => (
              <div key={entry.id} className="py-2">
                <div className="kicker">{entry.kind}</div>
                <p className="text-sm">{entry.summary}</p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <ProfitabilityPanel jobId={bundle.job.id} economics={economics} ledger={bundle.ledger} />
        <section className="panel p-4 text-sm">
          <h2 className="font-medium">Approval timeline</h2>
          <ul className="mt-3 space-y-2 text-[var(--color-muted)]">
            <li>Intake is manual. Nothing is scraped or auto-applied.</li>
            <li>Analysis can recommend. A person approves the first workflow and the ceiling.</li>
            <li>Inside that ceiling, repairs and included revisions can run. Budget increases stop.</li>
            <li>Final delivery stays blocked until Approve final delivery.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="kicker">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li className="text-[var(--color-muted)]">None</li>}
      </ul>
    </div>
  );
}

function StepCard({ step, jobId, onOverride }: { step: RouteStep; jobId: string; onOverride: (modelId: string) => void }) {
  const models = listModels().filter((model) => model.media === (step.unit === "second" ? "video" : "image"));
  void jobId;
  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{step.role}</Badge>
        {step.conditional ? <Badge tone="warn">If needed</Badge> : null}
        <h3 className="text-sm font-medium">{step.modelName}</h3>
      </div>
      <p className="mt-2 text-sm">{step.purpose}</p>
      <dl className="mt-3 grid gap-2 text-xs text-[var(--color-muted)] md:grid-cols-2">
        <div>Why: {step.why}</div>
        <div>Failure: {step.failureMode}</div>
        <div>Alternative: {step.alternativeName}. {step.alternativeNote}</div>
        <div>
          {step.attempts} attempts · {step.quantity} {step.unit} · {formatUsdAuto(step.unitCostMicros)} each · max {formatUsdAuto(step.maxAuthorizedMicros)}
        </div>
      </dl>
      <label className="mt-3 block text-xs text-[var(--color-muted)]">
        Manual model override
        <select className="mt-1 w-full rounded border bg-[#141210] px-2 py-2 text-sm text-[var(--color-ink)]" value={step.modelId} onChange={(event) => onOverride(event.target.value)}>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} {model.usdMicros == null ? "(estimate required)" : ""}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}
