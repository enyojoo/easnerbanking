import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { noahFetch } from "@/lib/noah/http"
import { TERMINAL_CHARGE_FIAT_CODES } from "@/lib/noah/terminal-charge-fiats"
import { isNoahWalletLinkedFiat } from "@/lib/noah/terminal-pay-fiat"
import { uiFiatToNoahPriceTicker } from "@/lib/noah/fx-tickers"

export type NoahPricesResponse = Record<string, unknown>

export type NoahPriceItem = {
  SourceAmount?: string | number
  DestinationAmount?: string | number
  Rate?: string | number
  TotalFee?: string | number
  PaymentMethodCategory?: string
  UpdatedAt?: string
}

export type NoahPriceQuoteResult = {
  sourceCurrency: string
  destinationCurrency: string
  sourceAmount: number
  destinationAmount: number
  /** Destination units received per 1 unit of source (Noah mid, before Easner markup). */
  impliedRate: number
  country?: string
  noah: NoahPricesResponse
}

const WALLET_SOURCE_FIATS = ["USD", "EUR"] as const

/** Default payout country per fiat when DB/Noah catalog unavailable. */
const DEFAULT_COUNTRY_BY_FIAT: Record<string, string> = {
  USD: "US",
  EUR: "DE",
  GBP: "GB",
  NGN: "NG",
  KES: "KE",
  GHS: "GH",
  ZAR: "ZA",
  XOF: "SN",
  RUB: "RU",
}

function numFromNoah(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  return Number.parseFloat(String(v ?? ""))
}

/** Map UI fiat to Noah `SourceCurrency` / `DestinationCurrency` for GET /prices. */
export function fiatToNoahPriceTicker(currency: string): string {
  const c = currency.trim().toUpperCase()
  if (isNoahWalletLinkedFiat(c)) {
    return uiFiatToNoahPriceTicker(c)
  }
  return c
}

/** Production /prices source: wallet fiat → stablecoin ticker (USDC, EURC). */
export function noahPricesSourceTicker(currency: string): string {
  return fiatToNoahPriceTicker(currency)
}

/** Production /prices destination: fiat ISO (EUR not EURC). */
export function noahPricesDestTicker(currency: string): string {
  return currency.trim().toUpperCase()
}

export function isNoahWalletSourceFiat(currency: string): boolean {
  return WALLET_SOURCE_FIATS.includes(currency.trim().toUpperCase() as (typeof WALLET_SOURCE_FIATS)[number])
}

/** Parse Noah /prices body — production returns `Items[0]`, older shapes use top-level fields. */
export function parseNoahPriceResponse(data: NoahPricesResponse): NoahPriceItem | null {
  const items = data.Items
  if (Array.isArray(items) && items.length > 0) {
    const row = items[0]
    if (row && typeof row === "object") return row as NoahPriceItem
  }
  if (data.DestinationAmount != null || data.SourceAmount != null) {
    return data as NoahPriceItem
  }
  return null
}

export function amountsFromNoahPriceItem(
  row: NoahPriceItem,
  fallbackSourceAmount: number,
): { sourceAmount: number; destinationAmount: number } {
  const destinationAmount = numFromNoah(row.DestinationAmount)
  const sourceAmount = numFromNoah(row.SourceAmount ?? fallbackSourceAmount)
  return { sourceAmount, destinationAmount }
}

/**
 * ISO country for Noah /prices `Country` query param (payout/receiving country).
 * Prefer explicit override, then Easner corridors, then Noah sell catalog, then defaults.
 */
export async function buildPayoutCountryByCurrency(): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...DEFAULT_COUNTRY_BY_FIAT }

  try {
    const catalog = await noahFetch<Record<string, string[]>>({
      method: "GET",
      path: "/channels/sell/countries",
    })
    for (const [country, fiats] of Object.entries(catalog)) {
      const cc = country.trim().toUpperCase()
      if (!cc || !Array.isArray(fiats)) continue
      for (const fiat of fiats) {
        const f = String(fiat).trim().toUpperCase()
        if (f && !out[f]) out[f] = cc
      }
    }
  } catch {
    // catalog optional when signing works but route errors
  }

  try {
    const admin = createSupabaseAdmin()
    const { data } = await admin
      .from("payout_corridors")
      .select("country_code,currency_code,sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true, nullsFirst: false })

    for (const row of data ?? []) {
      const fiat = String((row as { currency_code?: string }).currency_code ?? "").toUpperCase()
      const cc = String((row as { country_code?: string }).country_code ?? "").toUpperCase()
      if (fiat && cc) out[fiat] = cc
    }
  } catch {
    // DB optional in scripts
  }

  return out
}

