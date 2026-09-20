import type { SupabaseClient } from "@supabase/supabase-js"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import {
  createBridgeKycLink,
  bridgeCreateKycLinkIdempotencyKey,
  resolveBridgeCustomerKycStatus,
} from "@/lib/bridge/kyc-links"
import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"
import { newPublicId } from "@/lib/platform/ids"
import { publicCustomer } from "@/lib/platform/objects"
import { creditPlatformAccountFromInbound } from "@/lib/platform/ledger"
import { provisionPlatformCustomerVaults } from "@/lib/platform/wallet-owner"
import { getTurnkeyDepositAddressesForWalletOwner } from "@/lib/wallet/turnkey-deposit-addresses"
import { createBridgeVirtualAccountForVault } from "@/lib/bridge/virtual-accounts"
import { stripeOnramp } from "@/lib/stripe/onramp-client"
import { getStripePublishableKey } from "@/lib/stripe/config"
import {
  isStripeOnrampFailedStatus,
  isStripeOnrampFulfilledStatus,
  normalizeStripeOnrampSessionStatus,
} from "@/lib/stripe/onramp-session-status"

export type PlatformVerificationStatus = "unverified" | "pending" | "approved" | "rejected"

export type IssuedAccountRow = {
  id: string
  business_id: string
  livemode: boolean
  currency: string
  customer_id: string | null
  wallet_owner_id: string | null
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
}

export function mapProviderStatusToVerification(status: string | null | undefined): PlatformVerificationStatus {
  const s = String(status ?? "").trim().toLowerCase()
  if (s === "approved") return "approved"
  if (s === "rejected" || s === "denied") return "rejected"
  if (s === "unverified" || s === "not_started" || !s) return "unverified"
  return "pending"
}

export async function loadIssuedAccount(
  admin: SupabaseClient,
  input: { businessId: string; livemode: boolean; accountId: string },
): Promise<IssuedAccountRow | null> {
  const { data } = await admin
    .from("platform_accounts")
    .select("id, business_id, livemode, currency, customer_id, wallet_owner_id")
    .eq("id", input.accountId)
    .eq("business_id", input.businessId)
    .eq("livemode", input.livemode)
    .maybeSingle()
  if (!data?.id || !data.customer_id) return null
  return data as IssuedAccountRow
}

export async function loadPlatformCustomer(
  admin: SupabaseClient,
  input: { businessId: string; livemode: boolean; customerId: string },
) {
  const { data } = await admin
    .from("platform_customers")
    .select("id, business_id, livemode, email, name, external_id, easetag, status, verification_status, metadata, wallet_owner_id, created_at")
    .eq("id", input.customerId)
    .eq("business_id", input.businessId)
    .eq("livemode", input.livemode)
    .maybeSingle()
  return data
}

export function publicCustomerWithVerification(row: Parameters<typeof publicCustomer>[0] & {
  verification_status?: string | null
}) {
  return {
    ...publicCustomer(row),
    verification_status: mapProviderStatusToVerification(row.verification_status),
  }
}

export async function setPlatformCustomerVerification(
  admin: SupabaseClient,
  input: {
    customerId: string
    status: PlatformVerificationStatus
    metadata?: Record<string, unknown>
  },
) {
  const { data: current } = await admin
    .from("platform_customers")
    .select("id, business_id, livemode, email, name, external_id, easetag, status, verification_status, metadata, created_at")
    .eq("id", input.customerId)
    .maybeSingle()
  if (!current?.id) return null
  const nextMeta = { ...asMeta(current.metadata), ...(input.metadata ?? {}) }
  const now = new Date().toISOString()
  const { data } = await admin
    .from("platform_customers")
    .update({
      verification_status: input.status,
      metadata: nextMeta,
      updated_at: now,
    })
    .eq("id", current.id)
    .select("id, business_id, livemode, email, name, external_id, easetag, status, verification_status, created_at")
    .single()
  if (!data) return null
  if (String(current.verification_status) !== input.status) {
    await dispatchMerchantWebhook(admin, {
      businessId: String(data.business_id),
      event: "customer.updated",
      data: publicCustomerWithVerification(data),
    })
  }
  return data
}

