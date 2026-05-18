import { noahFetch } from "./http"

export type ChannelItem = {
  ID?: string
  PaymentMethodCategory?: string
  PaymentMethodType?: string
  Country?: string
  FiatCurrency?: string
  FormSchema?: Record<string, unknown>
}

/**
 * Noah global payouts: discover a bank sell channel for country + fiat + crypto settlement asset.
 * @see https://docs.noah.com/recipes/payout/global-payouts-business
 */
export async function fetchSellChannelItems(input: {
  country: string
  fiatCurrency: string
  cryptoCurrency: string
}): Promise<ChannelItem[]> {
  const data = await noahFetch<{ Items?: ChannelItem[] }>({
    method: "GET",
    path: "/channels/sell",
    query: {
      Country: input.country.toUpperCase(),
      FiatCurrency: input.fiatCurrency.toUpperCase(),
      CryptoCurrency: input.cryptoCurrency,
    },
  })
  return data.Items ?? []
}

export async function findBankSellChannelId(input: {
  country: string
  fiatCurrency: string
  cryptoCurrency: string
  preferAch?: boolean
  /** When true (default for EUR), prefer BankSepa / SEPA Instant over other bank rails. */
  preferSepa?: boolean
}): Promise<{ channelId: string; paymentMethodType: string; formSchema?: Record<string, unknown> } | null> {
  const items = await fetchSellChannelItems({
    country: input.country,
    fiatCurrency: input.fiatCurrency,
    cryptoCurrency: input.cryptoCurrency,
  })
  const banks = items.filter((c) => String(c.PaymentMethodCategory ?? "") === "Bank")
  if (banks.length === 0) return null
  const fiat = input.fiatCurrency.toUpperCase()
  if (fiat === "EUR" && input.preferSepa !== false) {
    const sepaInstant = banks.find((c) => String(c.PaymentMethodType ?? "").toLowerCase().includes("sepainstant"))
    const sepa = banks.find((c) => String(c.PaymentMethodType ?? "").toLowerCase().includes("sepa"))
    const pick = sepaInstant ?? sepa ?? banks[0]
    const id = pick?.ID
    if (!id) return null
    return {
      channelId: String(id),
      paymentMethodType: String(pick.PaymentMethodType ?? ""),
      formSchema: pick.FormSchema,
    }
  }
  const ach = banks.find((c) => String(c.PaymentMethodType ?? "").toLowerCase().includes("ach"))
  const wire = banks.find((c) => String(c.PaymentMethodType ?? "").toLowerCase().includes("fedwire"))
  const pick = input.preferAch !== false ? ach ?? banks[0] : wire ?? ach ?? banks[0]
  const id = pick?.ID
  if (!id) return null
  return {
    channelId: String(id),
    paymentMethodType: String(pick.PaymentMethodType ?? ""),
    formSchema: pick.FormSchema,
  }
}

/**
 * Mobile money and similar identifier rails (see Noah PaymentMethodCategory "Identifier").
 */
export function findIdentifierSellChannel(
  items: ChannelItem[],
  hints?: { paymentMethodSubstrings?: string[] }
): { channelId: string; paymentMethodType: string; formSchema?: Record<string, unknown> } | null {
  const ident = items.filter((c) => String(c.PaymentMethodCategory ?? "").toLowerCase() === "identifier")
  if (ident.length === 0) return null
  let pool = ident
  const subs = hints?.paymentMethodSubstrings?.map((s) => s.toLowerCase()) ?? []
  if (subs.length > 0) {
    const matched = ident.filter((c) => {
      const t = String(c.PaymentMethodType ?? "").toLowerCase()
      return subs.some((s) => t.includes(s))
    })
    if (matched.length) pool = matched
  }
  const pick = pool[0]
  const id = pick?.ID
  if (!id) return null
  return {
    channelId: String(id),
    paymentMethodType: String(pick.PaymentMethodType ?? ""),
    formSchema: pick.FormSchema,
  }
}

/** Map phone + name into Noah Identifier Form fields using channel FormSchema.required hints. */
export function buildIdentifierSellForm(
  formSchema: Record<string, unknown> | undefined,
  data: { phone: string; fullName: string }
): Record<string, unknown> {
  const props = formSchema?.properties
  if (!props || typeof props !== "object") {
    return { FullName: data.fullName, PhoneNumber: data.phone }
  }
  const required = (formSchema.required as string[] | undefined) ?? Object.keys(props as object)
  const out: Record<string, unknown> = {}
  const p = props as Record<string, { title?: string }>
  for (const key of required) {
    const low = key.toLowerCase()
    const title = String(p[key]?.title ?? "").toLowerCase()
    const blob = `${low} ${title}`
    if (/phone|msisdn|mobile|e164|msisdn|subscriber/i.test(blob)) out[key] = data.phone
    else if (/name|holder|beneficiary|recipient/i.test(blob)) out[key] = data.fullName
  }
  if (Object.keys(out).length === 0) {
    return { FullName: data.fullName, PhoneNumber: data.phone }
  }
  return out
}

