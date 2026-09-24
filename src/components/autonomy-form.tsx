"use client";

import { useState, useTransition } from "react";
import { settingsAction } from "@/app/actions";
import { fullyAutomaticPreset } from "@/lib/autonomy";
import { formatUsdAuto, microsToDollarInput, parseDollarsToMicros } from "@/lib/format";
import type { AutonomySettings } from "@/lib/types";
import { Button } from "./ui";

export function AutonomyForm({ initial }: { initial: AutonomySettings }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const toggles = [
    ["intakeQuestions", "Intake questions"],
    ["proposals", "Proposals"],
    ["progressUpdates", "Progress updates"],
    ["conceptShare", "Concept share"],
    ["changeOrders", "Change orders"],
    ["feedbackRequests", "Feedback requests"],
  ] as const;
  const pauses = [
    ["likenessOrVoice", "Likeness or voice"],
    ["unclearOwnership", "Unclear asset ownership"],
    ["factualClaims", "Factual advertising claims"],
    ["exactPackagingOrRegulatedCopy", "Exact packaging or regulated copy"],
    ["negativeMargin", "Negative expected margin"],
    ["missedDeadlineRisk", "Missed deadline risk"],
    ["clientDispute", "Client dispute"],
  ] as const;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          await settingsAction(settings);
          setSaved(true);
        });
      }}
    >
      <section className="panel space-y-3 p-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.fullyAutomaticWithinLimits}
            onChange={(event) => setSettings({ ...settings, fullyAutomaticWithinLimits: event.target.checked })}
          />
          <span>
            <span className="font-medium">Fully automatic within limits</span>
            <span className="mt-1 block text-[var(--color-muted)]">
              One paste, then watch. Analysis, pricing, the route, generation, QA, and in-cap repair run alone. Rights, marketplace actions, spend caps, scope changes, and final delivery still stop.
            </span>
          </span>
        </label>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.autoAdvanceGenerations} onChange={(event) => setSettings({ ...settings, autoAdvanceGenerations: event.target.checked })} />
            Auto-advance generation after the workflow is approved
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.autoRepair} onChange={(event) => setSettings({ ...settings, autoRepair: event.target.checked })} />
            Auto-repair inside the spend caps
          </label>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSettings(fullyAutomaticPreset(settings));
            setSaved(false);
          }}
        >
          Apply fully automatic preset
        </Button>
      </section>
      <section className="panel grid gap-3 p-4 md:grid-cols-3">
        <Money label="Max automatic spend per job" value={settings.maxAutomaticSpendPerJobMicros} onChange={(value) => setSettings({ ...settings, maxAutomaticSpendPerJobMicros: value })} />
        <Money label="Max automatic spend per repair" value={settings.maxAutomaticSpendPerRepairMicros} onChange={(value) => setSettings({ ...settings, maxAutomaticSpendPerRepairMicros: value })} />
        <label className="text-sm">
          Max attempts per step
          <input className="mt-1 w-full rounded border bg-transparent px-2 py-2" type="number" min={1} value={settings.maxAttemptsPerStep} onChange={(event) => setSettings({ ...settings, maxAttemptsPerStep: Number(event.target.value) })} />
        </label>
      </section>
      <section className="panel p-4">
        <h2 className="text-sm font-medium">Messages that may send themselves</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Everything else is drafted for approval. Concept share and change orders stay off in the fully automatic preset. Marketplace threads never send.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {toggles.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.autoSend[key]} onChange={(event) => setSettings({ ...settings, autoSend: { ...settings.autoSend, [key]: event.target.checked } })} />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.finalDeliveryRequiresApproval} onChange={(event) => setSettings({ ...settings, finalDeliveryRequiresApproval: event.target.checked })} />
            Final delivery always requires approval
          </label>
        </div>
      </section>
      <section className="panel p-4">
        <h2 className="text-sm font-medium">Always pause</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {pauses.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.alwaysPause[key]} onChange={(event) => setSettings({ ...settings, alwaysPause: { ...settings.alwaysPause, [key]: event.target.checked } })} />
              {label}
            </label>
          ))}
        </div>
      </section>
      <section className="panel p-4 text-sm text-[var(--color-muted)]">
        Allowed families: {settings.allowedModelFamilies.join(", ")}. Current caps {formatUsdAuto(settings.maxAutomaticSpendPerJobMicros)} per job and {formatUsdAuto(settings.maxAutomaticSpendPerRepairMicros)} per repair.
      </section>
      <Button disabled={pending} type="submit">Save autonomy settings</Button>
      {saved ? <p className="text-sm text-[var(--color-good)]">Saved.</p> : null}
    </form>
  );
}

function Money({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm">
      {label}
      <input className="mt-1 w-full rounded border bg-transparent px-2 py-2" defaultValue={microsToDollarInput(value)} onChange={(event) => onChange(parseDollarsToMicros(event.target.value) ?? value)} />
    </label>
  );
}
