import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  hasPayinBank,
  mapNoahBankFieldsToColumns,
  mapPaymentMethodToVirtualAccountDisplay,
  matchesCurrency,
  parseNoahPaymentMethodRail,
  selectPreferredEurPayinPaymentMethod,
  selectPreferredUsdPayinPaymentMethod,
} from "./payment-method-map"

function formatBankAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const parts = [o.Street, o.City, o.State, o.PostCode, o.Country]
    .map((p) => (p != null ? String(p).trim() : ""))
    .filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

export async function mirrorVirtualAccountIdOnSubject(
  admin: ReturnType<typeof createSupabaseAdmin>,
  opts: {
    subjectUserId: string
    businessId: string | null | undefined
    currency: "usd" | "eur" | "gbp"
    pmId: string
  },
): Promise<void> {
  const virtualAccountColumnByCurrency = {
    usd: "noah_usd_virtual_account_id",
    eur: "noah_eur_virtual_account_id",
    gbp: "noah_gbp_virtual_account_id",
  } as const
  const col = virtualAccountColumnByCurrency[opts.currency]
  if (opts.businessId) {
    const { error: bizErr } = await admin
      .from("businesses")
      .update({ [col]: opts.pmId, updated_at: new Date().toISOString() })
      .eq("id", opts.businessId)
    if (bizErr) console.error("[persistVirtualAccount] update businesses:", bizErr)
  } else {
    const { error: userErr } = await admin
      .from("users")
      .update({ [col]: opts.pmId, updated_at: new Date().toISOString() })
      .eq("id", opts.subjectUserId)
    if (userErr) console.error("[persistVirtualAccount] update users:", userErr)
  }
}

type VirtualAccountUpsert = {
  user_id: string
  business_id: string | null
  noah_virtual_account_id: string
  noah_customer_id: string | null
  currency: string
  account_number: string | null
  routing_number: string | null
  iban: string | null
  bic: string | null
  sort_code: string | null
  bank_name: string | null
  bank_address: string | null
  account_holder_name: string | null
  updated_at: string
}

function inferPayinCurrency(pm: Record<string, unknown>): "usd" | "eur" | "gbp" | null {
  const caps = pm.Capabilities as Record<string, unknown> | undefined
  if (caps && caps.PayinTo === false) return null
  if (hasPayinBank(pm, "US")) return "usd"
  if (matchesCurrency(pm, "eur")) return "eur"
  if (hasPayinBank(pm, "GB")) return "gbp"
  return null
}

