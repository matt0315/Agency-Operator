export function formatUsd(micros: number | null | undefined, digits = 2): string {
  if (micros == null || Number.isNaN(micros)) return "—";
  const sign = micros < 0 ? "-" : "";
  const abs = Math.abs(micros) / 1_000_000;
  return (
    sign +
    "$" +
    abs.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

export function formatUsdAuto(micros: number | null | undefined): string {
  if (micros == null) return "—";
  const abs = Math.abs(micros) / 1_000_000;
  const digits = abs !== 0 && abs < 1 ? 4 : 2;
  return formatUsd(micros, digits);
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

export function parseDollarsToMicros(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000);
}

export function microsToDollarInput(micros: number): string {
  const n = micros / 1_000_000;
  return n.toFixed(n >= 100 ? 0 : 2);
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function hoursUntil(deadlineAt: string, now = new Date()): number {
  return (new Date(deadlineAt).getTime() - now.getTime()) / 3_600_000;
}
