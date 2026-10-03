import { formatWhen } from "@/lib/format";
import { listLaunchSignups } from "@/lib/launch-signup";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

export default async function SignupsPage() {
  const signups = await listLaunchSignups(await getSql());
  return (
    <main className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Launch signups</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Emails left on the public page. They stay in D1.
        </p>
      </div>
      {signups.length === 0 ? (
        <p className="panel p-4 text-sm text-[var(--color-muted)]">No launch signups yet.</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Referrer</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((signup) => (
                <tr key={`${signup.email}-${signup.createdAt}`} className="border-t border-[var(--color-line)] align-top">
                  <td className="px-4 py-3">
                    <a href={`mailto:${signup.email}`}>{signup.email}</a>
                    {signup.userAgent ? <div className="mt-1 max-w-xs break-all text-xs text-[var(--color-muted)]">{signup.userAgent}</div> : null}
                  </td>
                  <td className="px-4 py-3">{signup.name ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatWhen(signup.createdAt)}</td>
                  <td className="px-4 py-3 max-w-xs break-all text-xs text-[var(--color-muted)]">{signup.referrer ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
