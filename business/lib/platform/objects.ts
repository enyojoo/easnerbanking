import type { SupabaseClient } from "@supabase/supabase-js"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { isEasetagGloballyAvailable, isUndefinedEasetagColumnError } from "@/lib/easetag-global"
import { normalizeEasetag, validateEasetag } from "@/lib/easetag-validation"
import { newPublicId } from "@/lib/platform/ids"
import {
  adjustPlatformAccount,
  getOrCreatePlatformAccount,
  insertPlatformTransaction,
  publicAccount,
} from "@/lib/platform/ledger"
import { executePlatformOutboundRail } from "@/lib/platform/send-rails"
import { ensurePlatformCustomerWalletOwner } from "@/lib/platform/wallet-owner"
import { buildWalletSendQuote } from "@/lib/wallet-send/wallet-send-quote"
import type { WalletRecipientRow } from "@/lib/wallet-send/validate-recipient"

export function publicCustomer(row: {
  id: string
  email?: string | null
  name?: string | null
  external_id?: string | null
  easetag?: string | null
  status?: string | null
  verification_status?: string | null
  livemode: boolean
  created_at: string
}) {
  return {
    id: row.id,
    email: row.email ?? null,
    name: row.name ?? null,
    external_id: row.external_id ?? null,
    easetag: row.easetag ?? null,
    status: row.status ?? "active",
    verification_status: row.verification_status ?? "unverified",
    livemode: Boolean(row.livemode),
    created: row.created_at,
  }
}

function railError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

export async function allocatePlatformEasetag(
  admin: SupabaseClient,
  input: { customerId: string; requested?: string | null; name?: string | null },
): Promise<string> {
  const requested = String(input.requested ?? "").trim()
  if (requested) {
    const tag = normalizeEasetag(requested)
    const valid = validateEasetag(tag)
    if (!valid.valid) throw railError("invalid_easetag", valid.error || "Invalid easetag")
    const available = await isEasetagGloballyAvailable(admin, tag, {
      excludePlatformCustomerId: input.customerId,
    })
    if (!available) throw railError("easetag_taken", "Easetag is taken")
    return tag
  }
  const fromName = normalizeEasetag(String(input.name ?? "").replace(/[^a-z0-9]/gi, "")).slice(0, 10)
  const idSlug = input.customerId.replace(/^cus_/, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)
  const candidates = [fromName, idSlug, `c${idSlug}`.slice(0, 10)].filter((tag) => validateEasetag(tag).valid)
  for (const tag of candidates) {
    if (await isEasetagGloballyAvailable(admin, tag, { excludePlatformCustomerId: input.customerId })) {
      return tag
    }
  }
  for (let i = 0; i < 24; i++) {
    const tag = `c${Math.random().toString(36).slice(2, 10)}`.slice(0, 10)
    if (!validateEasetag(tag).valid) continue
    if (await isEasetagGloballyAvailable(admin, tag, { excludePlatformCustomerId: input.customerId })) {
      return tag
    }
  }
  throw railError("easetag_taken", "Could not allocate easetag")
}

export function publicDestination(row: {
  id: string
  type: string
  customer_id?: string | null
  details?: Record<string, unknown> | null
  livemode: boolean
  created_at: string
}) {
  return {
    id: row.id,
    type: row.type,
    customer: row.customer_id ?? null,
    details: row.details ?? {},
    livemode: Boolean(row.livemode),
    created: row.created_at,
  }
}

export function publicQuote(row: {
  id: string
  source_account_id?: string | null
  destination_id?: string | null
  send_cents: number
  receive_cents: number
  send_currency: string
  receive_currency: string
  expires_at: string
  status: string
  livemode: boolean
}) {
  return {
    id: row.id,
    source: row.source_account_id ?? null,
    destination: row.destination_id ?? null,
    send: { amount: Number(row.send_cents), currency: row.send_currency },
    receive: { amount: Number(row.receive_cents), currency: row.receive_currency },
    expires_at: row.expires_at,
    status: row.status,
    livemode: Boolean(row.livemode),
  }
}

export function publicTransfer(row: {
  id: string
  quote_id?: string | null
  source_account_id?: string | null
  destination_id?: string | null
  amount_cents: number
  currency: string
  status: string
  livemode: boolean
  created_at: string
}) {
  return {
    id: row.id,
    quote: row.quote_id ?? null,
    source: row.source_account_id ?? null,
    destination: row.destination_id ?? null,
    amount: Number(row.amount_cents),
    currency: String(row.currency).toUpperCase(),
    status: row.status,
    livemode: Boolean(row.livemode),
    created: row.created_at,
  }
}

