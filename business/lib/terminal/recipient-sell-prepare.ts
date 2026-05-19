import {
  buildEurSepaSellForm,
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
}

function isMobileRecipient(row: RecipientSellPrepareRow): boolean {
  if (row.mobile_provider?.trim()) return true
  return /^mobile money/i.test(row.bank_name || "")
}

/**
 * Noah sell/prepare for a saved recipient row (bank US/EUR or identifier / mobile).
 */
export async function prepareSellFromRecipientRow(input: {
  row: RecipientSellPrepareRow
  fiatAmount: number
  cryptoCurrency: string
  noahCustomerId: string
}): Promise<{ channelId: string; prep: Awaited<ReturnType<typeof prepareSellTransaction>> }> {
  const { row, fiatAmount, cryptoCurrency, noahCustomerId } = input
  const fiat = fiatAmount.toFixed(2)
  const country = String(row.country_code || "").toUpperCase()
  const fiatCurrency = String(row.currency || "").toUpperCase()

  if (isMobileRecipient(row)) {
    const fullName = String(row.full_name || "").trim()
    const phoneNumber = String(row.phone_number || "").replace(/\s/g, "")
    if (!country || !fiatCurrency) {
      throw new Error("Mobile payout recipients require country and currency on the saved method.")
    }
    if (!fullName || !phoneNumber) {
      throw new Error("Mobile payout recipients require full name and phone number.")
    }
    const items = await fetchSellChannelItems({ country, fiatCurrency, cryptoCurrency })
    const picked = findIdentifierSellChannel(items, {
      paymentMethodSubstrings: row.mobile_provider ? [row.mobile_provider] : undefined,
    })
    if (!picked) {
      throw new Error(
        "No mobile money payout channel is available for this recipient country and currency.",
      )
    }
    const form = buildIdentifierSellForm(picked.formSchema, {
      phone: phoneNumber,
      fullName,
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
    const form = buildEurSepaSellForm({
      iban: row.iban.trim(),
      accountType: row.checking_or_savings === "savings" ? "Savings" : "Checking",
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

  if (country === "US" && fiatCurrency === "USD") {
    const accountNumber = String(row.account_number || "").trim()
    const routingNumber = String(row.routing_number || "").trim()
    const rawAddr = String(row.address_line1 || "").trim()
    const cityCol = String(row.city || "").trim()
    const stateCol = String(row.state || "").trim()
    const postalCol = String(row.postal_code || "").trim()
    if (!accountNumber || !routingNumber) {
      throw new Error("US bank recipient requires account and routing numbers.")
    }
    if (!rawAddr) {
      throw new Error("US bank recipient requires address on file.")
    }
    const parts = rawAddr.split(",").map((s) => s.trim()).filter(Boolean)
    let street: string
    let city: string
    let state: string
    let postalCode: string
    if (cityCol && stateCol && postalCol) {
      street = rawAddr
      city = cityCol
      state = stateCol
      postalCode = postalCol
    } else if (parts.length >= 4) {
      street = parts[0]!
      city = parts[1]!
      state = parts[2]!
      postalCode = parts[3]!
    } else {
      throw new Error(
        "US bank recipient requires street, city, state, and postal code (or comma-separated address).",
      )
    }
    const preferAch = String(row.transfer_type || "ACH").toUpperCase() !== "WIRE"
    const channel = await findBankSellChannelId({
      country,
      fiatCurrency,
      cryptoCurrency,
      preferAch,
    })
    if (!channel) {
      throw new Error("No US dollar bank payout channel is available for this recipient.")
    }
    const achRail = isNoahUsAchChannel(channel.paymentMethodType)
    const form = buildUsBankSellForm({
      accountHolderAddress: {
        address: street,
        city,
        state,
        postalCode,
      },
      accountNumber,
      routingNumber,
      accountType: achRail ? (row.checking_or_savings === "savings" ? "Savings" : "Checking") : undefined,
      achRail,
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
    "This payout method is not supported for Stablecoin Terminal yet. Use US bank, EUR IBAN, or mobile money.",
  )
}
