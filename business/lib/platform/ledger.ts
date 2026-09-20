import type { SupabaseClient } from "@supabase/supabase-js"
import { dispatchMerchantWebhook, type MerchantWebhookEvent } from "@/lib/checkout/merchant-webhooks"
import { newPublicId } from "@/lib/platform/ids"
import { ensurePlatformCustomerWalletOwner, ensurePlatformWalletOwner } from "@/lib/platform/wallet-owner"

export type PlatformAccountRow = {
  id: string
  business_id: string
  livemode: boolean
  currency: string
  available_cents: number
  pending_cents: number
  customer_id?: string | null
}

export function publicAccount(row: {
  id: string
  currency: string
  available_cents: number | null
  pending_cents: number | null
  livemode: boolean
  customer_id?: string | null
}) {
  return {
    id: row.id,
    currency: String(row.currency).toUpperCase(),
    available: Number(row.available_cents ?? 0),
    pending: Number(row.pending_cents ?? 0),
    customer: row.customer_id ?? null,
    livemode: Boolean(row.livemode),
  }
}

export async function listPlatformAccounts(
  admin: SupabaseClient,
  businessId: string,
  livemode: boolean,
  input?: { customerId?: string | null; issuedOnly?: boolean },
) {
  let query = admin
    .from("platform_accounts")
    .select("id, currency, available_cents, pending_cents, livemode, customer_id")
    .eq("business_id", businessId)
    .eq("livemode", livemode)
    .order("currency", { ascending: true })
  if (input?.customerId) query = query.eq("customer_id", input.customerId)
  else if (input?.issuedOnly) query = query.not("customer_id", "is", null)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(publicAccount)
}

export async function getOrCreatePlatformAccount(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    currency: string
    customerId?: string | null
    email?: string | null
    name?: string | null
  },
): Promise<PlatformAccountRow> {
  const currency = input.currency.trim().toUpperCase()
  const customerId = input.customerId?.trim() || null
  let existingQuery = admin
    .from("platform_accounts")
    .select("id, business_id, livemode, currency, available_cents, pending_cents, customer_id")
    .eq("business_id", input.businessId)
    .eq("livemode", input.livemode)
    .eq("currency", currency)
  existingQuery = customerId ? existingQuery.eq("customer_id", customerId) : existingQuery.is("customer_id", null)
  const { data: existing } = await existingQuery.maybeSingle()
  if (existing?.id) return existing as PlatformAccountRow

  const owner = customerId
    ? await ensurePlatformCustomerWalletOwner(admin, customerId, {
        email: String(input.email ?? "").trim() || `${customerId}@customers.easner.invalid`,
        name: input.name,
      })
    : await ensurePlatformWalletOwner(admin, input.businessId, {
        email: input.email,
        name: input.name,
      })
  const row = {
    id: newPublicId("acct"),
    business_id: input.businessId,
    livemode: input.livemode,
    currency,
    available_cents: 0,
    pending_cents: 0,
    customer_id: customerId,
    wallet_owner_id: owner.id,
  }
  const { data, error } = await admin.from("platform_accounts").insert(row).select("*").single()
  if (error) {
    let racedQuery = admin
      .from("platform_accounts")
      .select("id, business_id, livemode, currency, available_cents, pending_cents, customer_id")
      .eq("business_id", input.businessId)
      .eq("livemode", input.livemode)
      .eq("currency", currency)
    racedQuery = customerId ? racedQuery.eq("customer_id", customerId) : racedQuery.is("customer_id", null)
    const { data: raced } = await racedQuery.maybeSingle()
    if (raced?.id) return raced as PlatformAccountRow
    throw new Error(error.message)
  }
  await dispatchMerchantWebhook(admin, {
    businessId: input.businessId,
    event: "account.updated",
    data: publicAccount(data as PlatformAccountRow),
  })
  return data as PlatformAccountRow
}

