import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { ensureCurrencyUsable } from "@/lib/accounts/currency-controls"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  canProvisionInvoiceDepositInstructions,
  TIER2_COMPLETE_PLACEHOLDER,
} from "@/lib/compliance-placeholders"
import { noahCustomerIdFromBusinessId } from "@/lib/noah/customer-id"
import { fetchAllPaymentMethodsForCustomer } from "@/lib/noah/list-payment-methods"
import {
  mapPaymentMethodToVirtualAccountDisplay,
  matchesCurrency,
} from "@/lib/noah/payment-method-map"
import { persistVirtualAccountFromPaymentMethod } from "@/lib/noah/persist-account-data"
import type { Account, StablecoinAccount } from "@/lib/finance-types"
import {
  buildPayInAccountsFromSources,
  type VirtualAccountJson,
} from "@/lib/invoices/map-pay-in-accounts"

export type InvoicePayInPayload = {
  bankAccount?: Account
  stablecoinAccount?: StablecoinAccount
}

type ResolvePayInOpts = {
  /** When true, persist VA metadata like `GET /api/noah/virtual-accounts` (avoid on anonymous public views). */
  persistVirtualAccount?: boolean
}

export async function resolvePayInForBusiness(
  businessId: string,
  invoiceCurrency: string,
  opts: ResolvePayInOpts = {},
): Promise<InvoicePayInPayload> {
  const { persistVirtualAccount = false } = opts
  const admin = createSupabaseAdmin()

  const { data: biz } = await admin
    .from("businesses")
    .select("name, noah_kyb_status, noah_wallet_id")
    .eq("id", businessId)
    .maybeSingle()

  const tier1Complete = (biz?.noah_kyb_status as string | null | undefined) === "approved"
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
      const noahCustomerId = noahCustomerIdFromBusinessId(businessId)
      const ownerUserId = await resolveOrgOwnerUserId(admin, businessId, "")
      const all = await fetchAllPaymentMethodsForCustomer(noahCustomerId)
      const candidates = all.filter((pm) => {
        const caps = pm.Capabilities as Record<string, unknown> | undefined
        if (caps && caps.PayinTo === false) return false
        return matchesCurrency(pm, vaLower)
      })
      const pm = candidates[0]
      if (pm) {
        const display = mapPaymentMethodToVirtualAccountDisplay(pm, vaLower)
        if (persistVirtualAccount && ownerUserId) {
          await persistVirtualAccountFromPaymentMethod(
            ownerUserId,
            vaLower,
            pm,
            businessId,
          )
        }
        va = {
          hasAccount: true,
          currency: vaLower,
          accountNumber: display.accountNumber,
          routingNumber: display.routingNumber,
          sortCode: display.sortCode,
          iban: display.iban,
          bic: display.bic,
          bankName: display.bankName,
          bankAddress: display.bankAddress,
          accountHolderName: display.accountHolderName,
        }
      } else {
        va = { hasAccount: false, currency: vaLower }
      }
    } catch {
      va = null
    }
  }

  let walletAddress = ""
  let walletMemo = ""
  const wid = biz?.noah_wallet_id as string | undefined
  if (wid) {
    const { data: w } = await admin
      .from("wallets")
      .select("address, blockchain_memo")
      .eq("noah_wallet_id", wid)
      .maybeSingle()
    if (w?.address) walletAddress = String(w.address)
    if (w?.blockchain_memo != null) walletMemo = String(w.blockchain_memo)
  }

  return buildPayInAccountsFromSources({
    invoiceCurrency: code,
    displayName,
    va,
    walletAddress: walletAddress || undefined,
    walletMemo,
    balance: 0,
    canProvision: true,
  })
}
