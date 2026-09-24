import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "solid",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "danger" }) {
  const styles = {
    solid: "bg-[var(--color-accent)] text-[#1a1208] hover:brightness-110",
    ghost: "bg-transparent text-[var(--color-ink)] hover:bg-white/5",
    danger: "bg-transparent text-[var(--color-bad)] hover:bg-white/5",
  }[variant];
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm font-medium disabled:opacity-40",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="kicker">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-lg border border-[var(--color-line)] bg-[#141210] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]",
        props.className,
      )}
    />
  );
}

export function Area(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full rounded-lg border border-[var(--color-line)] bg-[#141210] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]",
        props.className,
      )}
    />
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  const toneClass = {
    neutral: "text-[var(--color-muted)]",
    good: "text-[var(--color-good)]",
    warn: "text-[var(--color-warn)]",
    bad: "text-[var(--color-bad)]",
    accent: "text-[var(--color-accent)]",
  }[tone];
  return <span className={cx("kicker rounded-full border border-[var(--color-line)] px-2 py-1", toneClass)}>{children}</span>;
}
