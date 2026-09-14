import type { SupabaseClient } from "@supabase/supabase-js"
import { isGridDigitalAssetJurisdiction } from "@easner/shared"
import { enrichGridUsdVirtualAccountPersistFields } from "./enrich-grid-va-display"
import { gridFetchAllPages } from "./http"
import { normalizeGridCustomerId } from "./quote-request"
import { registerTurnkeyUsdcExternalAccount } from "./turnkey-external-account"
import { resolveBusinessCountryIso2 } from "./business-profile-shell"
import { ensureBusinessTurnkeyCustody } from "@/lib/wallet/ensure-business-turnkey-custody"

type GridInternalAccountRow = {
  id: string
  customerId?: string
  status?: string
  fundingPaymentInstructions?: Array<{
    accountOrWalletInfo?: Record<string, unknown>
    instructionsNotes?: string
  }>
  balance?: { currency?: { code?: string } }
}

function mapBankFields(info: Record<string, unknown>, currency: string) {
  return {
    account_number: String(info.accountNumber ?? info.iban ?? "").trim() || null,
    routing_number: String(info.routingNumber ?? "").trim() || null,
    iban: String(info.iban ?? "").trim() || null,
    bic: String(info.swiftCode ?? info.bic ?? "").trim() || null,
    sort_code: String(info.sortCode ?? "").trim() || null,
    bank_name: String(info.bankName ?? "").trim() || null,
    bank_address: null as string | null,
    account_holder_name: String(info.accountHolderName ?? "").trim() || null,
    currency: currency.toUpperCase(),
  }
}

function currencyFromAccountInfo(info: Record<string, unknown>): string | null {
  const type = String(info.accountType ?? "").toUpperCase()
  if (type.includes("US_ACCOUNT") || type.includes("USD")) return "usd"
  if (type.includes("EUR") || type.includes("SEPA")) return "eur"
  if (type.includes("GBP")) return "gbp"
  return null
}

export async function persistGridVirtualAccountsFromInternalAccounts(input: {
  admin: SupabaseClient
  businessId: string
  userId: string
  customerId: string
}): Promise<{ persisted: number; pendingProvisioning: boolean }> {
  const customerId = normalizeGridCustomerId(input.customerId)
  const { data: biz } = await input.admin
    .from("businesses")
    .select("name")
    .eq("id", input.businessId)
    .maybeSingle()
  const businessName = String(biz?.name ?? "").trim() || null

  const rows = await gridFetchAllPages<GridInternalAccountRow>({
    path: "/customers/internal-accounts",
    query: { customerId, type: "INTERNAL_FIAT" },
    mapPage: (page) => page.data ?? [],
  })

  let persisted = 0
  let pendingProvisioning = false
  for (const row of rows) {
    const accountStatus = String(row.status ?? "").toUpperCase()
    if (accountStatus === "FAILED") continue
    if (accountStatus === "PENDING") {
      pendingProvisioning = true
      continue
    }
    const instructions = row.fundingPaymentInstructions ?? []
    if (instructions.length === 0) {
      pendingProvisioning = true
      continue
    }
    for (const inst of instructions) {
      const info = inst.accountOrWalletInfo
      if (!info || typeof info !== "object") continue
      const accountType = String(info.accountType ?? "").toUpperCase()
      if (accountType.includes("SOLANA") || accountType.includes("WALLET") || accountType.includes("BITCOIN")) {
        continue
      }
      const currency =
        currencyFromAccountInfo(info) ??
        String(row.balance?.currency?.code ?? "").trim().toLowerCase()
      if (!currency || !["usd", "eur", "gbp"].includes(currency)) continue

      const bank = mapBankFields(info, currency)
      if (!bank.account_number && !bank.iban) {
        pendingProvisioning = true
        continue
      }

      const gridUsdEnrichment =
        currency === "usd"
          ? enrichGridUsdVirtualAccountPersistFields(bank, businessName)
          : null

      const providerAccountId = `${row.id}:${currency}:${accountType || "bank"}`
      const now = new Date().toISOString()
      const patch = {
        business_id: input.businessId,
        user_id: input.userId,
        provider: "grid" as const,
        status: "active" as const,
        settlement_target: "turnkey" as const,
        provider_virtual_account_id: providerAccountId,
        provider_customer_id: customerId,
        ...bank,
        ...(gridUsdEnrichment ?? {}),
        updated_at: now,
      }

      const { data: existing } = await input.admin
        .from("virtual_accounts")
        .select("id")
        .eq("business_id", input.businessId)
        .eq("provider", "grid")
        .eq("provider_virtual_account_id", providerAccountId)
        .maybeSingle()

      if (existing?.id) {
        const { error } = await input.admin.from("virtual_accounts").update(patch).eq("id", existing.id)
        if (!error) persisted += 1
      } else {
        const { error } = await input.admin.from("virtual_accounts").insert({ ...patch, created_at: now })
        if (!error) persisted += 1
      }
    }
  }
  if (persisted === 0 && rows.some((r) => String(r.status ?? "").toUpperCase() === "PENDING")) {
    pendingProvisioning = true
  }
  return { persisted, pendingProvisioning }
}

