import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapPaymentMethodToVirtualAccountDisplay } from "./payment-method-map"

function formatBankAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const parts = [o.Street, o.City, o.State, o.PostCode, o.Country]
    .map((p) => (p != null ? String(p).trim() : ""))
    .filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

async function mirrorVirtualAccountIdOnSubject(
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

/**
 * Upsert `virtual_accounts` and mirror VA ids on `users` or `businesses`.
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
  const fiat = currency.toUpperCase()

  const { error: upsertErr } = await admin.from("virtual_accounts").upsert(
    {
      user_id: subjectUserId,
      business_id: businessId ?? null,
      noah_virtual_account_id: pmId,
      noah_payment_method_id: pmId,
      noah_customer_id: noahCustomerId?.trim() || null,
      currency: fiat,
      account_number: display.accountNumber ?? null,
      routing_number: display.routingNumber ?? null,
      iban: display.iban ?? null,
      bic: display.bic ?? null,
      bank_name: display.bankName ?? null,
      bank_address: display.bankAddress ?? null,
      account_holder_name: display.accountHolderName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "noah_virtual_account_id" },
  )

  if (upsertErr) {
    console.error("[persistVirtualAccountFromPaymentMethod] upsert virtual_accounts:", upsertErr)
    return
  }

  await mirrorVirtualAccountIdOnSubject(admin, { subjectUserId, businessId, currency, pmId })
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
  const fiat = currency.toUpperCase()

  const { error: upsertErr } = await admin.from("virtual_accounts").upsert(
    {
      user_id: subjectUserId,
      business_id: businessId ?? null,
      noah_virtual_account_id: pmId,
      noah_payment_method_id: pmId,
      noah_customer_id: noahCustomerId?.trim() || null,
      currency: fiat,
      account_number: currency === "eur" ? null : accountNumber,
      routing_number: currency === "usd" ? bankCode : null,
      iban: currency === "eur" ? accountNumber : null,
      bic: currency === "eur" ? bankCode : null,
      bank_name: workflow.BankName != null ? String(workflow.BankName) : null,
      bank_address: formatBankAddress(workflow.BankAddress),
      account_holder_name:
        workflow.AccountHolderName != null ? String(workflow.AccountHolderName) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "noah_virtual_account_id" },
  )

  if (upsertErr) {
    console.error("[persistVirtualAccountFromBankOnrampWorkflow] upsert virtual_accounts:", upsertErr)
    return
  }

  await mirrorVirtualAccountIdOnSubject(admin, { subjectUserId, businessId, currency, pmId })
}
