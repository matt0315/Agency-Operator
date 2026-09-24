"use client";

import { commercialsAction } from "@/app/actions";
import { formatBps, formatUsdAuto, microsToDollarInput } from "@/lib/format";
import type { Economics, LedgerEntry } from "@/lib/types";

export function ProfitabilityPanel({
  jobId,
  economics,
  ledger,
  editable = true,
}: {
  jobId: string;
  economics: Economics | null;
  ledger: LedgerEntry[];
  editable?: boolean;
}) {
  const actual = ledger.reduce((sum, entry) => sum + entry.amountMicros, 0);
  if (!economics) {
    return (
      <section className="panel p-4">
        <h2 className="text-sm font-medium">Profitability</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">Analyze the brief to price the route.</p>
      </section>
    );
  }
  const rows = [
    ["Client price", formatUsdAuto(economics.clientPriceMicros)],
    ["Source / channel fee", `${formatUsdAuto(economics.sourceFeeMicros)} · ${formatBps(economics.sourceFeeBps)}`],
    ["Estimated generation", formatUsdAuto(economics.generationMicros)],
    ["Contingency", `${formatUsdAuto(economics.contingencyMicros)} · ${formatBps(economics.contingencyBps)}`],
    ["Production total", formatUsdAuto(economics.productionMicros)],
    ["Expected gross profit", formatUsdAuto(economics.grossProfitMicros)],
    ["Expected gross margin", economics.grossMarginBps == null ? "—" : formatBps(economics.grossMarginBps)],
    ["Production ceiling", formatUsdAuto(economics.maxProductionMicros)],
    ["Ledger spend", formatUsdAuto(actual)],
  ];
  return (
    <section className="panel p-4" id="profitability">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Profitability</h2>
        <span className="kicker">{economics.priceDataComplete ? "Catalog rates" : "Price missing"}</span>
      </div>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-[var(--color-muted)]">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
        Generation estimates use authorized attempts and published representative rates. Conditional repairs are excluded until they run. The ledger charges completed work only.
      </p>
      {editable ? (
        <form action={commercialsAction} className="mt-4 grid grid-cols-2 gap-2">
          <input type="hidden" name="jobId" value={jobId} />
          <label className="text-xs text-[var(--color-muted)]">
            Price $
            <input name="price" defaultValue={microsToDollarInput(economics.clientPriceMicros)} className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-sm text-[var(--color-ink)]" />
          </label>
          <label className="text-xs text-[var(--color-muted)]">
            Fee %
            <input name="fee" defaultValue={(economics.sourceFeeBps / 100).toFixed(1)} className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-sm text-[var(--color-ink)]" />
          </label>
          <label className="text-xs text-[var(--color-muted)]">
            Contingency %
            <input name="contingency" defaultValue={(economics.contingencyBps / 100).toFixed(1)} className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-sm text-[var(--color-ink)]" />
          </label>
          <label className="text-xs text-[var(--color-muted)]">
            Target margin %
            <input name="margin" defaultValue={(economics.targetMarginBps / 100).toFixed(1)} className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-sm text-[var(--color-ink)]" />
          </label>
          <label className="col-span-2 text-xs text-[var(--color-muted)]">
            Production ceiling $
            <input name="ceiling" defaultValue={microsToDollarInput(economics.maxProductionMicros)} className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-sm text-[var(--color-ink)]" />
          </label>
          <button className="col-span-2 rounded-full border px-3 py-2 text-sm" type="submit">
            Recalculate
          </button>
        </form>
      ) : null}
    </section>
  );
}