export type UsBankRecipientFormInput = {
  accountHolderAddress: { address: string; city: string; state: string; postalCode: string }
  accountNumber: string
  routingNumber: string
  /** Required in Noah `BankAch` FormSchema; omit for `BankFedwire`. */
  accountType?: "Checking" | "Savings"
  paymentPurpose?: string
  /**
   * When false (Fedwire), `AccountType` is not sent in `BankDetails` (Noah Fedwire schema).
   * When true (ACH), `accountType` is included when provided.
   */
  achRail?: boolean
}

/** True when Noah channel is US ACH (`BankAch`), not Fedwire. */
export function isNoahUsAchChannel(paymentMethodType: string): boolean {
  const t = String(paymentMethodType || "").toLowerCase()
  return t.includes("ach") && !t.includes("fedwire")
}

function defaultPaymentPurpose() {
  return "personal transfer"
}

/** Build Noah sell Form for EU SEPA-style bank channels (IBAN + account type). */
export function buildEurSepaSellForm(recipient: {
  iban: string
  accountType?: "Checking" | "Savings"
  paymentPurpose?: string
}): Record<string, unknown> {
  const purpose = recipient.paymentPurpose?.trim() || defaultPaymentPurpose()
  return {
    BankDetails: {
      AccountNumber: recipient.iban.replace(/\s/g, ""),
      AccountType: recipient.accountType ?? "Checking",
    },
    PaymentPurpose: purpose,
  }
}

/** Build Noah sell Form object for US BankAch / BankFedwire dynamic forms. */
export function buildUsBankSellForm(recipient: UsBankRecipientFormInput): Record<string, unknown> {
  const purpose = recipient.paymentPurpose?.trim() || defaultPaymentPurpose()
  const achRail = recipient.achRail !== false
  const details: Record<string, unknown> = {
    AccountNumber: recipient.accountNumber.trim(),
    BankCode: recipient.routingNumber.trim(),
  }
  if (achRail && recipient.accountType) {
    details.AccountType = recipient.accountType
  }
  return {
    AccountHolderAddress: {
      Address: recipient.accountHolderAddress.address,
      City: recipient.accountHolderAddress.city,
      State: recipient.accountHolderAddress.state,
      PostalCode: recipient.accountHolderAddress.postalCode,
    },
    BankDetails: details,
    PaymentPurpose: purpose,
  }
}

export type SellPrepareResult = {
  formSessionId?: string
  cryptoAuthorizedAmount?: string
  cryptoAmountEstimate?: string
  paymentMethodId?: string
  totalFee?: string
  raw: Record<string, unknown>
}

function deepFindPaymentMethodId(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (
      typeof v === "string" &&
      v.length > 8 &&
      /paymentmethodid|fiatpaymentmethodid|externalaccountid/i.test(k)
    ) {
      return v
    }
    const inner = deepFindPaymentMethodId(v)
    if (inner) return inner
  }
  return null
}

/**
 * POST /transactions/sell/prepare — validates payout form and returns FormSessionID (+ optional PaymentMethodID).
 */
export async function prepareSellTransaction(input: {
  channelId: string
  cryptoCurrency: string
  fiatAmount: string
  form: Record<string, unknown>
  customerId?: string
}): Promise<SellPrepareResult> {
  const body: Record<string, unknown> = {
    ChannelID: input.channelId,
    CryptoCurrency: input.cryptoCurrency,
    FiatAmount: input.fiatAmount,
    Form: input.form,
    DelayedSell: true,
  }
  if (input.customerId) {
    body.CustomerID = input.customerId
  }
  let raw: Record<string, unknown>
  try {
    raw = await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: "/transactions/sell/prepare",
      json: body,
    })
  } catch {
    raw = await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: "/transactions/sell/prepare",
      json: {
        channelId: input.channelId,
        cryptoCurrency: input.cryptoCurrency,
        fiatAmount: input.fiatAmount,
        form: input.form,
        delayedSell: true,
        ...(input.customerId ? { customerId: input.customerId } : {}),
      },
    })
  }
  const pm = deepFindPaymentMethodId(raw)
  return {
    formSessionId: String(raw.FormSessionID ?? raw.formSessionId ?? ""),
    cryptoAuthorizedAmount: String(raw.CryptoAuthorizedAmount ?? raw.cryptoAuthorizedAmount ?? ""),
    cryptoAmountEstimate: String(raw.CryptoAmountEstimate ?? raw.cryptoAmountEstimate ?? ""),
    paymentMethodId: pm ?? undefined,
    totalFee: String(raw.TotalFee ?? raw.totalFee ?? ""),
    raw,
  }
}

export { getNoahSettlementCryptoCurrency } from "./config"
