import { isCorridorEnabled, listWalletSendCorridors } from "./corridors"

export type WalletRecipientRow = {
  id: string
  user_id: string
  account_number: string
  currency: string
  wallet_network?: string | null
  wallet_memo_tag?: string | null
  payee_easetag?: string | null
  full_name?: string | null
}

export function isWalletRecipientRow(row: Pick<WalletRecipientRow, "wallet_network" | "payee_easetag">): boolean {
  return Boolean(String(row.wallet_network || "").trim()) && !String(row.payee_easetag || "").trim()
}

export function walletReceiveAsset(row: WalletRecipientRow): string {
  return String(row.currency || "USDT").trim().toUpperCase()
}

export function walletReceiveNetwork(row: WalletRecipientRow): string {
  return String(row.wallet_network || "").trim()
}

export function walletDestinationAddress(row: WalletRecipientRow): string {
  return String(row.account_number || "").trim()
}

export function validateWalletRecipientForSend(row: WalletRecipientRow): { ok: true } | { ok: false; error: string } {
  if (!isWalletRecipientRow(row)) {
    return { ok: false, error: "Recipient is not a wallet address recipient." }
  }
  const asset = walletReceiveAsset(row)
  const network = walletReceiveNetwork(row)
  const address = walletDestinationAddress(row)
  if (!address) return { ok: false, error: "Wallet address is required." }
  if (!network) return { ok: false, error: "Wallet network is required." }
  if (!isCorridorEnabled(asset, network)) {
    return { ok: false, error: `Wallet send to ${asset} on ${network} is not enabled yet.` }
  }
  return { ok: true }
}

export function listEnabledCorridorKeys(): string[] {
  return listWalletSendCorridors()
    .filter((c) => c.enabled)
    .map((c) => `${c.asset}:${c.network}`)
}