export async function createPlatformCustomer(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    email?: string | null
    name?: string | null
    externalId?: string | null
    easetag?: string | null
  },
) {
  const id = newPublicId("cus")
  const easetag = await allocatePlatformEasetag(admin, {
    customerId: id,
    requested: input.easetag,
    name: input.name,
  })
  const email = String(input.email ?? "").trim().toLowerCase() || null
  let walletOwnerId: string | null = null
  if (email) {
    const owner = await ensurePlatformCustomerWalletOwner(admin, id, {
      email,
      name: input.name,
    })
    walletOwnerId = owner.id
  }
  const now = new Date().toISOString()
  const row = {
    id,
    business_id: input.businessId,
    livemode: input.livemode,
    email,
    name: String(input.name ?? "").trim() || null,
    external_id: String(input.externalId ?? "").trim() || null,
    easetag,
    wallet_owner_id: walletOwnerId,
    verification_status: "unverified",
    created_at: now,
    updated_at: now,
  }
  let { data, error } = await admin.from("platform_customers").insert(row).select("*").single()
  if (error && isUndefinedEasetagColumnError(error)) {
    const { easetag: _dropped, ...withoutTag } = row
    const retry = await admin.from("platform_customers").insert(withoutTag).select("*").single()
    data = retry.data
    error = retry.error
  }
  if (error || !data) throw new Error(error?.message || "Could not create customer")
  const account = await getOrCreatePlatformAccount(admin, {
    businessId: input.businessId,
    livemode: input.livemode,
    currency: "USD",
    customerId: id,
    email,
    name: input.name,
  })
  const mapped = publicCustomer(data as Parameters<typeof publicCustomer>[0])
  await dispatchMerchantWebhook(admin, {
    businessId: input.businessId,
    event: "customer.created",
    data: mapped,
  })
  return { ...mapped, accounts: [publicAccount(account)] }
}

export async function createPlatformDestination(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    type: "bank" | "mobile_money" | "wallet" | "easetag"
    customerId?: string | null
    details: Record<string, unknown>
  },
) {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("platform_destinations")
    .insert({
      id: newPublicId("dest"),
      business_id: input.businessId,
      livemode: input.livemode,
      type: input.type,
      customer_id: input.customerId ?? null,
      details: input.details,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single()
  if (error || !data) throw new Error(error?.message || "Could not create destination")
  return publicDestination(data as Parameters<typeof publicDestination>[0])
}

function walletRecipientFromDestination(row: {
  id: string
  type?: string | null
  details?: Record<string, unknown> | null
}): WalletRecipientRow | null {
  if (String(row.type ?? "") !== "wallet") return null
  const details = row.details ?? {}
  const address = String(details.address ?? details.account ?? details.account_number ?? "").trim()
  const network = String(details.network ?? details.wallet_network ?? "").trim()
  const currency = String(details.currency ?? details.asset ?? "USDC").trim().toUpperCase()
  if (!address || !network) return null
  return {
    id: row.id,
    user_id: "",
    account_number: address,
    currency,
    wallet_network: network,
    bank_name: "Wallet",
    full_name: "Platform transfer",
  }
}

async function quotePlatformWalletSend(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    destinationId?: string | null
    amountCents: number
    sendCurrency: string
    receiveCurrency: string
  },
): Promise<{ sendCents: number; receiveCents: number; receiveCurrency: string } | null> {
  if (!input.livemode || !input.destinationId) return null
  const { data: destination } = await admin
    .from("platform_destinations")
    .select("id, type, details")
    .eq("id", input.destinationId)
    .eq("business_id", input.businessId)
    .maybeSingle()
  if (!destination) return null
  const recipient = walletRecipientFromDestination(destination as {
    id: string
    type?: string | null
    details?: Record<string, unknown> | null
  })
  if (!recipient) return null
  const sourceBalanceCurrency = input.sendCurrency === "EUR" ? "EUR" : "USD"
  try {
    const quote = await buildWalletSendQuote({
      admin,
      recipient,
      sourceBalanceCurrency,
      amountEntryMode: "send",
      sendAmount: input.amountCents / 100,
      destinationRef: `platform_destination:${destination.id}`,
      businessId: input.businessId,
    })
    return {
      sendCents: Math.round(quote.totalDebited * 100),
      receiveCents: Math.round(quote.receiveAmount * 100),
      receiveCurrency: String(quote.receiveCurrency || input.receiveCurrency).toUpperCase(),
    }
  } catch (error) {
    console.error("[platform-quote] wallet-send pricing failed, using 1:1:", error)
    return null
  }
}

export async function createPlatformQuote(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    sourceAccountId?: string | null
    destinationId?: string | null
    amountCents: number
    sendCurrency: string
    receiveCurrency?: string | null
  },
) {
  const sendCurrency = input.sendCurrency.toUpperCase()
  const receiveCurrency = String(input.receiveCurrency ?? sendCurrency).toUpperCase()
  const priced = await quotePlatformWalletSend(admin, {
    businessId: input.businessId,
    livemode: input.livemode,
    destinationId: input.destinationId,
    amountCents: input.amountCents,
    sendCurrency,
    receiveCurrency,
  })
  const sendCents = priced?.sendCents ?? input.amountCents
  const receiveCents = priced?.receiveCents ?? input.amountCents
  const quotedReceiveCurrency = priced?.receiveCurrency ?? receiveCurrency
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  const { data, error } = await admin
    .from("platform_quotes")
    .insert({
      id: newPublicId("qt"),
      business_id: input.businessId,
      livemode: input.livemode,
      source_account_id: input.sourceAccountId ?? null,
      destination_id: input.destinationId ?? null,
      send_cents: sendCents,
      receive_cents: receiveCents,
      send_currency: sendCurrency,
      receive_currency: quotedReceiveCurrency,
      expires_at: expiresAt,
      status: "open",
    })
    .select("*")
    .single()
  if (error || !data) throw new Error(error?.message || "Could not create quote")
  return publicQuote(data as Parameters<typeof publicQuote>[0])
}

