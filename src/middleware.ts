import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

async function secret(name: string): Promise<string | undefined> {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as Record<string, unknown>)[name];
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/demo") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV === "development" && process.env.APP_MODE === "mock") {
    return NextResponse.next();
  }

  const password = await secret("OPERATOR_PASSWORD");
  const sessionSecret = await secret("SESSION_SECRET");
  if (!password || !sessionSecret) {
    return new NextResponse("Agency Operator is not configured. Set OPERATOR_PASSWORD and SESSION_SECRET before serving.", {
      status: 503,
    });
  }

  if (pathname === "/api/login") return NextResponse.next();

  const valid = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret);
  if (valid) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|demo/).*)"],
};
