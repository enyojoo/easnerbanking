import type { SupabaseClient } from "@supabase/supabase-js"
import { gridFetch } from "./http"
import { buildGridIdempotencyKey } from "./idempotency"
import { getTurnkeyDepositAddressesForBusiness } from "@/lib/wallet/turnkey-deposit-addresses"
import type { GridExternalAccount } from "./types"

/** Register customer Turnkey Solana USDC as Grid external account (settlement destination). */
export async function registerTurnkeyUsdcExternalAccount(input: {
  admin: SupabaseClient
  businessId: string
  userId: string
  gridCustomerId: string
}): Promise<string | null> {
  const deposits = await getTurnkeyDepositAddressesForBusiness(input.admin, input.businessId)
  const usdcAddress = String(deposits?.USD?.address ?? "").trim()
  if (!usdcAddress) return null

  const platformAccountId = `turnkey_usdc_${input.businessId}`
  const payload = {
    customerId: input.gridCustomerId,
    currency: "USDC",
    platformAccountId,
    accountInfo: {
      accountType: "SOLANA_WALLET",
      assetType: "USDC",
      address: usdcAddress,
    },
  }

  const existing = await gridFetch<{ data?: GridExternalAccount[] }>({
    method: "GET",
    path: `/customers/external-accounts?customerId=${encodeURIComponent(input.gridCustomerId)}&currency=USDC`,
  }).catch(() => ({ data: [] as GridExternalAccount[] }))

  const match = (existing.data ?? []).find((row) => {
    const info = row.accountInfo as Record<string, unknown> | undefined
    return String(info?.address ?? "") === usdcAddress
  })
  if (match?.id) return match.id

  const created = await gridFetch<GridExternalAccount>({
    method: "POST",
    path: "/customers/external-accounts",
    json: payload,
    idempotencyKey: buildGridIdempotencyKey(`grid_turnkey_usdc_${input.businessId}`, payload),
  })
  return created.id ?? null
}