export async function findPlatformCustomerByBridgeId(
  admin: SupabaseClient,
  bridgeCustomerId: string,
) {
  const id = String(bridgeCustomerId ?? "").trim()
  if (!id) return null
  const { data } = await admin
    .from("platform_customers")
    .select("id, business_id, livemode, email, name, verification_status, metadata")
    .filter("metadata->>bridge_customer_id", "eq", id)
    .maybeSingle()
  return data
}

export async function startPlatformCustomerVerification(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    customerId: string
    returnUrl?: string | null
  },
): Promise<{ status: PlatformVerificationStatus; url: string | null }> {
  const customer = await loadPlatformCustomer(admin, input)
  if (!customer?.id) throw new Error("Customer not found")
  if (mapProviderStatusToVerification(customer.verification_status) === "approved") {
    return { status: "approved", url: null }
  }
  if (!input.livemode) {
    await setPlatformCustomerVerification(admin, {
      customerId: customer.id,
      status: "approved",
      metadata: { verification_mode: "test" },
    })
    return { status: "approved", url: null }
  }
  const email = String(customer.email ?? "").trim()
  if (!email.includes("@")) throw new Error("email is required to start verification")
  const fullName = String(customer.name ?? "").trim() || "Customer"
  const created = await createBridgeKycLink({
    fullName,
    email,
    type: "individual",
    redirectUri: input.returnUrl,
    idempotencyKey: bridgeCreateKycLinkIdempotencyKey({
      type: "individual",
      subjectId: customer.id,
      fullName,
    }),
  })
  const url = String(created.kyc_link ?? created.tos_link ?? "").trim() || null
  const providerStatus = resolveBridgeCustomerKycStatus(created)
  const status = mapProviderStatusToVerification(providerStatus === "approved" ? "approved" : "pending")
  await setPlatformCustomerVerification(admin, {
    customerId: customer.id,
    status,
    metadata: {
      bridge_kyc_link_id: created.id ?? null,
      bridge_customer_id: created.customer_id ?? asMeta(customer.metadata).bridge_customer_id ?? null,
    },
  })
  return { status, url }
}

export function sandboxBankInstructions(input: {
  currency: string
  accountHolder: string
}): Record<string, unknown> {
  const currency = input.currency.trim().toUpperCase()
  if (currency === "EUR") {
    return {
      type: "bank",
      currency: "EUR",
      account_holder: input.accountHolder,
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      bank_name: "Easner Test Bank",
      country: "DE",
    }
  }
  return {
    type: "bank",
    currency: "USD",
    account_holder: input.accountHolder,
    account_number: "000123456789",
    routing_number: "110000000",
    bank_name: "Easner Test Bank",
    country: "US",
  }
}

