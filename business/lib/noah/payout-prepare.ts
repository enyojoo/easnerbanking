import { noahFetch } from "./http"

export type ChannelItem = {
  ID?: string
  PaymentMethodCategory?: string
  PaymentMethodType?: string
  Country?: string
  FiatCurrency?: string
  FormSchema?: Record<string, unknown>
  Limits?: { MinLimit?: string; MaxLimit?: string }
  ProcessingSeconds?: number
}

export {
  buildAccountHolderName,
  buildAccountHolderAddress,
  buildBankLocalSellForm,
  buildCaBankLocalSellForm,
  buildEurSepaSellForm,
  buildGbBankLocalSellForm,
  buildIdentifierSellForm,
  buildUsBankSellForm,
  isNoahUsAchChannel,
} from "./sell-form-builders"
export type {
  AccountHolderNameInput,
  BankLocalSellInput,
  IdentifierSellInput,
  UsBankRecipientFormInput,
} from "./sell-form-builders"

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
  hints?: { paymentMethodSubstrings?: string[] },
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