export async function provisionGridAfterBusinessKybApproved(input: {
  admin: SupabaseClient
  businessId: string
  subjectUserId: string
  gridCustomerId: string | null
}): Promise<Record<string, unknown>> {
  const { subjectUserId, subOrg } = await ensureBusinessTurnkeyCustody({
    admin: input.admin,
    businessId: input.businessId,
    subjectUserId: input.subjectUserId,
  })

  const receiveRails = await refreshGridBusinessReceiveRails({
    admin: input.admin,
    businessId: input.businessId,
    userId: subjectUserId,
    gridCustomerId: input.gridCustomerId,
  })

  const { data: bizCountry } = await input.admin
    .from("businesses")
    .select("country")
    .eq("id", input.businessId)
    .maybeSingle()
  const senderCountry = resolveBusinessCountryIso2(bizCountry?.country ?? null)
  const requiresTurnkeyExternalAccount = !isGridDigitalAssetJurisdiction(senderCountry)
  const turnkeyExternalOk =
    !requiresTurnkeyExternalAccount || Boolean(receiveRails.gridExternalAccountId)

  const fullyProvisioned =
    subOrg.ok &&
    turnkeyExternalOk &&
    receiveRails.gridVirtualAccountsPersisted > 0 &&
    !receiveRails.gridVirtualAccountsPending

  return {
    turnkey: true,
    turnkeySubOrgReady: subOrg.ok,
    turnkeySubOrgId: subOrg.ok ? subOrg.subOrganizationId : null,
    turnkeySubOrganizationId: subOrg.ok ? subOrg.subOrganizationId : null,
    turnkeySubOrgCreated: subOrg.ok ? subOrg.created : false,
    turnkeySubOrgError: subOrg.ok ? null : subOrg.reason,
    gridExternalAccountId: receiveRails.gridExternalAccountId,
    gridVirtualAccountsPersisted: receiveRails.gridVirtualAccountsPersisted,
    gridVirtualAccountsPending: receiveRails.gridVirtualAccountsPending,
    /** True when Turnkey vaults, Grid↔Turnkey link (when required), and local USD VA are ready. */
    fullyProvisioned,
  }
}

/** Re-fetch Grid fiat VAs + Turnkey USDC external account (safe to call after vault jobs). */
export async function refreshGridBusinessReceiveRails(input: {
  admin: SupabaseClient
  businessId: string
  userId: string
  gridCustomerId?: string | null
}): Promise<{
  gridVirtualAccountsPersisted: number
  gridVirtualAccountsPending: boolean
  gridExternalAccountId: string | null
}> {
  let gridCustomerId = String(input.gridCustomerId ?? "").trim()
  let country: string | null = null

  if (!gridCustomerId) {
    const { data: biz } = await input.admin
      .from("businesses")
      .select("grid_customer_id,country")
      .eq("id", input.businessId)
      .maybeSingle()
    gridCustomerId = String(biz?.grid_customer_id ?? "").trim()
    country = biz?.country ?? null
  } else {
    const { data: biz } = await input.admin
      .from("businesses")
      .select("country")
      .eq("id", input.businessId)
      .maybeSingle()
    country = biz?.country ?? null
  }

  if (!gridCustomerId) {
    return { gridVirtualAccountsPersisted: 0, gridVirtualAccountsPending: false, gridExternalAccountId: null }
  }

  let externalAccountId: string | null = null
  try {
    const senderCountry = resolveBusinessCountryIso2(country)
    if (!isGridDigitalAssetJurisdiction(senderCountry)) {
      externalAccountId = await registerTurnkeyUsdcExternalAccount({
        admin: input.admin,
        businessId: input.businessId,
        userId: input.userId,
        gridCustomerId,
      }).catch((e) => {
        console.warn("[grid] register Turnkey USDC external account after KYB failed:", e instanceof Error ? e.message : e)
        return null
      })
    }
  } catch {
    externalAccountId = null
  }

  const vaRes = await persistGridVirtualAccountsFromInternalAccounts({
    admin: input.admin,
    businessId: input.businessId,
    userId: input.userId,
    customerId: gridCustomerId,
  }).catch((e) => {
    console.warn(
      "[grid] persist virtual accounts failed:",
      e instanceof Error ? e.message : e,
    )
    // Keep pending so cron / sync-status retries instead of treating as complete.
    return { persisted: 0, pendingProvisioning: true }
  })

  return {
    gridVirtualAccountsPersisted: vaRes.persisted,
    gridVirtualAccountsPending: vaRes.pendingProvisioning,
    gridExternalAccountId: externalAccountId,
  }
}
