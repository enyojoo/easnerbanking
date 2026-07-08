import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  formatVaAccountHolderName,
  formatVaBankAddress,
  formatVaBankName,
} from "./format-display-text"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  hasPayinBank,
  mapNoahBankFieldsToColumns,
  mapPaymentMethodToVirtualAccountDisplay,
  matchesCurrency,
  mergeUsdPayinPaymentMethods,
  mergeUsdVirtualAccountFieldPartials,
  type MergedUsdVirtualAccountFields,
  parseNoahPaymentMethodRail,
  selectPreferredEurPayinPaymentMethod,
} from "./payment-method-map"
import type { VirtualAccountDbRow } from "./virtual-account-columns"

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
  if (hasPayinBank(pm, "US")) return "usd"
  if (matchesCurrency(pm, "eur")) return "eur"
  if (hasPayinBank(pm, "GB")) return "gbp"
  return null
}

function mergedUsdFieldsFromDbRow(
  row: VirtualAccountDbRow,
): Partial<MergedUsdVirtualAccountFields> {
  return {
    canonicalPmId: row.noah_virtual_account_id ?? undefined,
    accountNumber: row.account_number,
    routingNumber: row.routing_number,
    bic: row.bic,
    bankName: row.bank_name,
    bankAddress: row.bank_address,
    accountHolderName: row.account_holder_name,
  }
}

async function fetchUsdVirtualAccountRows(
  admin: SupabaseClient,
  subjectUserId: string,
  businessId?: string | null,
): Promise<VirtualAccountDbRow[]> {
  let q = admin
    .from("virtual_accounts")
    .select(
      "noah_virtual_account_id,currency,account_number,routing_number,iban,bic,sort_code,bank_name,bank_address,account_holder_name",
    )
    .eq("currency", "USD")
  if (businessId) {
    q = q.eq("business_id", businessId)
  } else {
    q = q.eq("user_id", subjectUserId).is("business_id", null)
  }
  const { data, error } = await q
  if (error) {
    console.error("[fetchUsdVirtualAccountRows]", error)
    return []
  }
  return (data ?? []) as VirtualAccountDbRow[]
}

/** Remove legacy per-rail USD rows after consolidating to a single ACH-keyed row. */
async function pruneExtraUsdVirtualAccountRows(
  admin: SupabaseClient,
  opts: {
    subjectUserId: string
    businessId?: string | null
    keepPmId: string
  },
): Promise<void> {
  const rows = await fetchUsdVirtualAccountRows(admin, opts.subjectUserId, opts.businessId)
  const staleIds = rows
    .map((r) => String(r.noah_virtual_account_id ?? "").trim())
    .filter((id) => id && id !== opts.keepPmId)
  if (!staleIds.length) return

  const { error } = await admin.from("virtual_accounts").delete().in("noah_virtual_account_id", staleIds)
  if (error) {
    console.error("[pruneExtraUsdVirtualAccountRows]", error)
  }
}

async function fetchEurVirtualAccountRows(
  admin: SupabaseClient,
  subjectUserId: string,
  businessId?: string | null,
): Promise<VirtualAccountDbRow[]> {
  let q = admin
    .from("virtual_accounts")
    .select(
      "noah_virtual_account_id,currency,account_number,routing_number,iban,bic,sort_code,bank_name,bank_address,account_holder_name",
    )
    .eq("currency", "EUR")
  if (businessId) {
    q = q.eq("business_id", businessId)
  } else {
    q = q.eq("user_id", subjectUserId).is("business_id", null)
  }
  const { data, error } = await q
  if (error) {
    console.error("[fetchEurVirtualAccountRows]", error)
    return []
  }
  return (data ?? []) as VirtualAccountDbRow[]
}

/** Remove stale EUR SEPA rows after sync (e.g. probe/test payment methods). */
async function pruneExtraEurVirtualAccountRows(
  admin: SupabaseClient,
  opts: {
    subjectUserId: string
    businessId?: string | null
    keepPmId: string
  },
): Promise<void> {
  const rows = await fetchEurVirtualAccountRows(admin, opts.subjectUserId, opts.businessId)
  const staleIds = rows
    .map((r) => String(r.noah_virtual_account_id ?? "").trim())
    .filter((id) => id && id !== opts.keepPmId)
  if (!staleIds.length) return

  const { error } = await admin.from("virtual_accounts").delete().in("noah_virtual_account_id", staleIds)
  if (error) {
    console.error("[pruneExtraEurVirtualAccountRows]", error)
  }
}

