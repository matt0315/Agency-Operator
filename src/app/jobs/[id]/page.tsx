import { notFound } from "next/navigation";
import { JobWorkspace } from "@/components/job-workspace";
import { getBundle } from "@/lib/service";

export const dynamic = "force-dynamic";

const TABS = ["Brief", "Decision", "Workflow", "Costs", "Outputs", "Revisions", "Client", "Audit"] as const;

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const bundle = getBundle(id);
  if (!bundle) notFound();
  const initialTab = TABS.find((item) => item.toLowerCase() === (tab || "").toLowerCase()) ?? "Brief";
  return <JobWorkspace bundle={bundle} initialTab={initialTab} />;
}