export async function executePlatformTransfer(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    quoteId?: string | null
    sourceAccountId?: string | null
    destinationId?: string | null
    amountCents?: number | null
    currency?: string | null
    idempotencyKey?: string | null
  },
) {
  if (input.idempotencyKey) {
    const { data: existing } = await admin
      .from("platform_transfers")
      .select("*")
      .eq("business_id", input.businessId)
      .eq("livemode", input.livemode)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle()
    if (existing?.id) return publicTransfer(existing as Parameters<typeof publicTransfer>[0])
  }

  let amountCents = input.amountCents ?? 0
  let currency = String(input.currency ?? "USD").toUpperCase()
  let sourceAccountId = input.sourceAccountId ?? null
  let destinationId = input.destinationId ?? null
  if (input.quoteId) {
    const { data: quote } = await admin
      .from("platform_quotes")
      .select("*")
      .eq("id", input.quoteId)
      .eq("business_id", input.businessId)
      .maybeSingle()
    if (!quote?.id) throw new Error("Quote not found")
    if (new Date(String(quote.expires_at)).getTime() < Date.now()) throw new Error("Quote expired")
    amountCents = Number(quote.send_cents)
    currency = String(quote.send_currency).toUpperCase()
    sourceAccountId = sourceAccountId || (quote.source_account_id as string | null)
    destinationId = destinationId || (quote.destination_id as string | null)
  }
  if (amountCents <= 0) throw new Error("amount must be a positive integer in cents")

  if (!sourceAccountId) throw new Error("source is required")
  const { data: sourceAccount } = await admin
    .from("platform_accounts")
    .select("id, customer_id, wallet_owner_id")
    .eq("id", sourceAccountId)
    .eq("business_id", input.businessId)
    .eq("livemode", input.livemode)
    .maybeSingle()
  if (!sourceAccount?.id) throw new Error("Account not found")
  const source = sourceAccount.id
  const customerId = (sourceAccount.customer_id as string | null) ?? null
  const walletOwnerId = (sourceAccount.wallet_owner_id as string | null) ?? null

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("platform_transfers")
    .insert({
      id: newPublicId("tr"),
      business_id: input.businessId,
      livemode: input.livemode,
      quote_id: input.quoteId ?? null,
      source_account_id: source,
      destination_id: destinationId,
      amount_cents: amountCents,
      currency,
      status: "created",
      idempotency_key: input.idempotencyKey ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single()
  if (error || !data) throw new Error(error?.message || "Could not create transfer")

  const created = publicTransfer(data as Parameters<typeof publicTransfer>[0])
  await dispatchMerchantWebhook(admin, {
    businessId: input.businessId,
    event: "transfer.created",
    data: created,
  })

  let debited = false
  try {
    await adjustPlatformAccount(admin, { accountId: source, availableDelta: -amountCents })
    debited = true
    if (input.livemode) {
      await executePlatformOutboundRail(admin, {
        businessId: input.businessId,
        customerId,
        destinationId,
        amountCents,
        currency,
        walletOwnerId,
      })
    }
    await insertPlatformTransaction(admin, {
      businessId: input.businessId,
      livemode: input.livemode,
      type: "transfer",
      amountCents,
      currency,
      direction: "out",
      status: "completed",
      accountId: source,
      customerId,
      transferId: created.id,
      description: "Transfer",
    })
    const completedAt = new Date().toISOString()
    const { data: completed } = await admin
      .from("platform_transfers")
      .update({ status: "completed", updated_at: completedAt })
      .eq("id", created.id)
      .select("*")
      .single()
    const mapped = publicTransfer((completed ?? data) as Parameters<typeof publicTransfer>[0])
    await dispatchMerchantWebhook(admin, {
      businessId: input.businessId,
      event: "transfer.completed",
      data: mapped,
    })
    return mapped
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transfer failed"
    if (debited) {
      await adjustPlatformAccount(admin, { accountId: source, availableDelta: amountCents }).catch(() => {})
    }
    await admin
      .from("platform_transfers")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", created.id)
    await dispatchMerchantWebhook(admin, {
      businessId: input.businessId,
      event: "transfer.failed",
      data: { ...created, status: "failed", error: message },
    })
    throw err
  }
}