export async function getDepositInstructions(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    accountId: string
  },
): Promise<Record<string, unknown>> {
  const account = await loadIssuedAccount(admin, input)
  if (!account) throw new Error("Account not found")
  const customer = await loadPlatformCustomer(admin, {
    businessId: input.businessId,
    livemode: input.livemode,
    customerId: String(account.customer_id),
  })
  if (!customer) throw new Error("Customer not found")
  const holder = String(customer.name ?? "").trim() || "Customer"
  if (!input.livemode) {
    return sandboxBankInstructions({ currency: account.currency, accountHolder: holder })
  }
  if (mapProviderStatusToVerification(customer.verification_status) !== "approved") {
    throw Object.assign(new Error("Customer verification is required"), { code: "verification_required" })
  }
  const { data: cached } = await admin
    .from("platform_deposit_instructions")
    .select("details")
    .eq("account_id", account.id)
    .eq("rail", "bank")
    .eq("currency", account.currency)
    .maybeSingle()
  if (cached?.details && typeof cached.details === "object") {
    return cached.details as Record<string, unknown>
  }
  const details = await provisionLiveBankInstructions(admin, {
    account,
    customer,
    holder,
  })
  if (!details) {
    throw Object.assign(new Error("Deposit instructions are not ready yet"), { code: "not_available" })
  }
  await admin.from("platform_deposit_instructions").upsert(
    {
      id: newPublicId("ins"),
      business_id: input.businessId,
      account_id: account.id,
      customer_id: account.customer_id,
      livemode: true,
      rail: "bank",
      currency: account.currency,
      details,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,rail,currency" },
  )
  return details
}

async function provisionLiveBankInstructions(
  admin: SupabaseClient,
  input: {
    account: IssuedAccountRow
    customer: { id: string; metadata?: unknown }
    holder: string
  },
): Promise<Record<string, unknown> | null> {
  const bridgeCustomerId = String(asMeta(input.customer.metadata).bridge_customer_id ?? "").trim()
  if (!bridgeCustomerId || !input.account.wallet_owner_id) return null
  const currency = input.account.currency.trim().toUpperCase()
  const sourceCurrency = currency === "EUR" ? "eur" : "usd"
  const destCurrency = currency === "EUR" ? "eurc" : "usdc"
  const lines = await getTurnkeyDepositAddressesForWalletOwner(admin, input.account.wallet_owner_id, {
    mode: "ensure",
  })
  const vaultAddress = String((currency === "EUR" ? lines.EUR : lines.USD).ownerAddress || "").trim()
  if (!vaultAddress) return null
  try {
    const va = await createBridgeVirtualAccountForVault({
      customerId: bridgeCustomerId,
      sourceCurrency,
      vaultAddress,
      destCurrency,
      idempotencyKey: `platform-va-${sourceCurrency}:${input.account.id}`,
    })
    const src = va.source_deposit_instructions ?? {}
    return {
      type: "bank",
      currency,
      account_holder: src.account_holder_name || src.bank_beneficiary_name || input.holder,
      account_number: src.account_number || src.bank_account_number || null,
      routing_number: src.routing_number || src.bank_routing_number || null,
      iban: src.iban || null,
      bic: src.bic || src.swift || null,
      bank_name: src.bank_name || null,
      country: currency === "EUR" ? "DE" : "US",
    }
  } catch (error) {
    console.warn("[platform] live bank instructions:", error instanceof Error ? error.message : error)
    return null
  }
}

export async function getDepositAddresses(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    accountId: string
  },
): Promise<{ currency: string; network: string; address: string; asset: string }[]> {
  const account = await loadIssuedAccount(admin, input)
  if (!account) throw new Error("Account not found")
  const customer = await loadPlatformCustomer(admin, {
    businessId: input.businessId,
    livemode: input.livemode,
    customerId: String(account.customer_id),
  })
  if (!customer) throw new Error("Customer not found")
  if (input.livemode && mapProviderStatusToVerification(customer.verification_status) !== "approved") {
    throw Object.assign(new Error("Customer verification is required"), { code: "verification_required" })
  }
  if (!account.wallet_owner_id) {
    return []
  }
  await provisionPlatformCustomerVaults(admin, account.wallet_owner_id)
  const lines = await getTurnkeyDepositAddressesForWalletOwner(admin, account.wallet_owner_id, {
    mode: input.livemode ? "ensure" : "fast",
  })
  const wanted = account.currency.trim().toUpperCase() === "EUR" ? lines.EUR : lines.USD
  const address = String(wanted.address || wanted.ownerAddress || "").trim()
  if (!address) return []
  return [
    {
      currency: account.currency.toUpperCase(),
      network: String(wanted.chain || "solana").toLowerCase(),
      address,
      asset: wanted.stablecoin,
    },
  ]
}

