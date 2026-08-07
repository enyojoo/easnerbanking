/** Wallet send execution routing: Turnkey direct vs Relay bridge. */

export type WalletSendExecutionModel = "direct_turnkey" | "relay_bridge"

/** @deprecated Use relay_bridge; kept for in-flight session dual-read. */
export type LegacyWalletSendExecutionModel = WalletSendExecutionModel | "lifi_bridge"

export function isDirectTurnkeyCorridor(receiveAsset: string, receiveNetwork: string): boolean {
  const asset = String(receiveAsset || "").toUpperCase()
  const network = String(receiveNetwork || "").trim()
  return (asset === "USDC" && network === "Solana") || (asset === "EURC" && network === "Solana")
}

export function isBridgeExecutionModel(model: string | null | undefined): boolean {
  const m = String(model || "").trim()
  return m === "relay_bridge" || m === "lifi_bridge"
}

export function resolveWalletSendExecutionModel(
  receiveAsset: string,
  receiveNetwork: string,
): WalletSendExecutionModel {
  return isDirectTurnkeyCorridor(receiveAsset, receiveNetwork) ? "direct_turnkey" : "relay_bridge"
}

export function normalizeWalletSendExecutionModel(
  model: string | null | undefined,
): WalletSendExecutionModel {
  if (model === "direct_turnkey") return "direct_turnkey"
  if (isBridgeExecutionModel(model)) return "relay_bridge"
  return resolveWalletSendExecutionModel("", "")
}

export function settlementAssetForBalance(balanceCurrency: string): "USDC" | "EURC" {
  return balanceCurrency.trim().toUpperCase() === "EUR" ? "EURC" : "USDC"
}
