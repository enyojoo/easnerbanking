export function isYcSendStillFundable(input: {
  status?: string | null
  expiresAt?: string | null
  nowMs?: number
}): boolean {
  const expiresMs = input.expiresAt ? new Date(input.expiresAt).getTime() : NaN
  if (Number.isFinite(expiresMs) && expiresMs <= (input.nowMs ?? Date.now())) return false
  const status = String(input.status ?? "").trim().toLowerCase()
  return !["expired", "failed", "cancelled", "canceled", "rejected"].some((value) =>
    status.includes(value),
  )
}

export function assessYcCrossBorderRelockFunding(input: {
  oldCryptoAmount: number
  newCryptoAmount: number
  processingFee: number
  marginAmount: number
  omnibusAvailable: number
}): { ok: boolean; relockGap: number; revenueAvailable: number } {
  const relockGap = Math.max(0, input.newCryptoAmount - input.oldCryptoAmount)
  const revenueAvailable = Math.max(0, input.processingFee + input.marginAmount)
  const coveredByRevenue = relockGap <= revenueAvailable + 0.000001
  const coveredByOmnibus =
    input.omnibusAvailable <= 0 || input.newCryptoAmount <= input.omnibusAvailable + 0.000001
  return { ok: coveredByRevenue && coveredByOmnibus, relockGap, revenueAvailable }
}
