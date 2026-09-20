import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { ensureBridgeExternalAccount } from "@/lib/bridge/external-accounts"
import { bridgeTransferDepositAddress, createBridgeOfframpTransfer } from "@/lib/bridge/transfers"
import { lockGridBalancePayoutQuote } from "@/lib/grid/payout-quote"
import { selectProviderForCorridor } from "@/lib/payout-providers"
import { mapProviderStatusToVerification } from "@/lib/platform/receive"
import { sendStablecoinFromWalletOwner } from "@/lib/platform/vault-send"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import { getTurnkeyDepositAddressesForWalletOwner } from "@/lib/wallet/turnkey-deposit-addresses"
import { lockYcBalancePayoutSend } from "@/lib/yellowcard/payout-quote"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
}

function railError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

export function destinationToRecipientRow(input: {
  type: string
  details: Record<string, unknown>
  currency: string
}): RecipientSellPrepareRow {
  const details = input.details
  const country = String(details.country ?? details.country_code ?? "").trim().toUpperCase()
  const destCurrency = String(details.currency ?? details.receive_currency ?? input.currency)
    .trim()
    .toUpperCase()
  const momo = input.type === "mobile_money"
  const transfer = String(details.transfer_type ?? details.rail ?? "").trim()
  const checking = String(details.checking_or_savings ?? "").trim().toLowerCase()
  return {
    country_code: country || null,
    full_name: String(details.account_holder ?? details.full_name ?? details.name ?? "Account holder").trim(),
    account_number: String(
      details.account_number ?? details.iban ?? details.phone ?? details.phone_number ?? details.account ?? "",
    ).trim(),
    bank_name: momo ? "Mobile Money" : String(details.bank_name ?? "Bank").trim() || "Bank",
    phone_number: String(details.phone ?? details.phone_number ?? "").trim() || null,
    currency: destCurrency || input.currency,
    routing_number: String(details.routing_number ?? "").trim() || null,
    iban: String(details.iban ?? "").trim() || null,
    transfer_type:
      transfer.toUpperCase() === "WIRE" ||
      transfer.toUpperCase() === "ACH" ||
      transfer.toUpperCase() === "RTP" ||
      transfer.toUpperCase() === "FEDNOW"
        ? (transfer.toUpperCase() as RecipientSellPrepareRow["transfer_type"])
        : null,
    checking_or_savings: checking === "savings" ? "savings" : checking === "checking" ? "checking" : null,
    address_line1: String(details.address_line1 ?? details.address ?? "").trim() || null,
    city: String(details.city ?? "").trim() || null,
    state: String(details.state ?? "").trim() || null,
    postal_code: String(details.postal_code ?? "").trim() || null,
    mobile_provider: String(details.network ?? details.mobile_provider ?? details.provider ?? "").trim() || null,
    sort_code: String(details.sort_code ?? "").trim() || null,
    swift_bic: String(details.swift_bic ?? details.bic ?? "").trim() || null,
    email: String(details.email ?? "").trim() || null,
    metadata: asMeta(details.metadata),
  }
}

async function persistDestinationExternalAccount(
  admin: SupabaseClient,
  destinationId: string,
  details: Record<string, unknown>,
  key: string,
  value: string,
) {
  const next = {
    ...details,
    metadata: { ...asMeta(details.metadata), [key]: value },
  }
  await admin
    .from("platform_destinations")
    .update({ details: next, updated_at: new Date().toISOString() })
    .eq("id", destinationId)
}

async function loadCustomerForPayout(
  admin: SupabaseClient,
  input: { businessId: string; customerId: string },
) {
  const { data } = await admin
    .from("platform_customers")
    .select("id, verification_status, metadata")
    .eq("id", input.customerId)
    .eq("business_id", input.businessId)
    .maybeSingle()
  return data
}

async function loadMerchantSenderProfile(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", userId)
    .maybeSingle()
  return {
    residenceCountry: data?.residence_country,
    kycIdType: data?.kyc_id_type,
    kycIdNumber: data?.kyc_id_number,
    ngLocalIdType: data?.ng_local_id_type,
    ngLocalIdNumber: data?.ng_local_id_number,
    fullName: data?.full_name,
    phone: data?.phone,
    email: data?.email,
    dateOfBirth: data?.date_of_birth,
    addressStreet: data?.kyc_address_street,
    addressCity: data?.kyc_address_city,
    addressCountry: data?.kyc_address_country,
  }
}