export async function createPlatformOnrampSession(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    accountId: string
    amountCents: number
    currency?: string | null
    returnUrl?: string | null
  },
) {
  const account = await loadIssuedAccount(admin, input)
  if (!account) throw new Error("Account not found")
  const customer = await loadPlatformCustomer(admin, {
    businessId: input.businessId,
    livemode: input.livemode,
    customerId: String(account.customer_id),
  })
  if (!customer) throw new Error("Customer not found")
  if (input.livemode && mapProviderStatusToVerification(customer.verification_status) !== "approved") {
    throw Object.assign(new Error("Customer verification is required"), { code: "verification_required" })
  }
  const currency = String(input.currency ?? account.currency).toUpperCase()
  let stripeSessionId: string | null = null
  let clientSecret: string | null = null
  let walletAddress: string | null = null
  if (input.livemode) {
    if (!account.wallet_owner_id) {
      throw Object.assign(new Error("Customer vault is not ready"), { code: "not_available" })
    }
    await provisionPlatformCustomerVaults(admin, account.wallet_owner_id)
    const lines = await getTurnkeyDepositAddressesForWalletOwner(admin, account.wallet_owner_id, {
      mode: "ensure",
    })
    const wanted = currency === "EUR" ? lines.EUR : lines.USD
    walletAddress = String(wanted.ownerAddress || wanted.address || "").trim()
    if (!walletAddress) {
      throw Object.assign(new Error("Customer vault is not ready"), { code: "not_available" })
    }
    const destCurrency = currency === "EUR" ? "eurc" : "usdc"
    const created = await stripeOnramp.createHostedSession({
      wallet_addresses: { solana: walletAddress },
      destination_currencies: [destCurrency],
      destination_networks: ["solana"],
      source_amount: (input.amountCents / 100).toFixed(2),
      source_currency: currency === "EUR" ? "eur" : "usd",
      lock_wallet_address: true,
    })
    stripeSessionId = String((created as { id?: string }).id ?? "").trim() || null
    clientSecret =
      String((created as { client_secret?: string }).client_secret ?? "").trim() || null
    if (!stripeSessionId || !clientSecret) {
      throw Object.assign(new Error("Could not start card onramp"), { code: "not_available" })
    }
  }
  const id = newPublicId("ors")
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("platform_onramp_sessions")
    .insert({
      id,
      business_id: input.businessId,
      account_id: account.id,
      customer_id: account.customer_id,
      livemode: input.livemode,
      amount_cents: input.amountCents,
      currency,
      status: "open",
      return_url: input.returnUrl ?? null,
      stripe_session_id: stripeSessionId,
      metadata: {
        ...(walletAddress ? { wallet_address: walletAddress } : {}),
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      },
      created_at: now,
      updated_at: now,
    })
    .select("id, status, amount_cents, currency, livemode, return_url")
    .single()
  if (error || !data) throw new Error(error?.message || "Could not create onramp session")
  const origin = getBusinessAppPublicOrigin()
  return {
    id: data.id,
    status: data.status,
    amount: Number(data.amount_cents),
    currency: String(data.currency).toUpperCase(),
    livemode: Boolean(data.livemode),
    url: `${origin}/receive/onramp/${data.id}`,
  }
}

export async function getPlatformOnrampSession(admin: SupabaseClient, sessionId: string) {
  const { data } = await admin
    .from("platform_onramp_sessions")
    .select("id, amount_cents, currency, status, livemode, return_url, metadata")
    .eq("id", sessionId)
    .maybeSingle()
  if (!data?.id) return null
  const meta = asMeta(data.metadata)
  const clientSecret = String(meta.client_secret ?? "").trim() || null
  return {
    id: data.id,
    amount: Number(data.amount_cents),
    currency: String(data.currency).toUpperCase(),
    status: String(data.status),
    livemode: Boolean(data.livemode),
    return_url: data.return_url ?? null,
    client_secret: clientSecret,
    publishable_key: data.livemode ? getStripePublishableKey(true) || null : null,
  }
}

export async function findPlatformOnrampInboundKey(
  admin: SupabaseClient,
  input: { accountId: string; amountCents: number; walletAddress?: string | null },
): Promise<string | null> {
  const { data: rows } = await admin
    .from("platform_onramp_sessions")
    .select("id, amount_cents, metadata, status")
    .eq("account_id", input.accountId)
    .in("status", ["open", "processing", "completed"])
    .order("created_at", { ascending: false })
    .limit(8)
  const wallet = String(input.walletAddress ?? "").trim()
  for (const row of rows ?? []) {
    const meta = asMeta(row.metadata)
    const addr = String(meta.wallet_address ?? "").trim()
    if (wallet && addr && addr !== wallet) continue
    if (Math.abs(Number(row.amount_cents) - input.amountCents) > 100) continue
    return `onramp:${row.id}`
  }
  return null
}

