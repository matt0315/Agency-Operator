import { AutonomyForm } from "@/components/autonomy-form";
import { readSettings } from "@/lib/service";

export const dynamic = "force-dynamic";

export default function AutonomyPage() {
  const settings = readSettings();
  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-medium">Autonomy settings</h1>
      <p className="text-sm text-[var(--color-muted)]">
        Routine work runs after one paste. A person still resolves rights, raises a ceiling, changes the route, and approves final delivery. Marketplace messages stay drafts.
      </p>
      <AutonomyForm initial={settings} />
    </main>
  );
}
