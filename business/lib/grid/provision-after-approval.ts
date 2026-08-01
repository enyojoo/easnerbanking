import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { gridFetchAllPages } from "./http"
import { normalizeGridCustomerId } from "./quote-request"
import { registerTurnkeyUsdcExternalAccount } from "./turnkey-external-account"
import { trySyncTurnkeyDepositVaultsIfNeeded } from "@/lib/wallet/sync-deposit-vaults"
import { scheduleTurnkeyWalletsAfterKycApproved } from "@/lib/wallet/turnkey-provisioning"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"

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
    currency: currency.toLowerCase(),
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
}): Promise<{ persisted: number }> {
  const customerId = normalizeGridCustomerId(input.customerId)
  const rows = await gridFetchAllPages<GridInternalAccountRow>({
    path: "/customers/internal-accounts",
    query: { customerId, type: "INTERNAL_FIAT" },
    mapPage: (page) => page.data ?? [],
  })

  let persisted = 0
  for (const row of rows) {
    if (String(row.status ?? "").toUpperCase() === "FAILED") continue
    const instructions = row.fundingPaymentInstructions ?? []
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
      if (!bank.account_number && !bank.iban) continue

      const providerAccountId = `${row.id}:${currency}:${accountType || "bank"}`
      const now = new Date().toISOString()
      const patch = {
        business_id: input.businessId,
        user_id: input.userId,
        provider: "grid" as const,
        status: "active" as const,
        settlement_target: "turnkey" as const,
        noah_virtual_account_id: providerAccountId,
        noah_customer_id: customerId,
        ...bank,
        updated_at: now,
      }

      const { data: existing } = await input.admin
        .from("virtual_accounts")
        .select("id")
        .eq("business_id", input.businessId)
        .eq("provider", "grid")
        .eq("noah_virtual_account_id", providerAccountId)
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
  return { persisted }
}

export async function provisionGridAfterBusinessKybApproved(input: {
  admin: SupabaseClient
  businessId: string
  subjectUserId: string
  gridCustomerId: string | null
}): Promise<Record<string, unknown>> {
  let subjectUserId = input.subjectUserId
  const ownerId = await resolveBusinessOrgOwnerUserId(input.admin, input.businessId)
  if (ownerId) subjectUserId = ownerId

  await scheduleTurnkeyWalletsAfterKycApproved({
    scope: "business",
    subjectUserId,
    subjectBusinessId: input.businessId,
    noahCustomerId: "",
  })

  const accountCtx: NoahAccountContext = {
    scope: "business",
    customerType: "Business",
    noahCustomerId: "",
    subjectBusinessId: input.businessId,
    subjectUserId,
  }
  await trySyncTurnkeyDepositVaultsIfNeeded(input.admin, accountCtx)

  let externalAccountId: string | null = null
  if (input.gridCustomerId) {
    externalAccountId = await registerTurnkeyUsdcExternalAccount({
      admin: input.admin,
      businessId: input.businessId,
      userId: subjectUserId,
      gridCustomerId: input.gridCustomerId,
    }).catch(() => null)
  }

  let vaPersisted = 0
  if (input.gridCustomerId) {
    const res = await persistGridVirtualAccountsFromInternalAccounts({
      admin: input.admin,
      businessId: input.businessId,
      userId: subjectUserId,
      customerId: input.gridCustomerId,
    }).catch(() => ({ persisted: 0 }))
    vaPersisted = res.persisted
  }

  return {
    turnkey: true,
    gridExternalAccountId: externalAccountId,
    gridVirtualAccountsPersisted: vaPersisted,
  }
}
