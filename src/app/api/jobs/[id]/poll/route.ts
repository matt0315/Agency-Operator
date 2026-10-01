import { resumeProduction } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const stage = await resumeProduction(id);
  return Response.json({ stage });
}
