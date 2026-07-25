/** Union momo provider labels on payout_corridors.providers (avoid last-writer-wins across syncs). */
export function mergeCorridorProvidersColumn(existing: unknown, additions: string[]): string[] {
  const prior = Array.isArray(existing)
    ? existing.map((p) => String(p ?? "").trim()).filter(Boolean)
    : []
  const next = additions.map((p) => String(p ?? "").trim()).filter(Boolean)
  return [...new Set([...prior, ...next])].sort((a, b) => a.localeCompare(b))
}
