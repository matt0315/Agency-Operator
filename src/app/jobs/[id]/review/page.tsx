import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/review-form";
import { getBundle } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = getBundle(id);
  if (!bundle) notFound();
  const current = bundle.analyses.filter((row) => row.kind === "human").at(-1) ?? bundle.analyses.at(-1);
  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Review analysis</h1>
        <Link href={`/jobs/${id}`} className="text-sm text-[var(--color-muted)]">Back to job</Link>
      </div>
      {!current ? <p className="text-sm text-[var(--color-muted)]">Analyze the brief first.</p> : <ReviewForm jobId={id} initial={current.analysis} />}
      <div className="grid gap-3 md:grid-cols-2">
        {bundle.analyses.map((row) => (
          <article key={row.id} className="panel p-4 text-sm">
            <p className="kicker">{row.kind} · {row.decision.decision}</p>
            <p className="mt-2">{row.analysis.conciseSummary}</p>
            <ul className="mt-2 space-y-1 text-[var(--color-muted)]">
              {row.decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </main>
  );
}
