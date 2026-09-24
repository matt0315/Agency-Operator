import { notFound } from "next/navigation";
import { RecordingConsole } from "@/components/recording-console";
import { getBundle } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = getBundle(id);
  if (!bundle) notFound();
  return <RecordingConsole bundle={bundle} />;
}
