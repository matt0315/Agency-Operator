export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-md">
      <h1 className="text-2xl font-medium">Operator login</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        This workspace can spend model money. One password opens it. Marketplace actions stay off either way.
      </p>
      <form action="/api/login" method="post" className="panel mt-4 space-y-3 p-4">
        <label className="block text-sm">
          Password
          <input name="password" type="password" required autoFocus className="mt-1 w-full rounded border bg-transparent px-3 py-2" />
        </label>
        {error ? <p className="text-sm text-[var(--color-bad)]">{error === "limited" ? "Too many attempts. Wait and try again." : "That password did not match."}</p> : null}
        <button className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[#1a1208]" type="submit">
          Enter
        </button>
      </form>
    </main>
  );
}
