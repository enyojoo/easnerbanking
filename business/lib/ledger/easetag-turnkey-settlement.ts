import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
import { getTurnkeyDisplayBalancesUsdEur } from "@/lib/wallet/turnkey-chain-balances"

export function assetForEasetagCurrency(c: "USD" | "EUR"): "USDC" | "EURC" {
  return c === "EUR" ? "EURC" : "USDC"
}

export async function resolvePayeeSolanaVaultAta(
  admin: SupabaseClient,
  input: { payeeUserId: string; payeeBusinessId: string | null; currency: "USD" | "EUR" },
): Promise<{ ata: string; ownerVault: string } | { error: string }> {
  const ownerType = input.payeeBusinessId ? "business" : "individual"
  const ownerRef = input.payeeBusinessId ?? input.payeeUserId
  const ownerId = await getWalletOwnerId(admin, ownerType, ownerRef)
  if (!ownerId) return { error: "payee_wallet_not_provisioned" }
  const asset = assetForEasetagCurrency(input.currency)
  const { data } = await admin
    .from("wallet_accounts")
    .select("address, associated_token_account_address")
    .eq("wallet_owner_id", ownerId)
    .eq("chain", "solana")
    .eq("asset", asset)
    .eq("ledger_currency", input.currency)
    .eq("status", "active")
    .maybeSingle()
  const vault = String(data?.address ?? "").trim()
  if (!vault) return { error: "payee_wallet_not_provisioned" }
  const fromDb = String(data?.associated_token_account_address ?? "").trim()
  const derived = deriveStablecoinAssociatedTokenAddress(vault, asset)
  const ata = (fromDb || derived || "").trim()
  if (!ata) return { error: "payee_wallet_not_provisioned" }
  return { ata, ownerVault: vault }
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
