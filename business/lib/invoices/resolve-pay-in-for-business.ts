import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { ensureCurrencyUsable } from "@/lib/accounts/currency-controls"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  canProvisionInvoiceDepositInstructions,
  TIER2_COMPLETE_PLACEHOLDER,
} from "@/lib/compliance-placeholders"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import type { Account, StablecoinAccount } from "@/lib/finance-types"
import {
  buildPayInAccountsFromSources,
  type VirtualAccountJson,
} from "@/lib/invoices/map-pay-in-accounts"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import { getTurnkeyDepositAddressesForBusiness } from "@/lib/wallet/turnkey-deposit-addresses"

export type InvoicePayInPayload = {
  bankAccount?: Account
  stablecoinAccount?: StablecoinAccount
}

type ResolvePayInOpts = {
  /** Reserved for future persistence hooks (Grid VA sync). */
  persistVirtualAccount?: boolean
}

function vaJsonFromDisplay(
  currency: "usd" | "eur" | "gbp",
  display: Awaited<ReturnType<typeof getVirtualAccountDisplayFromDb>>,
): VirtualAccountJson | null {
  if (!display?.hasAccount) {
    return { hasAccount: false, currency }
  }
  return {
    hasAccount: true,
    currency,
    accountNumber: display.accountNumber,
    routingNumber: display.routingNumber,
    sortCode: display.sortCode,
    iban: display.iban,
    bic: display.bic,
    bankName: display.bankName,
    bankAddress: display.bankAddress,
    accountHolderName: display.accountHolderName,
  }
}

export async function resolvePayInForBusiness(
  businessId: string,
  invoiceCurrency: string,
  opts: ResolvePayInOpts = {},
): Promise<InvoicePayInPayload> {
  void opts
  const admin = createSupabaseAdmin()

  const { data: biz } = await admin
    .from("businesses")
    .select("name, verification_status, invoice_settings")
    .eq("id", businessId)
    .maybeSingle()

  const tier1Complete = isBusinessTier1Complete(biz)
  const displayName = (biz?.name as string | null | undefined)?.trim() || "Business"

  const canProvision = canProvisionInvoiceDepositInstructions(
    invoiceCurrency.trim().toUpperCase(),
    tier1Complete,
    TIER2_COMPLETE_PLACEHOLDER,
  )

  if (!canProvision) return {}

  const code = invoiceCurrency.trim().toUpperCase()
  const vaLower = code.toLowerCase() as "usd" | "eur" | "gbp"

  let va: VirtualAccountJson | null = null

  if (code === "USD" || code === "EUR" || code === "GBP") {
    const guard = await ensureCurrencyUsable(code)
    if (!guard.ok) {
      return {}
    }

    try {
      const ownerUserId = await resolveOrgOwnerUserId(admin, businessId, "")
      if (ownerUserId) {
        const cached = await getVirtualAccountDisplayFromDb(admin, {
          currency: vaLower,
          userId: ownerUserId,
          businessId,
        })
        va = vaJsonFromDisplay(vaLower, cached)
      }
      if (!va?.hasAccount) {
        va = { hasAccount: false, currency: vaLower }
      }
    } catch {
      va = null
    }
  }

  const turnkey = await getTurnkeyDepositAddressesForBusiness(admin, businessId)
  const walletForInvoice =
    code === "EUR" ? turnkey.EUR : code === "USD" || code === "GBP" ? turnkey.USD : turnkey.USD
  const walletAddress = walletForInvoice.address || walletForInvoice.ownerAddress
  const walletMemo = walletForInvoice.memo

  return buildPayInAccountsFromSources({
    invoiceCurrency: code,
    displayName,
    va,
    walletAddress: walletAddress.trim() || undefined,
    walletMemo,
    balance: 0,
    canProvision: true,
  })
}
