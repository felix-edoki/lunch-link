export function toCents(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("invalid number");
    return Math.round(input * 100);
  }
  const s = input.trim().replace(/[^\d.-]/g, "");
  if (!s) return 0;
  const [whole, frac = ""] = s.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const w = whole.replace(/-/g, "");
  const f = (frac + "00").slice(0, 2);
  return sign * (parseInt(w || "0", 10) * 100 + parseInt(f || "0", 10));
}

export function formatCents(cents: number, currency = "CAD"): string {
  const v = (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
  return v;
}