async function vaultAddressForSend(
  admin: SupabaseClient,
  walletOwnerId: string,
  currency: string,
): Promise<string> {
  const lines = await getTurnkeyDepositAddressesForWalletOwner(admin, walletOwnerId, { mode: "fast" })
  const wanted = currency === "EUR" ? lines.EUR : lines.USD
  return String(wanted.ownerAddress || wanted.address || "").trim()
}

async function executePlatformBridgeOfframp(
  admin: SupabaseClient,
  input: {
    bridgeCustomerId: string
    destinationId: string
    details: Record<string, unknown>
    recipient: RecipientSellPrepareRow
    amount: number
    currency: string
    walletOwnerId: string
  },
) {
  const existing = String(asMeta(input.details.metadata).bridge_external_account_id ?? "").trim()
  const recipient = {
    ...input.recipient,
    metadata: {
      ...asMeta(input.recipient.metadata),
      ...(existing ? { bridge_external_account_id: existing } : {}),
    },
  }
  const externalAccountId = await ensureBridgeExternalAccount({
    admin,
    customerId: input.bridgeCustomerId,
    recipient,
    accountOwnerType: "individual",
    idempotencyKey: `platform-ea:${input.destinationId}`,
  })
  await persistDestinationExternalAccount(
    admin,
    input.destinationId,
    input.details,
    "bridge_external_account_id",
    externalAccountId,
  )
  const transfer = await createBridgeOfframpTransfer({
    customerId: input.bridgeCustomerId,
    externalAccountId,
    recipient,
    cryptoAmount: input.amount,
    idempotencyKey: `platform-xfer:${input.destinationId}:${Math.round(input.amount * 100)}`,
  })
  const fundingAddress = bridgeTransferDepositAddress(transfer)
  if (!fundingAddress) throw railError("not_available", "Payout funding instructions are not ready")
  await sendStablecoinFromWalletOwner(admin, {
    walletOwnerId: input.walletOwnerId,
    asset: input.currency === "EUR" ? "EURC" : "USDC",
    destinationAddress: fundingAddress,
    amount: input.amount,
  })
}

async function executePlatformPartnerFundingSend(
  admin: SupabaseClient,
  input: {
    provider: "yellowcard" | "grid"
    businessId: string
    recipient: RecipientSellPrepareRow
    amount: number
    currency: string
    walletOwnerId: string
  },
) {
  const ownerId = await resolveBusinessOrgOwnerUserId(admin, input.businessId)
  if (!ownerId) throw railError("not_available", "Payout rails are not ready")
  const vaultAddress = await vaultAddressForSend(admin, input.walletOwnerId, input.currency)
  if (!vaultAddress) throw railError("not_available", "Customer vault is not ready")
  const senderProfile = await loadMerchantSenderProfile(admin, ownerId)
  if (input.provider === "yellowcard") {
    const locked = await lockYcBalancePayoutSend({
      userId: ownerId,
      customerUID: ownerId,
      recipient: input.recipient,
      receiveFiatAmount: input.amount,
      sourceBalanceCurrency: input.currency === "EUR" ? "EUR" : "USD",
      amountEntryMode: "send",
      sendBudget: input.amount,
      userTurnkeyAddress: vaultAddress,
      senderProfile,
    })
    const fundingAddress = String(locked.walletAddress ?? "").trim()
    if (!fundingAddress) throw railError("not_available", "Payout funding instructions are not ready")
    const cryptoAmount = Number(locked.cryptoAmount)
    if (!(cryptoAmount > 0) || cryptoAmount > input.amount + 0.05) {
      throw railError("not_available", "Payout quote does not match the send amount")
    }
    await sendStablecoinFromWalletOwner(admin, {
      walletOwnerId: input.walletOwnerId,
      asset: "USDC",
      destinationAddress: fundingAddress,
      amount: Math.min(cryptoAmount, input.amount),
    })
    return
  }
  const locked = await lockGridBalancePayoutQuote({
    admin,
    userId: ownerId,
    businessId: input.businessId,
    recipient: input.recipient,
    receiveFiatAmount: input.amount,
    sourceBalanceCurrency: "USD",
    amountEntryMode: "send",
    sendBudget: input.amount,
    senderProfile,
  })
  const fundingAddress = String(locked.fundingAddress ?? "").trim()
  if (!fundingAddress) throw railError("not_available", "Payout funding instructions are not ready")
  const cryptoAmount = Number(locked.cryptoAmount)
  if (!(cryptoAmount > 0) || cryptoAmount > input.amount + 0.05) {
    throw railError("not_available", "Payout quote does not match the send amount")
  }
  await sendStablecoinFromWalletOwner(admin, {
    walletOwnerId: input.walletOwnerId,
    asset: "USDC",
    destinationAddress: fundingAddress,
    amount: Math.min(cryptoAmount, input.amount),
  })
}