export async function adjustPlatformAccount(
  admin: SupabaseClient,
  input: {
    accountId: string
    availableDelta: number
    pendingDelta?: number
  },
): Promise<PlatformAccountRow> {
  const { data: row } = await admin
    .from("platform_accounts")
    .select("id, business_id, livemode, currency, available_cents, pending_cents, customer_id")
    .eq("id", input.accountId)
    .maybeSingle()
  if (!row?.id) throw new Error("Account not found")
  const available = Number(row.available_cents ?? 0) + input.availableDelta
  const pending = Number(row.pending_cents ?? 0) + Number(input.pendingDelta ?? 0)
  if (available < 0) throw new Error("Insufficient available balance")
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("platform_accounts")
    .update({ available_cents: available, pending_cents: pending, updated_at: now })
    .eq("id", row.id)
    .select("id, business_id, livemode, currency, available_cents, pending_cents, customer_id")
    .single()
  if (error || !data) throw new Error(error?.message || "Could not update account")
  await dispatchMerchantWebhook(admin, {
    businessId: String(data.business_id),
    event: "account.updated",
    data: publicAccount(data as PlatformAccountRow),
  })
  return data as PlatformAccountRow
}

export async function insertPlatformTransaction(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    type: string
    amountCents: number
    currency: string
    direction: "in" | "out"
    status: string
    accountId?: string | null
    customerId?: string | null
    transferId?: string | null
    checkoutSessionId?: string | null
    description?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<{ id: string }> {
  const row = {
    id: newPublicId("txn"),
    business_id: input.businessId,
    livemode: input.livemode,
    type: input.type,
    amount_cents: input.amountCents,
    currency: input.currency.toUpperCase(),
    direction: input.direction,
    status: input.status,
    account_id: input.accountId ?? null,
    customer_id: input.customerId ?? null,
    transfer_id: input.transferId ?? null,
    checkout_session_id: input.checkoutSessionId ?? null,
    description: input.description ?? null,
    metadata: input.metadata ?? {},
  }
  const { data, error } = await admin.from("platform_transactions").insert(row).select("id").single()
  if (error || !data?.id) throw new Error(error?.message || "Could not write platform transaction")
  await dispatchMerchantWebhook(admin, {
    businessId: input.businessId,
    event: "transaction.created" as MerchantWebhookEvent,
    data: {
      id: data.id,
      type: row.type,
      amount: row.amount_cents,
      currency: row.currency,
      direction: row.direction,
      status: row.status,
      livemode: row.livemode,
    },
  })
  return { id: String(data.id) }
}

export async function creditPlatformBookFromCheckout(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    amountCents: number
    currency: string
    checkoutSessionId?: string | null
    description?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<{ accountId: string; transactionId: string }> {
  const account = await getOrCreatePlatformAccount(admin, {
    businessId: input.businessId,
    livemode: input.livemode,
    currency: input.currency,
  })
  await adjustPlatformAccount(admin, {
    accountId: account.id,
    availableDelta: input.amountCents,
  })
  const txn = await insertPlatformTransaction(admin, {
    businessId: input.businessId,
    livemode: input.livemode,
    type: "checkout",
    amountCents: input.amountCents,
    currency: input.currency,
    direction: "in",
    status: "completed",
    accountId: account.id,
    checkoutSessionId: input.checkoutSessionId,
    description: input.description ?? "Checkout",
    metadata: input.metadata,
  })
  return { accountId: account.id, transactionId: txn.id }
}

export function publicTransaction(row: {
  id: string
  type: string
  amount_cents: number
  currency: string
  direction: string
  status: string
  account_id?: string | null
  customer_id?: string | null
  transfer_id?: string | null
  checkout_session_id?: string | null
  description?: string | null
  livemode: boolean
  created_at: string
}) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount_cents ?? 0),
    currency: String(row.currency).toUpperCase(),
    direction: row.direction,
    status: row.status,
    account: row.account_id ?? null,
    customer: row.customer_id ?? null,
    transfer: row.transfer_id ?? null,
    checkout_session: row.checkout_session_id ?? null,
    description: row.description ?? null,
    livemode: Boolean(row.livemode),
    created: row.created_at,
  }
}
