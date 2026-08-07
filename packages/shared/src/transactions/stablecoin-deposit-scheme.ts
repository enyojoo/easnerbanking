const STABLECOIN_NETWORK_LABELS: Record<string, string> = {
  solana: "Solana",
  tron: "Tron",
  ethereum: "Ethereum",
  polygon: "Polygon",
  polygonpos: "Polygon",
  base: "Base",
  arbitrum: "Arbitrum",
}

function resolveStablecoinAsset(sourceCurrency: string): string {
  const c = sourceCurrency.trim().toUpperCase()
  if (c === "EUR" || c === "EURC") return "EURC"
  if (c === "USDT") return "USDT"
  return "USDC"
}

function resolveNetworkLabel(paymentRail: string): string {
  const key = paymentRail.trim().toLowerCase()
  if (!key) return "Solana"
  return (
    STABLECOIN_NETWORK_LABELS[key] ??
    key.charAt(0).toUpperCase() + key.slice(1)
  )
}

/** Display label for inbound stablecoin deposits, e.g. `USDC on Solana`, `USDT on Tron`. */
export function formatStablecoinDepositSchemeLabel(input: {
  sourceCurrency?: string | null
  paymentRail?: string | null
  chain?: string | null
  asset?: string | null
}): string {
  const sourceCurrency = String(
    input.sourceCurrency ?? input.asset ?? "",
  ).trim()
  const rail = String(input.paymentRail ?? input.chain ?? "solana").trim()
  const asset = resolveStablecoinAsset(sourceCurrency)
  const network = resolveNetworkLabel(rail)
  return `${asset} on ${network}`
}

/** Balance currency credited for a receive asset (USDC/USDT → USD, EURC → EUR). */
export function receiveStablecoinCreditCurrency(asset: string): "USD" | "EUR" {
  return resolveStablecoinAsset(asset) === "EURC" ? "EUR" : "USD"
}

/**
 * Subtitle for receive stablecoin method rows (cash-row parity).
 * Fee-bearing rails (e.g. USDT on Tron) avoid partner jargon — plain “deposit fees”.
 */
export function receiveStablecoinDepositSubtitle(input: {
  asset: string
  network?: string | null
  status?: "active" | "provisioning" | "unavailable"
}): string {
  const status = input.status ?? "active"
  if (status === "provisioning") return "Setting up…"
  if (status === "unavailable") return "Unavailable"

  const asset = resolveStablecoinAsset(input.asset)
  const network = resolveNetworkLabel(String(input.network ?? ""))
  if (asset === "USDT" || network === "Tron") {
    return "Deposit fees apply and are deducted."
  }
  const credit = receiveStablecoinCreditCurrency(asset)
  return `Deposit ${asset} to credit your ${credit} Balance`
}

/** About / payment-instruction bullets for a stablecoin receive address. */
export function receiveStablecoinPaymentNotes(input: {
  asset: string
  network?: string | null
}): string[] {
  const asset = resolveStablecoinAsset(input.asset)
  const network = resolveNetworkLabel(String(input.network ?? "solana"))
  if (asset === "USDT" || network === "Tron") {
    return [
      "Only send USDT on Tron (TRC-20) to this address.",
      "Deposit fees apply and are deducted.",
      "Sending other assets or networks may result in permanent loss.",
      "Processing time: typically within minutes after on-chain confirmation.",
    ]
  }
  return [
    `Only send ${asset} on ${network} to this address.`,
    "Sending other assets or networks may result in permanent loss.",
    "Processing time: within seconds.",
  ]
}
