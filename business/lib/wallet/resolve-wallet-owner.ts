import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getActiveWalletAddress } from "@/lib/wallet/turnkey-wallet-db"
import { vaultSpecForNoahAssetNetwork } from "@/lib/wallet/noah-pair-to-vault"

export async function getWalletOwnerId(
  admin: SupabaseClient,
  ownerType: "individual" | "business",
  ownerRef: string,
): Promise<string | null> {
  const { data } = await admin
    .from("wallet_owners")
    .select("id")
    .eq("owner_type", ownerType)
    .eq("owner_ref", ownerRef)
    .maybeSingle()
  return data?.id ? String(data.id) : null
}

type WalletOwnerLegacyRow = {
  id: string
  owner_type: string
  owner_ref: string
  turnkey_sub_organization_id: string | null
}

function pickWalletOwnerByNoahCustomer(
  rows: WalletOwnerLegacyRow[] | null | undefined,
  ownerType: "individual" | "business",
  ownerRef: string,
): WalletOwnerLegacyRow | null {
  if (!rows?.length) return null
  const exact = rows.find((r) => r.owner_type === ownerType && String(r.owner_ref) === String(ownerRef))
  if (exact) return exact
  const withSub = rows.find((r) => String(r.turnkey_sub_organization_id ?? "").trim())
  if (withSub) return withSub
  return rows[0] ?? null
}

/**
 * Resolve `wallet_owners.id` for API context. If the canonical `(owner_type, owner_ref)` row is
 * missing, find a legacy row by `noah_customer_id` and repair `owner_type` / `owner_ref` so jobs
 * and `wallet_accounts` stay attached to the same id.
 */
export async function resolveWalletOwnerIdForEasnerContext(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
): Promise<string | null> {
  const ownerType: "individual" | "business" = ctx.scope === "business" ? "business" : "individual"
  const ownerRef =
    ctx.scope === "business" && ctx.subjectBusinessId ? ctx.subjectBusinessId : ctx.subjectUserId

  const primary = await getWalletOwnerId(admin, ownerType, ownerRef)
  if (primary) return primary

  const noahId = String(ctx.noahCustomerId ?? "").trim()
  if (!noahId) return null

  const { data: legacyRows } = await admin
    .from("wallet_owners")
    .select("id, owner_type, owner_ref, turnkey_sub_organization_id")
    .eq("noah_customer_id", noahId)

  const legacy = pickWalletOwnerByNoahCustomer(legacyRows as WalletOwnerLegacyRow[] | null, ownerType, ownerRef)
  if (!legacy?.id) return null

  if (legacy.owner_type === ownerType && String(legacy.owner_ref) === String(ownerRef)) {
    return String(legacy.id)
  }

  const { data: conflict } = await admin
    .from("wallet_owners")
    .select("id")
    .eq("owner_type", ownerType)
    .eq("owner_ref", ownerRef)
    .maybeSingle()

  if (conflict?.id && String(conflict.id) !== String(legacy.id)) {
    return String(conflict.id)
  }

  const { error } = await admin
    .from("wallet_owners")
    .update({
      owner_type: ownerType,
      owner_ref: ownerRef,
      updated_at: new Date().toISOString(),
    })
    .eq("id", legacy.id)

  if (error) {
    console.error("[resolveWalletOwnerIdForEasnerContext] repair failed:", error.message)
    return String(legacy.id)
  }

  return String(legacy.id)
}

/** Active Turnkey receive address for Noah workflows when asset/network match a provisioned vault. */
export async function resolveTurnkeyAddressForNoahPair(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
  cryptoCurrency: string,
  network: string,
): Promise<string | null> {
  const spec = vaultSpecForNoahAssetNetwork(cryptoCurrency, network)
  if (!spec) return null
  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, ctx)
  if (!ownerId) return null
  return getActiveWalletAddress(admin, ownerId, spec.chain, spec.asset, spec.ledgerCurrency)
}
