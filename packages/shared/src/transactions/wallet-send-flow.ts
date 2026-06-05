/** User-facing wallet send (balance → external wallet). */
export function isWalletSendOutRow(row: {
  direction?: unknown
  metadata?: Record<string, unknown> | null
}): boolean {
  const dir = String(row.direction ?? "").toLowerCase()
  if (dir !== "out") return false
  const meta = row.metadata
  if (!meta || typeof meta !== "object") return false
  return String(meta.activity_type ?? "").trim().toLowerCase() === "wallet_send"
}

const NETWORK_ABBREVIATIONS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  polygon: "MATIC",
  polygonpos: "MATIC",
  base: "BASE",
  tron: "TRX",
  arbitrum: "ARB",
  optimism: "OP",
}

/** Short network label for transfer method rows (e.g. Solana → SOL). */
export function abbreviateBlockchainNetwork(network: string): string {
  const raw = String(network || "").trim()
  if (!raw) return ""
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "")
  return NETWORK_ABBREVIATIONS[key] ?? raw.toUpperCase()
}

/** Customer-facing transfer method for wallet sends (e.g. USDC on SOL). */
export function formatWalletSendTransferMethod(receiveAsset: string, receiveNetwork: string): string {
  const asset = String(receiveAsset || "").trim().toUpperCase()
  const network = abbreviateBlockchainNetwork(receiveNetwork)
  return network ? `${asset} on ${network}` : asset
}
