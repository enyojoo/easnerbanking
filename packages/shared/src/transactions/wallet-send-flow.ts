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

const WALLET_SEND_LIST_PRODUCT_LABEL = "Stablecoin Transfer"

export function walletSendListProductLabel(): string {
  return WALLET_SEND_LIST_PRODUCT_LABEL
}

/** List/detail hero currency: 1:1 USDC→USD and EURC→EUR use balance currency, not asset ticker. */
export function walletSendUserFacingDisplayCurrency(input: {
  receiveCurrency: string
  sendCurrency: string
  executionModel?: string | null
}): string {
  const receive = String(input.receiveCurrency || "").trim().toUpperCase()
  const send = String(input.sendCurrency || "USD").trim().toUpperCase()
  const model = String(input.executionModel ?? "").trim().toLowerCase()
  if (receive === "USDC" && (send === "USD" || model === "direct_turnkey")) return "USD"
  if (receive === "EURC" && (send === "EUR" || model === "direct_turnkey")) return "EUR"
  return receive || send || "USD"
}

export function resolveWalletSendTransferMethod(
  stored: string | null | undefined,
  receiveAsset: string,
  receiveNetwork: string,
): string {
  const candidate = String(stored ?? "").trim()
  return candidate && !/^bank transfer$/i.test(candidate)
    ? candidate
    : formatWalletSendTransferMethod(receiveAsset, receiveNetwork)
}