export function resolveCountryForNoahPrices(
  destinationFiat: string,
  input?: { country?: string; countryByCurrency?: Record<string, string> },
): string | undefined {
  const explicit = input?.country?.trim().toUpperCase()
  if (explicit) return explicit
  const dest = destinationFiat.trim().toUpperCase()
  const fromMap = input?.countryByCurrency?.[dest]
  if (fromMap) return fromMap.toUpperCase()
  return DEFAULT_COUNTRY_BY_FIAT[dest]
}

export async function noahFetchPrice(input: {
  sourceTicker: string
  destTicker: string
  sourceAmount: number
  country?: string
  paymentMethodCategory?: string
}): Promise<NoahPricesResponse> {
  const query: Record<string, string> = {
    SourceCurrency: input.sourceTicker,
    DestinationCurrency: input.destTicker,
    SourceAmount: input.sourceAmount.toFixed(8),
  }
  if (input.country?.trim()) query.Country = input.country.trim().toUpperCase()
  if (input.paymentMethodCategory?.trim()) {
    query.PaymentMethodCategory = input.paymentMethodCategory.trim()
  }
  return noahFetch<NoahPricesResponse>({
    method: "GET",
    path: "/prices",
    query,
  })
}

/** Convert `sourceAmount` of `sourceFiat` into `destFiat` using Noah /prices (USD hub fallback). */
export async function noahConvertFiatAmount(input: {
  sourceFiat: string
  destFiat: string
  sourceAmount: number
  country?: string
  paymentMethodCategory?: string
  countryByCurrency?: Record<string, string>
}): Promise<number> {
  const src = input.sourceFiat.trim().toUpperCase()
  const dst = input.destFiat.trim().toUpperCase()
  if (src === dst) return input.sourceAmount
  if (!Number.isFinite(input.sourceAmount) || input.sourceAmount <= 0) {
    throw new Error("sourceAmount must be positive")
  }

  const country = resolveCountryForNoahPrices(dst, {
    country: input.country,
    countryByCurrency: input.countryByCurrency,
  })

  const srcTicker = noahPricesSourceTicker(src)
  const dstTicker = noahPricesDestTicker(dst)

  try {
    const data = await noahFetchPrice({
      sourceTicker: srcTicker,
      destTicker: dstTicker,
      sourceAmount: input.sourceAmount,
      country,
      paymentMethodCategory: input.paymentMethodCategory,
    })
    const row = parseNoahPriceResponse(data)
    if (!row) throw new Error("Noah /prices returned no price items")
    const { destinationAmount } = amountsFromNoahPriceItem(row, input.sourceAmount)
    if (!Number.isFinite(destinationAmount) || destinationAmount <= 0) {
      throw new Error("Noah /prices returned no usable destination amount")
    }
    return destinationAmount
  } catch (directErr) {
    if (src === "USD") throw directErr
    const usd = await noahConvertFiatAmount({
      sourceFiat: src,
      destFiat: "USD",
      sourceAmount: input.sourceAmount,
      country: resolveCountryForNoahPrices("USD", input),
      paymentMethodCategory: input.paymentMethodCategory,
      countryByCurrency: input.countryByCurrency,
    })
    return noahConvertFiatAmount({
      sourceFiat: "USD",
      destFiat: dst,
      sourceAmount: usd,
      country,
      paymentMethodCategory: input.paymentMethodCategory,
      countryByCurrency: input.countryByCurrency,
    })
  }
}

/** Noah mid rate: destination per 1 unit of source. */
export async function noahImpliedProviderRate(input: {
  sourceCurrency: string
  destinationCurrency: string
  sourceAmount?: number
  country?: string
  paymentMethodCategory?: string
  countryByCurrency?: Record<string, string>
}): Promise<number> {
  const src = input.sourceCurrency.trim().toUpperCase()
  const dst = input.destinationCurrency.trim().toUpperCase()
  if (src === dst) return 1
  const amount = input.sourceAmount ?? 100
  const countryByCurrency = input.countryByCurrency ?? (await buildPayoutCountryByCurrency())
  const country =
    input.country ??
    resolveCountryForNoahPrices(dst, { countryByCurrency })
  const destAmt = await noahConvertFiatAmount({
    sourceFiat: src,
    destFiat: dst,
    sourceAmount: amount,
    country,
    paymentMethodCategory: input.paymentMethodCategory,
    countryByCurrency,
  })
  return destAmt / amount
}

