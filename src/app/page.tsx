import Link from "next/link";
import { boardHint } from "@/lib/autonomy";
import { formatUsdAuto, formatWhen } from "@/lib/format";
import { dashboardJobs } from "@/lib/service";
import { JOB_STATUSES, PIPELINE_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const jobs = dashboardJobs();
  const groups = JOB_STATUSES.map((status) => ({
    status,
    label: PIPELINE_LABEL[status],
    jobs: jobs.filter((job) => job.status === status),
  }));
  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Pipeline</h1>
        <Link href="/jobs/new" className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[#1a1208]">
          New job
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
        {groups.map((group) => (
          <section key={group.status} className="panel min-h-48 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm">{group.label}</h2>
              <span className="kicker">{group.jobs.length}</span>
            </div>
            <div className="space-y-2">
              {group.jobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="block rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 hover:border-[var(--color-accent)]">
                  <div className="text-sm font-medium leading-snug">{job.title}</div>
                  <div className="mt-2 text-xs text-[var(--color-muted)]">{job.source}</div>
                  <div className="mt-1 text-xs text-[var(--color-accent)]">{boardHint(job.status)}</div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{formatUsdAuto(job.clientPriceMicros)}</span>
                    <span className="text-[var(--color-muted)]">{formatWhen(job.deadlineAt)}</span>
                  </div>
                </Link>
              ))}
              {group.jobs.length === 0 ? <p className="text-xs text-[var(--color-muted)]">Empty</p> : null}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
