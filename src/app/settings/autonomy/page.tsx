import { AutonomyForm } from "@/components/autonomy-form";
import { readSettings } from "@/lib/service";

export const dynamic = "force-dynamic";

export default function AutonomyPage() {
  const settings = readSettings();
  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-medium">Autonomy settings</h1>
      <p className="text-sm text-[var(--color-muted)]">
        The agent can run the routine. A person still accepts the contract, raises the ceiling, resolves rights, and approves final delivery.
      </p>
      <AutonomyForm initial={settings} />
    </main>
  );
}