export async function noahFiatPriceQuote(input: {
  sourceCurrency: string
  destinationCurrency: string
  sourceAmount: number
  country?: string
  paymentMethodCategory?: string
  countryByCurrency?: Record<string, string>
}): Promise<NoahPriceQuoteResult> {
  const sourceCurrency = input.sourceCurrency.trim().toUpperCase()
  const destinationCurrency = input.destinationCurrency.trim().toUpperCase()
  const countryByCurrency = input.countryByCurrency ?? (await buildPayoutCountryByCurrency())
  const country = resolveCountryForNoahPrices(destinationCurrency, {
    country: input.country,
    countryByCurrency,
  })

  const sourceTicker = noahPricesSourceTicker(sourceCurrency)
  const destTicker = noahPricesDestTicker(destinationCurrency)

  let data: NoahPricesResponse
  let destinationAmount: number
  let sourceAmount = input.sourceAmount

  try {
    data = await noahFetchPrice({
      sourceTicker,
      destTicker,
      sourceAmount: input.sourceAmount,
      country,
      paymentMethodCategory: input.paymentMethodCategory,
    })
    const row = parseNoahPriceResponse(data)
    if (!row) throw new Error("Noah /prices returned no price items")
    const parsed = amountsFromNoahPriceItem(row, input.sourceAmount)
    destinationAmount = parsed.destinationAmount
    sourceAmount = parsed.sourceAmount
  } catch {
    destinationAmount = await noahConvertFiatAmount({
      sourceFiat: sourceCurrency,
      destFiat: destinationCurrency,
      sourceAmount: input.sourceAmount,
      country,
      paymentMethodCategory: input.paymentMethodCategory,
      countryByCurrency,
    })
    data = {
      Items: [
        {
          SourceAmount: String(sourceAmount),
          DestinationAmount: String(destinationAmount),
          _viaUsdHub: true,
        },
      ],
    }
  }

  if (!Number.isFinite(destinationAmount) || destinationAmount <= 0) {
    throw new Error("Noah /prices returned no usable destination amount")
  }
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    throw new Error("Noah /prices returned no usable source amount")
  }

  return {
    sourceCurrency,
    destinationCurrency,
    sourceAmount,
    destinationAmount,
    impliedRate: destinationAmount / sourceAmount,
    country,
    noah: data,
  }
}

export type NoahExchangeRateRow = {
  from_currency: string
  to_currency: string
  rate: number
  as_of: string
  country?: string
}

/** Distinct payout fiat codes: enabled corridors + terminal charge list + wallet sources. */
export async function listNoahPayoutFiatCodes(): Promise<string[]> {
  const set = new Set<string>([...WALLET_SOURCE_FIATS, ...TERMINAL_CHARGE_FIAT_CODES])
  try {
    const admin = createSupabaseAdmin()
    const { data } = await admin
      .from("payout_corridors")
      .select("currency_code")
      .eq("enabled", true)
    for (const row of data ?? []) {
      const c = String((row as { currency_code?: string }).currency_code ?? "").toUpperCase()
      if (/^[A-Z]{3}$/.test(c)) set.add(c)
    }
  } catch {
    // Noah rates still work from terminal list when DB unavailable
  }
  return [...set].sort()
}

const REFERENCE_SOURCE_AMOUNT = 100

/**
 * Build USD/EUR → payout currency rate rows from Noah /prices.
 * Skips pairs Noah does not support (partial catalog is OK).
 */
export async function buildNoahWalletExchangeRates(input?: {
  destinationCurrencies?: string[]
  countryByCurrency?: Record<string, string>
}): Promise<NoahExchangeRateRow[]> {
  const countryByCurrency = input?.countryByCurrency ?? (await buildPayoutCountryByCurrency())
  const dests =
    input?.destinationCurrencies?.map((c) => c.trim().toUpperCase()).filter(Boolean) ??
    (await listNoahPayoutFiatCodes())
  const asOf = new Date().toISOString()
  const out: NoahExchangeRateRow[] = []

  await Promise.all(
    WALLET_SOURCE_FIATS.flatMap((from) =>
      dests
        .filter((to) => to !== from)
        .map(async (to) => {
          const country = resolveCountryForNoahPrices(to, { countryByCurrency })
          try {
            const rate = await noahImpliedProviderRate({
              sourceCurrency: from,
              destinationCurrency: to,
              sourceAmount: REFERENCE_SOURCE_AMOUNT,
              country,
              countryByCurrency,
            })
            if (Number.isFinite(rate) && rate > 0) {
              out.push({
                from_currency: from,
                to_currency: to,
                rate,
                as_of: asOf,
                country,
              })
            }
          } catch {
            // corridor not on Noah /prices — omit
          }
        }),
    ),
  )

  return out.sort((a, b) => a.to_currency.localeCompare(b.to_currency))
}
