import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

function value(details: Record<string, string>, camel: string, snake: string): string {
  return String(details[camel] || details[snake] || "").trim()
}

export function payrollDetailsForReceivingMethodForm(
  details: Record<string, string>,
): Record<string, string> {
  return {
    fullName: value(details, "fullName", "full_name"),
    countryCode: value(details, "countryCode", "country_code").toUpperCase(),
    currency: value(details, "currency", "currency").toUpperCase(),
    bankName: value(details, "bankName", "bank_name"),
    accountNumber: value(details, "accountNumber", "account_number"),
    phoneNumber: value(details, "phoneNumber", "phone_number"),
    provider: value(details, "provider", "mobile_provider"),
    network: value(details, "network", "wallet_network"),
    walletAddress:
      value(details, "walletAddress", "wallet_address") ||
      value(details, "accountNumber", "account_number"),
    routingNumber: value(details, "routingNumber", "routing_number"),
    sortCode: value(details, "sortCode", "sort_code"),
    iban: value(details, "iban", "iban"),
    swiftBic: value(details, "swiftBic", "swift_bic"),
    transferType: value(details, "transferType", "transfer_type"),
    accountType: value(details, "accountType", "checking_or_savings"),
    addressLine1: value(details, "addressLine1", "address_line1"),
    postalCode: value(details, "postalCode", "postal_code"),
    email: value(details, "email", "email"),
    city: value(details, "city", "city"),
    state: value(details, "state", "state"),
    asset: value(details, "asset", "currency").toUpperCase(),
  }
}

export function payrollDetailsToPayoutRecipient(
  type: "bank" | "mobile_money" | "stablecoin",
  details: Record<string, string>,
): RecipientSellPrepareRow {
  const fullName = String(details.fullName || details.full_name || "").trim()
  const currency = String(details.currency || details.asset || "").trim().toUpperCase()
  const countryCode = String(details.countryCode || details.country_code || "").trim().toUpperCase()
  const accountNumber =
    type === "mobile_money"
      ? String(details.phoneNumber || details.phone_number || "").trim()
      : type === "stablecoin"
        ? String(details.walletAddress || details.wallet_address || "").trim()
        : String(details.accountNumber || details.account_number || "").trim()
  const provider = String(details.provider || details.mobile_provider || "").trim()
  const network = String(details.network || details.wallet_network || "").trim()
  const bankName =
    type === "mobile_money"
      ? `Mobile Money (${provider})`
      : type === "stablecoin"
        ? `Wallet (${currency}/${network})`
        : String(details.bankName || details.bank_name || "").trim()

  return {
    full_name: fullName,
    account_number: accountNumber,
    bank_name: bankName,
    currency,
    country_code: countryCode || null,
    phone_number:
      type === "mobile_money"
        ? accountNumber
        : String(details.phoneNumber || details.phone_number || "").trim() || null,
    mobile_provider: type === "mobile_money" ? provider : null,
    routing_number: String(details.routingNumber || details.routing_number || "").trim() || null,
    sort_code: String(details.sortCode || details.sort_code || "").trim() || null,
    iban: String(details.iban || "").trim() || null,
    swift_bic: String(details.swiftBic || details.swift_bic || "").trim() || null,
    transfer_type:
      details.transferType === "Wire" || details.transfer_type === "Wire"
        ? "Wire"
        : details.transferType === "ACH" || details.transfer_type === "ACH"
          ? "ACH"
          : null,
    checking_or_savings:
      details.accountType === "savings" || details.checking_or_savings === "savings"
        ? "savings"
        : details.accountType === "checking" || details.checking_or_savings === "checking"
          ? "checking"
          : null,
    address_line1: String(details.addressLine1 || details.address_line1 || "").trim() || null,
    city: String(details.city || "").trim() || null,
    state: String(details.state || "").trim() || null,
    postal_code: String(details.postalCode || details.postal_code || "").trim() || null,
    email: String(details.email || "").trim() || null,
    metadata: type === "stablecoin" ? { walletNetwork: network } : null,
  }
}
