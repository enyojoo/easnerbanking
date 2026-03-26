/** Map Noah GetBalancesResponse.Items (crypto) to mobile { USD, EUR } strings (best-effort). */
export function mapNoahBalancesToMobile(items: Array<Record<string, unknown>>): { USD: string; EUR: string } {
  let usd = 0
  let eur = 0
  for (const it of items) {
    const crypto = String(it.CryptoCurrency || "").toUpperCase()
    const avail = parseFloat(String(it.Available ?? "0")) || 0
    if (crypto.includes("USDC") || crypto === "USD") usd += avail
    if (crypto.includes("EURC") || crypto === "EUR") eur += avail
  }
  return { USD: String(usd), EUR: String(eur) }
}
