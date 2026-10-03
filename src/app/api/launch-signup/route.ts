import { handleLaunchSignup } from "@/lib/launch-signup";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await handleLaunchSignup(request, await getSql());
  } catch (error) {
    console.error("launch signup failed", error);
    return new Response("Could not save that signup. Try again shortly.", { status: 500 });
  }
}
