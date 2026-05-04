import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
import { getActiveWalletAddress } from "@/lib/wallet/turnkey-wallet-db"
import { getTurnkeyDisplayBalancesUsdEur } from "@/lib/wallet/turnkey-chain-balances"

export function assetForEasetagCurrency(c: "USD" | "EUR"): "USDC" | "EURC" {
  return c === "EUR" ? "EURC" : "USDC"
}

export async function resolvePayeeSolanaVaultAta(
  admin: SupabaseClient,
  input: { payeeUserId: string; payeeBusinessId: string | null; currency: "USD" | "EUR" },
): Promise<{ ata: string } | { error: string }> {
  const ownerType = input.payeeBusinessId ? "business" : "individual"
  const ownerRef = input.payeeBusinessId ?? input.payeeUserId
  const ownerId = await getWalletOwnerId(admin, ownerType, ownerRef)
  if (!ownerId) return { error: "payee_wallet_not_provisioned" }
  const asset = assetForEasetagCurrency(input.currency)
  const ata = await getActiveWalletAddress(admin, ownerId, "solana", asset, input.currency)
  if (!String(ata || "").trim()) return { error: "payee_wallet_not_provisioned" }
  return { ata: String(ata).trim() }
}

export async function preflightSenderOnChainStablecoinBalance(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
  currency: "USD" | "EUR",
  amountMajor: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bal = await getTurnkeyDisplayBalancesUsdEur(admin, ctx)
  if (bal.source !== "turnkey") return { ok: false, error: "chain_balance_unavailable" }
  const line = currency === "EUR" ? bal.EUR : bal.USD
  const have = Number.parseFloat(String(line)) || 0
  if (!Number.isFinite(have) || have + 1e-9 < amountMajor) return { ok: false, error: "insufficient_on_chain" }
  return { ok: true }
}

export async function resolveSenderTurnkeySubOrgId(
  admin: SupabaseClient,
  senderUserId: string,
  senderBusinessId: string | null,
): Promise<string | null> {
  const ownerType = senderBusinessId ? "business" : "individual"
  const ownerRef = senderBusinessId ?? senderUserId
  const ownerId = await getWalletOwnerId(admin, ownerType, ownerRef)
  if (!ownerId) return null
  const { data } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", ownerId)
    .maybeSingle()
  return String(data?.turnkey_sub_organization_id ?? "").trim() || null
}
