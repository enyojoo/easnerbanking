import type { WalletRecipientRow } from "./validate-recipient"

/**
 * Mobile and legacy writes often store wallet metadata only in `bank_name`
 * (`Wallet (USDC/Solana)`) without `wallet_network`. Client list views infer
 * network from the label; quote/execute must do the same.
 */
export function coerceWalletRecipientRow(row: WalletRecipientRow): WalletRecipientRow {
  const bankName = String(row.bank_name || "").trim()
  const walletMatch = bankName.match(/^Wallet\s*\((.*)\)\s*$/i)
  if (!walletMatch) return row

  const descriptor = (walletMatch[1] || "").trim()
  let assetFromLabel: string | undefined
  let networkFromLabel: string | undefined
  if (descriptor.includes("/")) {
    const [asset, network] = descriptor.split("/").map((p) => p.trim())
    assetFromLabel = asset || undefined
    networkFromLabel = network || undefined
  } else {
    networkFromLabel = descriptor || undefined
  }

  const currency = assetFromLabel
    ? assetFromLabel.toUpperCase()
    : String(row.currency || "").trim().toUpperCase()
  const wallet_network =
    String(row.wallet_network || "").trim() || networkFromLabel || row.wallet_network

  return {
    ...row,
    currency,
    wallet_network,
  }
}
