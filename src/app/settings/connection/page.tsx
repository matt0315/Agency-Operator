import { ConnectionPanel } from "@/components/connection-panel";
import { generationMode } from "@/lib/mode";

export const dynamic = "force-dynamic";

export default function ConnectionPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-medium">Connection test</h1>
      <ConnectionPanel mode={generationMode()} />
    </main>
  );
}
