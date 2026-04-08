/** Extra currency lists from JSON/DB may contain null, numbers, or junk — never call string methods blindly in `.map`. */
export function sanitizeCurrencyCodeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const c of raw) {
    if (c == null) continue
    if (typeof c !== "string" && typeof c !== "number") continue
    const s = String(c).trim().toUpperCase()
    if (s) out.push(s)
  }
  return out
}

/**
 * Human-readable labels from JSONB (e.g. `payout_corridors.providers`). cmdk/React keyed lists call
 * string methods on `value` — null entries crash with `toString` / `toUpperCase` inside `Array.map`.
 */
export function sanitizeStringLabelList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const x of raw) {
    if (x == null) continue
    if (typeof x !== "string" && typeof x !== "number") continue
    const s = String(x).trim()
    if (s) out.push(s)
  }
  return out
}
