import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import type { WalletRecipientRow } from "@/lib/wallet-send/validate-recipient"
import { destinationReference } from "@/lib/destination-reference"
import { parseUsBankTransferType } from "@easner/shared"

export type SendDestinationType = "bank" | "mobile_money" | "wallet"

export interface SendDestinationRow extends RecipientSellPrepareRow {
  id: string
  destinationRef: string
  type: SendDestinationType
  wallet_network?: string | null
}

export type SendDestinationDbRow = {
  id: unknown
  type?: unknown
  full_name?: unknown
  country_code?: unknown
  currency?: unknown
  account_number?: unknown
  bank_name?: unknown
  phone_number?: unknown
  email?: unknown
  mobile_provider?: unknown
  wallet_network?: unknown
  routing_number?: unknown
  sort_code?: unknown
  iban?: unknown
  swift_bic?: unknown
  transfer_type?: unknown
  checking_or_savings?: unknown
  address_line1?: unknown
  city?: unknown
  state?: unknown
  postal_code?: unknown
  metadata?: unknown
}

const stringOrNull = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : ""
  return text || null
}

export function sendDestinationFromRow(
  row: SendDestinationDbRow,
  source: "recipient" | "payroll_method",
): SendDestinationRow {
  const methodType = String(row.type || "")
  const type: SendDestinationType =
    methodType === "mobile_money" || row.mobile_provider
      ? "mobile_money"
      : methodType === "stablecoin" || row.wallet_network
        ? "wallet"
        : "bank"
  const id = String(row.id)
  return {
    id,
    destinationRef: destinationReference(source, id),
    type,
    full_name: String(row.full_name || "").trim(),
    country_code: stringOrNull(row.country_code),
    currency: String(row.currency || "").trim().toUpperCase(),
    account_number: String(row.account_number || "").trim(),
    bank_name: String(row.bank_name || "").trim(),
    phone_number: stringOrNull(row.phone_number),
    email: stringOrNull(row.email),
    mobile_provider: stringOrNull(row.mobile_provider),
    wallet_network: stringOrNull(row.wallet_network),
    routing_number: stringOrNull(row.routing_number),
    sort_code: stringOrNull(row.sort_code),
    iban: stringOrNull(row.iban),
    swift_bic: stringOrNull(row.swift_bic),
    transfer_type: parseUsBankTransferType(row.transfer_type),
    checking_or_savings:
      row.checking_or_savings === "savings"
        ? "savings"
        : row.checking_or_savings === "checking"
          ? "checking"
          : null,
    address_line1: stringOrNull(row.address_line1),
    city: stringOrNull(row.city),
    state: stringOrNull(row.state),
    postal_code: stringOrNull(row.postal_code),
    metadata: row.metadata && typeof row.metadata === "object"
      ? row.metadata as Record<string, unknown>
      : {},
  }
}

export function walletDestinationFromSendDestination(
  destination: SendDestinationRow,
  sessionUserId: string,
): WalletRecipientRow {
  return {
    id: destination.id,
    user_id: sessionUserId,
    full_name: destination.full_name,
    account_number: destination.account_number,
    bank_name: destination.bank_name,
    currency: destination.currency,
    wallet_network: destination.wallet_network,
  }
}

export function payrollMethodDbPayload(
  type: "bank" | "mobile_money" | "stablecoin",
  details: Record<string, string>,
): Record<string, unknown> {
  const value = (camel: string, snake: string = camel) =>
    String(details[camel] || details[snake] || "").trim() || null
  const currency = String(details.currency || details.asset || "").trim().toUpperCase()
  const provider = value("provider", "mobile_provider")
  const network = value("network", "wallet_network")
  const accountNumber =
    type === "mobile_money"
      ? value("phoneNumber", "phone_number")
      : type === "stablecoin"
        ? value("walletAddress", "wallet_address")
        : value("accountNumber", "account_number")
  return {
    full_name: value("fullName", "full_name"),
    country_code: value("countryCode", "country_code"),
    currency,
    account_number: accountNumber,
    bank_name:
      type === "mobile_money"
        ? `Mobile Money (${provider || ""})`
        : type === "stablecoin"
          ? `Wallet (${currency}/${network || ""})`
          : value("bankName", "bank_name"),
    phone_number: type === "mobile_money" ? accountNumber : value("phoneNumber", "phone_number"),
    email: value("email"),
    mobile_provider: type === "mobile_money" ? provider : null,
    wallet_network: type === "stablecoin" ? network : null,
    routing_number: value("routingNumber", "routing_number"),
    sort_code: value("sortCode", "sort_code"),
    iban: value("iban"),
    swift_bic: value("swiftBic", "swift_bic"),
    transfer_type: value("transferType", "transfer_type"),
    checking_or_savings: value("accountType", "checking_or_savings"),
    address_line1: value("addressLine1", "address_line1"),
    city: value("city"),
    state: value("state"),
    postal_code: value("postalCode", "postal_code"),
    metadata: type === "stablecoin" ? { walletAsset: currency, walletNetwork: network } : {},
  }
}