export async function executePlatformFiatPayout(
  admin: SupabaseClient,
  input: {
    businessId: string
    customerId: string | null
    destinationId: string
    destinationType: "bank" | "mobile_money"
    details: Record<string, unknown>
    amountCents: number
    currency: string
    walletOwnerId: string | null
  },
): Promise<void> {
  if (!input.walletOwnerId) throw railError("not_available", "Customer vault is not ready")
  if (!input.customerId) throw railError("not_available", "Customer is required for this payout")
  const customer = await loadCustomerForPayout(admin, {
    businessId: input.businessId,
    customerId: input.customerId,
  })
  if (!customer?.id) throw railError("not_found", "Customer not found")
  if (mapProviderStatusToVerification(customer.verification_status) !== "approved") {
    throw railError("verification_required", "Customer verification is required")
  }
  const recipient = destinationToRecipientRow({
    type: input.destinationType,
    details: input.details,
    currency: input.currency,
  })
  const country = resolveRecipientPayoutCountry(recipient)
  if (!country) throw railError("invalid_destination", "country is required")
  const amount = input.amountCents / 100
  const currency = input.currency.trim().toUpperCase() === "EUR" ? "EUR" : "USD"
  const bridgeCustomerId = String(asMeta(customer.metadata).bridge_customer_id ?? "").trim()

  if (input.destinationType === "bank" && bridgeCustomerId) {
    await executePlatformBridgeOfframp(admin, {
      bridgeCustomerId,
      destinationId: input.destinationId,
      details: input.details,
      recipient,
      amount,
      currency,
      walletOwnerId: input.walletOwnerId,
    })
    return
  }

  let providerId = ""
  try {
    const provider = await selectProviderForCorridor(admin, {
      countryCode: country,
      currencyCode: String(recipient.currency || currency).toUpperCase(),
      rail: input.destinationType === "mobile_money" ? "mobile_money" : "bank_transfer",
      mobileProvider: recipient.mobile_provider,
      bankName: recipient.bank_name,
      businessId: input.businessId,
      surface: "business",
    })
    providerId = String(provider.id ?? "").trim().toLowerCase()
  } catch {
    providerId = ""
  }

  if (providerId === "bridge" && bridgeCustomerId) {
    await executePlatformBridgeOfframp(admin, {
      bridgeCustomerId,
      destinationId: input.destinationId,
      details: input.details,
      recipient,
      amount,
      currency,
      walletOwnerId: input.walletOwnerId,
    })
    return
  }
  if (providerId === "yellowcard" || providerId === "grid") {
    await executePlatformPartnerFundingSend(admin, {
      provider: providerId,
      businessId: input.businessId,
      recipient,
      amount,
      currency,
      walletOwnerId: input.walletOwnerId,
    })
    return
  }
  if (bridgeCustomerId) {
    await executePlatformBridgeOfframp(admin, {
      bridgeCustomerId,
      destinationId: input.destinationId,
      details: input.details,
      recipient,
      amount,
      currency,
      walletOwnerId: input.walletOwnerId,
    })
    return
  }
  throw railError("not_available", "This corridor is not available from the customer vault")
}
