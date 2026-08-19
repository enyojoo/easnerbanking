import type { SupabaseClient } from "@supabase/supabase-js"
import { gridFetch } from "./http"
import { buildGridIdempotencyKey } from "./idempotency"
import { normalizeGridCustomerId } from "./quote-request"
import { getTurnkeyDepositAddressesForBusiness, getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { noahCustomerIdFromUserId } from "@/lib/noah/customer-id"
import type { GridExternalAccount } from "./types"

export function buildTurnkeyUsdcExternalAccountPayload(input: {
  platformAccountId: string
  gridCustomerId: string
  solanaAddress: string
}): {
  customerId: string
  currency: "USDC"
  platformAccountId: string
  ownershipType: "FIRST_PARTY"
  accountInfo: { accountType: "SOLANA_WALLET"; assetType: "USDC"; address: string }
} {
  return {
    customerId: normalizeGridCustomerId(input.gridCustomerId),
    currency: "USDC",
    platformAccountId: input.platformAccountId,
    ownershipType: "FIRST_PARTY",
    accountInfo: {
      accountType: "SOLANA_WALLET",
      assetType: "USDC",
      address: input.solanaAddress.trim(),
    },
  }
}

function accountInfoAddress(row: GridExternalAccount): string {
  const info = row.accountInfo
  if (!info || typeof info !== "object") return ""
  return String((info as Record<string, unknown>).address ?? "").trim()
}

/** Register customer Turnkey Solana USDC as Grid external account (settlement destination). */
export async function registerTurnkeyUsdcExternalAccount(input: {
  admin: SupabaseClient
  businessId?: string | null
  userId: string
  gridCustomerId: string
}): Promise<string | null> {
  const businessId = String(input.businessId ?? "").trim()
  const deposits = businessId
    ? await getTurnkeyDepositAddressesForBusiness(input.admin, businessId, { mode: "fast" })
    : await getTurnkeyDepositAddressesForContext(
        input.admin,
        {
          scope: "individual",
          customerType: "Individual",
          subjectBusinessId: null,
          subjectUserId: input.userId,
          noahCustomerId: noahCustomerIdFromUserId(input.userId),
        },
        { mode: "fast" },
      )
  const vaultPubkey = String(deposits?.USD?.ownerAddress ?? "").trim()
  const ata = String(deposits?.USD?.address ?? "").trim()
  const preferred = vaultPubkey || ata
  if (!preferred) {
    console.warn("[grid] turnkey USDC external account skipped: no Solana vault", {
      businessId: businessId || null,
      userId: input.userId,
    })
    return null
  }

  const customerId = normalizeGridCustomerId(input.gridCustomerId)
  const platformAccountId = businessId
    ? `turnkey_sol_usdc_${businessId}`
    : `turnkey_sol_usdc_user_${input.userId}`
  const existing = await gridFetch<{ data?: GridExternalAccount[] }>({
    method: "GET",
    path: `/customers/external-accounts?customerId=${encodeURIComponent(customerId)}&limit=100`,
  }).catch((e) => {
    console.warn("[grid] list USDC external accounts failed:", e instanceof Error ? e.message : e)
    return { data: [] as GridExternalAccount[] }
  })

  const wanted = new Set([preferred, vaultPubkey, ata].filter(Boolean))
  const match = (existing.data ?? []).find((row) => {
    if (String(row.platformAccountId ?? "") === platformAccountId && row.id) return true
    return wanted.has(accountInfoAddress(row))
  })
  if (match?.id) return match.id

  const candidates = [...new Set([vaultPubkey, ata].filter(Boolean))]
  let lastError: unknown = null
  for (const address of candidates) {
    const payload = buildTurnkeyUsdcExternalAccountPayload({
      platformAccountId,
      gridCustomerId: customerId,
      solanaAddress: address,
    })
    try {
      const created = await gridFetch<GridExternalAccount>({
        method: "POST",
        path: "/customers/external-accounts",
        json: payload,
        idempotencyKey: buildGridIdempotencyKey(`grid_turnkey_sol_usdc_${platformAccountId}`, payload),
      })
      if (created.id) return created.id
    } catch (e) {
      lastError = e
      const message = e instanceof Error ? e.message : String(e)
      if (/already exists/i.test(message)) {
        const retry = await gridFetch<{ data?: GridExternalAccount[] }>({
          method: "GET",
          path: `/customers/external-accounts?customerId=${encodeURIComponent(customerId)}&limit=100`,
        }).catch(() => ({ data: [] as GridExternalAccount[] }))
        const found = (retry.data ?? []).find(
          (row) => String(row.platformAccountId ?? "") === platformAccountId && row.id,
        )
        if (found?.id) return found.id
      }
      console.warn("[grid] register Turnkey USDC external account failed", {
        platformAccountId,
        address,
        error: e instanceof Error ? e.message : e,
      })
    }
  }

  if (lastError) return null
  return null
}
