import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ClipboardList, Library, Plug, Plus, ScrollText, SlidersHorizontal, LayoutTemplate, type LucideIcon } from "lucide-react";
import Link from "next/link";
import "./globals.css";
import { analysisMode, generationMode } from "@/lib/mode";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

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
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const analysis = analysisMode();
  const generation = generationMode();
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
                Paste a brief. Qualify it. Price it. Approve the ceiling. Then generate.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="kicker rounded-full border px-2 py-1">Analysis {analysis}</span>
              <span className="kicker rounded-full border px-2 py-1">Generation {generation}</span>
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
