/** Symbol + formatted amount (no trailing ISO code). */
export function formatMoneyDisplay(
  amount: number,
  currency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const code = String(currency || "USD").trim().toUpperCase()
  const min = options?.minimumFractionDigits ?? 2
  const max = options?.maximumFractionDigits ?? 2
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(amount)
  } catch {
    return amount.toLocaleString("en-US", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    })
  }
}