function buildUpsertRow(input: {
  subjectUserId: string
  businessId?: string | null
  pmId: string
  noahCustomerId?: string | null
  currency: "usd" | "eur" | "gbp"
  cols: ReturnType<typeof mapNoahBankFieldsToColumns>
  bankName: string | null
  bankAddress: string | null
  accountHolderName: string | null
}): VirtualAccountUpsert {
  return {
    user_id: input.subjectUserId,
    business_id: input.businessId ?? null,
    noah_virtual_account_id: input.pmId,
    noah_customer_id: input.noahCustomerId?.trim() || null,
    currency: input.currency.toUpperCase(),
    account_number: input.cols.accountNumber,
    routing_number: input.cols.routingNumber,
    iban: input.cols.iban,
    bic: input.cols.bic,
    sort_code: input.cols.sortCode,
    bank_name: input.bankName,
    bank_address: input.bankAddress,
    account_holder_name: input.accountHolderName,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Upsert `virtual_accounts` and mirror VA ids on `users` or `businesses`.
 * @see ./virtual-account-columns.ts for per-currency column contract.
 */
export async function persistVirtualAccountFromPaymentMethod(
  subjectUserId: string,
  currency: "usd" | "eur" | "gbp",
  pm: Record<string, unknown>,
  businessId?: string | null,
  noahCustomerId?: string | null,
): Promise<void> {
  const pmId = String(pm.ID ?? "").trim()
  if (!pmId) return

  const admin = createSupabaseAdmin()
  const display = mapPaymentMethodToVirtualAccountDisplay(pm, currency)
  const details = pm.DisplayDetails as Record<string, unknown> | undefined
  const accountNumber =
    details?.AccountNumber != null ? String(details.AccountNumber).trim() : null
  const bankCode = details?.BankCode != null ? String(details.BankCode).trim() : null
  const rail = parseNoahPaymentMethodRail(pm)
  const cols = mapNoahBankFieldsToColumns(currency, rail, accountNumber, bankCode)

  const row = buildUpsertRow({
    subjectUserId,
    businessId,
    pmId,
    noahCustomerId,
    currency,
    cols,
    bankName: display.bankName ?? null,
    bankAddress: display.bankAddress ?? null,
    accountHolderName: display.accountHolderName ?? null,
  })

  const { error: upsertErr } = await admin
    .from("virtual_accounts")
    .upsert(row, { onConflict: "noah_virtual_account_id" })

  if (upsertErr) {
    console.error("[persistVirtualAccountFromPaymentMethod] upsert virtual_accounts:", upsertErr)
  }
}

/** Persist every PayinTo bank PM (ACH, Wire, SWIFT, SEPA, …); mirror preferred ACH/Wire (USD) and SEPA (EUR) on subject. */
export async function persistAllPayinVirtualAccountsFromPaymentMethods(
  subjectUserId: string,
  paymentMethods: Record<string, unknown>[],
  businessId?: string | null,
  noahCustomerId?: string | null,
): Promise<void> {
  for (const pm of paymentMethods) {
    const currency = inferPayinCurrency(pm)
    if (!currency) continue
    const type = String(
      (pm.DisplayDetails as Record<string, unknown> | undefined)?.Type ?? "",
    )
    if (type && type !== "FiatPaymentMethodBankDisplay") continue
    await persistVirtualAccountFromPaymentMethod(
      subjectUserId,
      currency,
      pm,
      businessId,
      noahCustomerId,
    )
  }

  const admin = createSupabaseAdmin()
  const usdPreferred = selectPreferredUsdPayinPaymentMethod(paymentMethods)
  const eurPreferred = selectPreferredEurPayinPaymentMethod(paymentMethods)
  const gbpPm = paymentMethods.find((pm) => hasPayinBank(pm, "GB"))

  if (usdPreferred) {
    const pmId = String(usdPreferred.ID ?? "").trim()
    if (pmId) {
      await mirrorVirtualAccountIdOnSubject(admin, {
        subjectUserId,
        businessId,
        currency: "usd",
        pmId,
      })
    }
  }
  if (eurPreferred) {
    const pmId = String(eurPreferred.ID ?? "").trim()
    if (pmId) {
      await mirrorVirtualAccountIdOnSubject(admin, {
        subjectUserId,
        businessId,
        currency: "eur",
        pmId,
      })
    }
  }
  if (gbpPm) {
    const pmId = String(gbpPm.ID ?? "").trim()
    if (pmId) {
      await mirrorVirtualAccountIdOnSubject(admin, {
        subjectUserId,
        businessId,
        currency: "gbp",
        pmId,
      })
    }
  }
}

/**
 * Persist fiat VA from `POST /workflows/bank-deposit-to-onchain-address` (Noah bank onramp recipe).
 * @see https://docs.noah.com/recipes/payin/bank-onramp-us
 */
export async function persistVirtualAccountFromBankOnrampWorkflow(
  subjectUserId: string,
  currency: "usd" | "eur",
  workflow: Record<string, unknown>,
  businessId?: string | null,
  noahCustomerId?: string | null,
): Promise<void> {
  const pmId = String(workflow.PaymentMethodID ?? "").trim()
  if (!pmId) {
    console.error("[persistVirtualAccountFromBankOnrampWorkflow] missing PaymentMethodID")
    return
  }

  const admin = createSupabaseAdmin()
  const accountNumber =
    workflow.AccountNumber != null ? String(workflow.AccountNumber).trim() : null
  const bankCode = workflow.BankCode != null ? String(workflow.BankCode).trim() : null
  const rail = parseNoahPaymentMethodRail({
    ID: pmId,
    PaymentMethodID: pmId,
    PaymentMethodType: workflow.PaymentMethodType,
  })
  const cols = mapNoahBankFieldsToColumns(currency, rail, accountNumber, bankCode)

  const row = buildUpsertRow({
    subjectUserId,
    businessId,
    pmId,
    noahCustomerId,
    currency,
    cols,
    bankName: workflow.BankName != null ? String(workflow.BankName) : null,
    bankAddress: formatBankAddress(workflow.BankAddress),
    accountHolderName:
      workflow.AccountHolderName != null ? String(workflow.AccountHolderName) : null,
  })

  const { error: upsertErr } = await admin
    .from("virtual_accounts")
    .upsert(row, { onConflict: "noah_virtual_account_id" })

  if (upsertErr) {
    console.error("[persistVirtualAccountFromBankOnrampWorkflow] upsert virtual_accounts:", upsertErr)
  }
}
