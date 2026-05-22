function parseBalanceAmount(raw: string | undefined): number | null {
  const n = Number.parseFloat(String(raw ?? "").replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

/**
 * True when an authoritative balance read suddenly reports all wallet currencies
 * as zero but we already had a non-zero cached/snapshot balance.
 */
export function isSuspiciousAuthoritativeZeroRegression(
  source: string | undefined,
  usd: string | undefined,
  eur: string | undefined,
  previous: { USD?: string; EUR?: string } | null | undefined,
): boolean {
  if (source !== "db" && source !== "turnkey" && source !== "realtime") return false
  const prevUsd = parseBalanceAmount(previous?.USD)
  const prevEur = parseBalanceAmount(previous?.EUR)
  const hadNonZero =
    (prevUsd != null && prevUsd > 0) || (prevEur != null && prevEur > 0)
  if (!hadNonZero) return false
  const nextUsd = parseBalanceAmount(usd) ?? 0
  const nextEur = parseBalanceAmount(eur) ?? 0
  return nextUsd === 0 && nextEur === 0
}