export async function creditPlatformOnrampFromStripeSession(
  admin: SupabaseClient,
  stripeSession: Record<string, unknown>,
): Promise<boolean> {
  const stripeSessionId = String(stripeSession.id ?? "").trim()
  if (!stripeSessionId) return false
  const status = normalizeStripeOnrampSessionStatus(stripeSession.status)
  if (!isStripeOnrampFulfilledStatus(status)) return false
  const { data: session } = await admin
    .from("platform_onramp_sessions")
    .select("id, account_id, amount_cents, status, return_url")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle()
  if (!session?.id) return false
  await creditPlatformAccountFromInbound(admin, {
    accountId: String(session.account_id),
    amountCents: Number(session.amount_cents),
    type: "onramp",
    description: "Onramp",
    inboundKey: `onramp:${session.id}`,
  })
  if (session.status !== "completed") {
    await admin
      .from("platform_onramp_sessions")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", session.id)
  }
  return true
}

export async function completePlatformOnrampSession(
  admin: SupabaseClient,
  sessionId: string,
): Promise<{ status: string; return_url: string | null }> {
  const { data: session } = await admin
    .from("platform_onramp_sessions")
    .select("id, account_id, amount_cents, currency, status, livemode, return_url, stripe_session_id")
    .eq("id", sessionId)
    .maybeSingle()
  if (!session?.id) throw new Error("Session not found")
  if (session.status === "completed") {
    return { status: "completed", return_url: session.return_url ?? null }
  }
  if (session.livemode) {
    const stripeSessionId = String(session.stripe_session_id ?? "").trim()
    if (!stripeSessionId) {
      throw Object.assign(new Error("Live onramp is not ready"), { code: "not_available" })
    }
    const stripeSession = await stripeOnramp.retrieveSession(stripeSessionId)
    const stripeStatus = normalizeStripeOnrampSessionStatus(
      (stripeSession as { status?: unknown }).status,
    )
    if (isStripeOnrampFailedStatus(stripeStatus)) {
      await admin
        .from("platform_onramp_sessions")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", session.id)
      return { status: "failed", return_url: session.return_url ?? null }
    }
    if (!isStripeOnrampFulfilledStatus(stripeStatus)) {
      return { status: "open", return_url: session.return_url ?? null }
    }
  }
  await creditPlatformAccountFromInbound(admin, {
    accountId: String(session.account_id),
    amountCents: Number(session.amount_cents),
    type: "onramp",
    description: "Onramp",
    inboundKey: `onramp:${session.id}`,
  })
  await admin
    .from("platform_onramp_sessions")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", session.id)
  return { status: "completed", return_url: session.return_url ?? null }
}

export async function applyBridgeVerificationToPlatformCustomer(
  admin: SupabaseClient,
  bridgeCustomerId: string,
  providerStatus: string,
) {
  const customer = await findPlatformCustomerByBridgeId(admin, bridgeCustomerId)
  if (!customer?.id) return null
  return setPlatformCustomerVerification(admin, {
    customerId: customer.id,
    status: mapProviderStatusToVerification(providerStatus),
    metadata: { bridge_customer_id: bridgeCustomerId },
  })
}

export async function creditPlatformAccountFromBridgeDeposit(
  admin: SupabaseClient,
  input: { bridgeCustomerId: string; amount: number; currency: string; depositId: string },
) {
  const customer = await findPlatformCustomerByBridgeId(admin, input.bridgeCustomerId)
  if (!customer?.id) return null
  const currency = input.currency.trim().toUpperCase() === "EUR" ? "EUR" : "USD"
  const { data: account } = await admin
    .from("platform_accounts")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("currency", currency)
    .maybeSingle()
  if (!account?.id) return null
  const cents = Math.round(Number(input.amount) * 100)
  if (!(cents > 0)) return null
  return creditPlatformAccountFromInbound(admin, {
    accountId: account.id,
    amountCents: cents,
    type: "deposit",
    description: "Bank deposit",
    inboundKey: `deposit:${input.depositId}`,
  })
}