async function upsertMergedUsdVirtualAccount(
  admin: SupabaseClient,
  opts: {
    subjectUserId: string
    businessId?: string | null
    noahCustomerId?: string | null
    merged: MergedUsdVirtualAccountFields
  },
): Promise<void> {
  const row: VirtualAccountUpsert = {
    user_id: opts.subjectUserId,
    business_id: opts.businessId ?? null,
    noah_virtual_account_id: opts.merged.canonicalPmId,
    noah_customer_id: opts.noahCustomerId?.trim() || null,
    currency: "USD",
    account_number: opts.merged.accountNumber,
    routing_number: opts.merged.routingNumber,
    iban: null,
    bic: opts.merged.bic,
    sort_code: null,
    bank_name: formatVaBankName(opts.merged.bankName),
    bank_address: formatVaBankAddress(opts.merged.bankAddress),
    account_holder_name: formatVaAccountHolderName(opts.merged.accountHolderName),
    updated_at: new Date().toISOString(),
  }

  const { error: upsertErr } = await admin
    .from("virtual_accounts")
    .upsert(row, { onConflict: "noah_virtual_account_id" })

  if (upsertErr) {
    console.error("[upsertMergedUsdVirtualAccount] upsert virtual_accounts:", upsertErr)
    return
  }

  await pruneExtraUsdVirtualAccountRows(admin, {
    subjectUserId: opts.subjectUserId,
    businessId: opts.businessId,
    keepPmId: opts.merged.canonicalPmId,
  })

  await mirrorVirtualAccountIdOnSubject(admin, {
    subjectUserId: opts.subjectUserId,
    businessId: opts.businessId,
    currency: "usd",
    pmId: opts.merged.canonicalPmId,
  })
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
    bank_name: formatVaBankName(input.bankName),
    bank_address: formatVaBankAddress(input.bankAddress),
    account_holder_name: formatVaAccountHolderName(input.accountHolderName),
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

  if (currency === "usd") {
    const fromPm = mergeUsdPayinPaymentMethods([pm])
    const existingRows = await fetchUsdVirtualAccountRows(admin, subjectUserId, businessId)
    const fromDb = mergeUsdVirtualAccountFieldPartials(
      ...existingRows.map((r) => mergedUsdFieldsFromDbRow(r)),
    )
    const merged = mergeUsdVirtualAccountFieldPartials(fromPm ?? {}, fromDb ?? {})
    if (merged) {
      await upsertMergedUsdVirtualAccount(admin, {
        subjectUserId,
        businessId,
        noahCustomerId,
        merged,
      })
    }
    return
  }

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

/** Persist PayinTo bank PMs: one merged USD row (ACH+Wire routing + SWIFT BIC); EUR/GBP per PM. */
export async function persistAllPayinVirtualAccountsFromPaymentMethods(
  subjectUserId: string,
  paymentMethods: Record<string, unknown>[],
  businessId?: string | null,
  noahCustomerId?: string | null,
): Promise<void> {
  const admin = createSupabaseAdmin()

  const usdMerged = mergeUsdPayinPaymentMethods(paymentMethods)
  if (usdMerged) {
    await upsertMergedUsdVirtualAccount(admin, {
      subjectUserId,
      businessId,
      noahCustomerId,
      merged: usdMerged,
    })
  }

  for (const pm of paymentMethods) {
    const currency = inferPayinCurrency(pm)
    if (!currency || currency === "usd") continue
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

  const eurPreferred = selectPreferredEurPayinPaymentMethod(paymentMethods)
  const gbpPm = paymentMethods.find((pm) => hasPayinBank(pm, "GB"))

  if (eurPreferred) {
    const pmId = String(eurPreferred.ID ?? "").trim()
    if (pmId) {
      await mirrorVirtualAccountIdOnSubject(admin, {
        subjectUserId,
        businessId,
        currency: "eur",
        pmId,
      })
      await pruneExtraEurVirtualAccountRows(admin, {
        subjectUserId,
        businessId,
        keepPmId: pmId,
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

  if (currency === "usd") {
    const workflowPm: Record<string, unknown> = {
      ID: pmId,
      DisplayDetails: {
        Type: "FiatPaymentMethodBankDisplay",
        AccountNumber: accountNumber,
        BankCode: bankCode,
      },
    }
    const fromPm = mergeUsdPayinPaymentMethods([workflowPm])
    const partial: Partial<MergedUsdVirtualAccountFields> = {
      canonicalPmId: pmId,
      accountNumber: cols.accountNumber,
      routingNumber: rail === "swift" ? null : cols.routingNumber,
      bic: rail === "swift" ? cols.bic : null,
      bankName: workflow.BankName != null ? String(workflow.BankName) : null,
      bankAddress: formatBankAddress(workflow.BankAddress),
      accountHolderName:
        workflow.AccountHolderName != null ? String(workflow.AccountHolderName) : null,
    }
    const existingRows = await fetchUsdVirtualAccountRows(admin, subjectUserId, businessId)
    const fromDb = mergeUsdVirtualAccountFieldPartials(
      ...existingRows.map((r) => mergedUsdFieldsFromDbRow(r)),
    )
    const merged = mergeUsdVirtualAccountFieldPartials(fromPm ?? {}, fromDb ?? {}, partial)
    if (merged) {
      await upsertMergedUsdVirtualAccount(admin, {
        subjectUserId,
        businessId,
        noahCustomerId,
        merged,
      })
    }
    return
  }

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
