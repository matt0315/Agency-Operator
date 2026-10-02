import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ClipboardList, Library, Mail, Plug, Plus, ScrollText, SlidersHorizontal, LayoutTemplate, type LucideIcon } from "lucide-react";
import Link from "next/link";
import "./globals.css";
import { hydrateProcessEnv } from "@/lib/cloudflare-env";
import { analysisMode, generationMode } from "@/lib/mode";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agency Operator",
  description: "Internal operating system for a one-person AI creative studio.",
};

const links: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Jobs", href: "/", icon: ClipboardList },
  { label: "New job", href: "/jobs/new", icon: Plus },
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Catalog", href: "/catalog", icon: Library },
  { label: "Autonomy", href: "/settings/autonomy", icon: SlidersHorizontal },
  { label: "Connection", href: "/settings/connection", icon: Plug },
  { label: "Audit", href: "/audit", icon: ScrollText },
  { label: "Signups", href: "/settings/signups", icon: Mail },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await hydrateProcessEnv();
  const analysis = analysisMode();
  const generation = generationMode();
  const mock = analysis === "mock" && generation === "mock";
  return (
    <html lang="en">
      <body className={`${sans.className} ${mono.variable}`}>
        <div className="mx-auto min-h-screen max-w-[1440px] px-5 py-5">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-line)] pb-4">
            <div>
              <Link href="/" className="text-xl font-medium tracking-tight">
                Agency Operator
              </Link>
              <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
                Paste a brief. The studio runs it inside your limits. You approve delivery.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {mock ? <span className="kicker rounded-full border border-[var(--color-accent)] px-2 py-1 text-[var(--color-accent)]">Mock mode</span> : null}
              <span className="kicker rounded-full border px-2 py-1">Analysis {analysis}</span>
              <span className="kicker rounded-full border px-2 py-1">Generation {generation}</span>
              <form action="/api/logout" method="post">
                <button className="kicker rounded-full border px-2 py-1" type="submit">Log out</button>
              </form>
            </div>
          </header>
          <nav className="mb-6 flex flex-wrap gap-2">
            {links.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
