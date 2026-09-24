import { formatWhen } from "@/lib/format";
import { globalAudit } from "@/lib/service";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  const entries = globalAudit();
  return (
    <main>
      <h1 className="mb-4 text-2xl font-medium">Audit log</h1>
      <div className="panel divide-y divide-[var(--color-line)]">
        {entries.map((entry) => (
          <article key={entry.id} className="grid gap-2 p-3 md:grid-cols-[140px_120px_1fr]">
            <time className="text-xs text-[var(--color-muted)]">{formatWhen(entry.createdAt)}</time>
            <span className="kicker">{entry.kind}</span>
            <p className="text-sm">{entry.summary}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
