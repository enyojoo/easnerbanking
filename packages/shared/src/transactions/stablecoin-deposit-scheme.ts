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
