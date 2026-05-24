import { mobileProviderPrepareSubstrings } from "@/lib/noah/form-schema-hints"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-payout-country"
import { normalizeBankAccountNumber } from "@/lib/noah/sell-form-builders"
import {
  buildBankLocalSellForm,
  buildCaBankLocalSellForm,
  buildEurSepaSellForm,
  buildGbBankLocalSellForm,
  buildIdentifierSellForm,
  buildUsBankSellForm,
  fetchSellChannelItems,
  findBankSellChannelId,
  findIdentifierSellChannel,
  isNoahUsAchChannel,
  prepareSellTransaction,
} from "@/lib/noah/payout-prepare"

export type RecipientSellPrepareRow = {
  country_code?: string | null
  full_name: string
  account_number: string
  bank_name: string
  phone_number?: string | null
  currency: string
  routing_number?: string | null
  iban?: string | null
  transfer_type?: "ACH" | "Wire" | null
  checking_or_savings?: "checking" | "savings" | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  mobile_provider?: string | null
  sort_code?: string | null
  swift_bic?: string | null
  email?: string | null
}

/** Quote-time fields from send amount screen (not always on recipient row). */
export type SellPrepareOverrides = {
  note?: string
  paymentPurpose?: string
  email?: string
  branchCode?: string
}

function isMobileRecipient(row: RecipientSellPrepareRow): boolean {
  if (row.mobile_provider?.trim()) return true
  return /^mobile money/i.test(row.bank_name || "")
}

function isWalletRecipient(row: RecipientSellPrepareRow): boolean {
  const bank = String(row.bank_name || "").toLowerCase()
  return bank.includes("wallet") && !bank.includes("mobile money")
}

function parseUsAddress(row: RecipientSellPrepareRow): {
  street: string
  city: string
  state: string
  postalCode: string
} {
  const rawAddr = String(row.address_line1 || "").trim()
  const cityCol = String(row.city || "").trim()
  const stateCol = String(row.state || "").trim()
  const postalCol = String(row.postal_code || "").trim()
  if (!rawAddr) {
    throw new Error("US bank recipient requires address on file.")
  }
  if (cityCol && stateCol && postalCol) {
    return { street: rawAddr, city: cityCol, state: stateCol, postalCode: postalCol }
  }
  const parts = rawAddr.split(",").map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 4) {
    return {
      street: parts[0]!,
      city: parts[1]!,
      state: parts[2]!,
      postalCode: parts[3]!,
    }
  }
  throw new Error(
    "US bank recipient requires street, city, state, and postal code (or comma-separated address).",
  )
}

function addressFromRow(row: RecipientSellPrepareRow): {
  address: string
  city: string
  state: string
  postalCode: string
} | undefined {
  const address = String(row.address_line1 || "").trim()
  const city = String(row.city || "").trim()
  const state = String(row.state || "").trim()
  const postalCode = String(row.postal_code || "").trim()
  if (!address || !city || !state || !postalCode) return undefined
  return { address, city, state, postalCode }
}

export { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-payout-country"

/**
 * Noah sell/prepare for a saved recipient row (bank US/EUR/CA/GB/BankLocal or identifier / mobile).
 */
export async function prepareSellFromRecipientRow(input: {
  row: RecipientSellPrepareRow
  fiatAmount: number
  cryptoCurrency: string
  noahCustomerId: string
  overrides?: SellPrepareOverrides
}): Promise<{ channelId: string; prep: Awaited<ReturnType<typeof prepareSellTransaction>> }> {
  const { row, fiatAmount, cryptoCurrency, noahCustomerId, overrides } = input
  const fiat = fiatAmount.toFixed(2)
  const country = resolveRecipientPayoutCountry(row)
  const fiatCurrency = String(row.currency || "").toUpperCase()
  const fullName = String(row.full_name || "").trim()
  const note = overrides?.note?.trim()
  const paymentPurpose = overrides?.paymentPurpose?.trim()

  if (isWalletRecipient(row)) {
    throw new Error(
      "Wallet payouts use an on-chain address. Pay from balance to a fiat bank or mobile money recipient.",
    )
  }

  if (isMobileRecipient(row)) {
    const phoneNumber = String(row.phone_number || "").replace(/\s/g, "")
    if (!country || !fiatCurrency) {
      throw new Error("Mobile payout recipients require country and currency on the saved method.")
    }
    if (!fullName || !phoneNumber) {
      throw new Error("Mobile payout recipients require full name and phone number.")
    }
    const items = await fetchSellChannelItems({ country, fiatCurrency, cryptoCurrency })
    const picked = findIdentifierSellChannel(items, {
      paymentMethodSubstrings: mobileProviderPrepareSubstrings(row.mobile_provider),
    })
    if (!picked) {
      throw new Error(
        "No mobile money payout channel is available for this recipient country and currency.",
      )
    }
    const form = buildIdentifierSellForm(picked.formSchema, {
      phone: phoneNumber,
      fullName,
      paymentPurpose: paymentPurpose || note,
    })
    const prep = await prepareSellTransaction({
      channelId: picked.channelId,
      cryptoCurrency,
      fiatAmount: fiat,
      form,
      customerId: noahCustomerId,
    })
    return { channelId: picked.channelId, prep }
  }

  if (fiatCurrency === "EUR" && row.iban?.trim()) {
    const sepaCountry = country || "DE"
    const channel = await findBankSellChannelId({
      country: sepaCountry,
      fiatCurrency,
      cryptoCurrency,
      preferAch: false,
      preferSepa: true,
    })
    if (!channel) {
      throw new Error("No SEPA payout channel is available for this EUR recipient.")
    }
    const reference = note || paymentPurpose
    if (!reference) {
      throw new Error("A payment reference is required for EUR payouts.")
    }
    const form = buildEurSepaSellForm({
      iban: row.iban.trim(),
      fullName,
      reference,
      paymentPurpose,
    })
    const prep = await prepareSellTransaction({
      channelId: channel.channelId,
      cryptoCurrency,
      fiatAmount: fiat,
      form,
      customerId: noahCustomerId,
    })
    return { channelId: channel.channelId, prep }
  }

  if (fiatCurrency === "USD") {
    const payCountry = country === "US" ? "US" : country || "US"
    const accountNumber = normalizeBankAccountNumber(String(row.account_number || ""))
    const routingNumber = normalizeBankAccountNumber(String(row.routing_number || ""))
    if (!accountNumber || !routingNumber) {
      throw new Error("US bank recipient requires account and routing numbers.")
    }
    const addr = parseUsAddress(row)
    const preferAch = String(row.transfer_type || "ACH").toUpperCase() !== "WIRE"
    const channel = await findBankSellChannelId({
      country: payCountry,
      fiatCurrency,
      cryptoCurrency,
      preferAch,
    })
    if (!channel) {
      throw new Error("No US dollar bank payout channel is available for this recipient.")
    }
    const achRail = isNoahUsAchChannel(channel.paymentMethodType)
    const form = buildUsBankSellForm({
      accountHolderAddress: addr,
      accountNumber,
      routingNumber,
      fullName,
      accountType: achRail ? (row.checking_or_savings === "savings" ? "Savings" : "Checking") : undefined,
      achRail,
      reference: note,
      paymentPurpose,
    })
    const prep = await prepareSellTransaction({
      channelId: channel.channelId,
      cryptoCurrency,
      fiatAmount: fiat,
      form,
      customerId: noahCustomerId,
    })
    return { channelId: channel.channelId, prep }
  }

  if (fiatCurrency === "CAD") {
    const payCountry = country === "CA" ? "CA" : country || "CA"
    const accountNumber = String(row.account_number || "").trim()
    const routingNumber = String(row.routing_number || "").trim()
    const branchCode = String(overrides?.branchCode || row.sort_code || "").trim()
    const bankName = String(row.bank_name || "").trim()
    const addr = addressFromRow(row)
    if (!accountNumber || !routingNumber || !branchCode || !bankName || !addr) {
      throw new Error("Canadian bank recipients require account, routing, branch, bank name, and address.")
    }
    if (!paymentPurpose) {
      throw new Error("Payment purpose is required for Canadian bank payouts.")
    }
    const channel = await findBankSellChannelId({
      country: payCountry,
      fiatCurrency,
      cryptoCurrency,
      preferAch: false,
      preferSepa: false,
    })
    if (!channel) {
      throw new Error("No Canadian dollar bank payout channel is available for this recipient.")
    }
    const form = buildCaBankLocalSellForm({
      accountNumber,
      routingNumber,
      branchCode,
      bankName,
      fullName,
      address: addr,
      paymentPurpose,
    })
    const prep = await prepareSellTransaction({
      channelId: channel.channelId,
      cryptoCurrency,
      fiatAmount: fiat,
      form,
      customerId: noahCustomerId,
    })
    return { channelId: channel.channelId, prep }
  }

  if (fiatCurrency === "GBP") {
    const payCountry = country === "GB" ? "GB" : country || "GB"
    const accountNumber = String(row.account_number || "").trim()
    const sortCode = String(row.sort_code || "").trim()
    const bankName = String(row.bank_name || "").trim()
    if (!accountNumber || !sortCode || !bankName) {
      throw new Error("UK bank recipient requires account number, sort code, and bank name.")
    }
    const channel = await findBankSellChannelId({
      country: payCountry,
      fiatCurrency,
      cryptoCurrency,
      preferAch: false,
      preferSepa: false,
    })
    if (!channel) {
      throw new Error("No GBP bank payout channel is available for this recipient.")
    }
    const form = buildGbBankLocalSellForm({
      accountNumber,
      sortCode,
      bankName,
      fullName,
      paymentPurpose,
    })
    const prep = await prepareSellTransaction({
      channelId: channel.channelId,
      cryptoCurrency,
      fiatAmount: fiat,
      form,
      customerId: noahCustomerId,
    })
    return { channelId: channel.channelId, prep }
  }

  // Generic BankLocal (NG, KE, GH, ZA, …)
  if (country && fiatCurrency) {
    const accountNumber = String(row.account_number || "")
      .trim()
      .replace(/\s/g, "")
      .replace(/[^\d]/g, "")
    const bankName = String(row.bank_name || "").trim()
    if (!accountNumber || !bankName) {
      throw new Error("Bank recipient requires account number and bank name.")
    }
    const channel = await findBankSellChannelId({
      country,
      fiatCurrency,
      cryptoCurrency,
      preferAch: false,
      preferSepa: false,
    })
    if (!channel) {
      throw new Error(
        `No bank payout channel is available for ${country} ${fiatCurrency}.`,
      )
    }
    const form = buildBankLocalSellForm(channel.formSchema, {
      accountNumber,
      bankName,
      fullName,
      phone: row.phone_number ?? undefined,
      email: overrides?.email || row.email || undefined,
      address: addressFromRow(row),
      paymentPurpose: paymentPurpose || note,
      reference: note,
    })
    const prep = await prepareSellTransaction({
      channelId: channel.channelId,
      cryptoCurrency,
      fiatAmount: fiat,
      form,
      customerId: noahCustomerId,
    })
    return { channelId: channel.channelId, prep }
  }

  throw new Error(
    "This payout method is not supported yet. Check country, currency, and recipient details.",
  )
}
