import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { isTerminalChargeFiatSupported } from "@/lib/noah/terminal-charge-fiats"
import { resolveChargeForTerminalNoahPrices } from "@/lib/noah/terminal-charge-fx"
import { TERMINAL_ALLOWED_PAIRS } from "@/lib/terminal-allowed-pairs"
import { isNoahWalletSourceFiat, noahFiatPriceQuote } from "@/lib/noah/fx-prices"

type PricesResponse = Record<string, unknown>

function isIso4217(code: string): boolean {
  return /^[A-Z]{3}$/.test(code)
}

export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const url = new URL(request.url)
  const terminalCrypto = (url.searchParams.get("terminalCrypto") || "").trim()
  const chargeFiat = (url.searchParams.get("chargeFiat") || "").trim().toUpperCase()
  const terminalFiatAmountStr = url.searchParams.get("terminalFiatAmount")?.trim()

  if (terminalCrypto || chargeFiat || terminalFiatAmountStr) {
    if (!terminalCrypto || !chargeFiat || !terminalFiatAmountStr) {
      return NextResponse.json(
        { error: "terminalCrypto, chargeFiat, and terminalFiatAmount are required together." },
        { status: 400 },
      )
    }
    if (!isTerminalChargeFiatSupported(chargeFiat)) {
      return NextResponse.json({ error: "Unsupported chargeFiat for terminal preview." }, { status: 400 })
    }
    const terminalAmt = Number.parseFloat(terminalFiatAmountStr)
    if (!Number.isFinite(terminalAmt) || terminalAmt <= 0) {
      return NextResponse.json({ error: "terminalFiatAmount must be positive" }, { status: 400 })
    }
    const cryptoOk = TERMINAL_ALLOWED_PAIRS.some((p) => p.cryptoCurrency === terminalCrypto)
    if (!cryptoOk) {
      return NextResponse.json({ error: "Unsupported terminal crypto for price preview." }, { status: 400 })
    }
    try {
      const anchor = await resolveChargeForTerminalNoahPrices({
        userId: user.id,
        chargeFiat,
        chargeAmount: terminalAmt,
      })
      const data = await noahFetch<PricesResponse>({
        method: "GET",
        path: "/prices",
        query: {
          SourceCurrency: terminalCrypto,
          DestinationCurrency: anchor.destinationTicker,
          DestinationAmount: anchor.destinationAmount,
        },
      })
      const est = data.SourceAmount != null ? String(data.SourceAmount) : ""
      return NextResponse.json({
        kind: "terminal_estimate",
        chargeFiat,
        fiatAmount: terminalAmt.toFixed(2),
        noahDestinationAmount: anchor.destinationAmount,
        cryptoCurrency: terminalCrypto,
        estimatedCryptoAmount: est,
        disclaimer:
          "Indicative only. The amount on the payment screen comes from Noah when you create the charge.",
        noah: data,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  const sourceCurrency = (url.searchParams.get("sourceCurrency") || "").toUpperCase()
  const destinationCurrency = (url.searchParams.get("destinationCurrency") || "").toUpperCase()
  const sourceAmount = url.searchParams.get("sourceAmount")?.trim()
  const country = url.searchParams.get("country")?.trim()
  const paymentMethodCategory = url.searchParams.get("paymentMethodCategory")?.trim()

  if (!isIso4217(sourceCurrency) || !isIso4217(destinationCurrency)) {
    return NextResponse.json(
      { error: "sourceCurrency and destinationCurrency must be ISO 4217 codes (e.g. USD, NGN)." },
      { status: 400 },
    )
  }
  if (sourceCurrency === destinationCurrency) {
    return NextResponse.json({ error: "Source and destination must differ" }, { status: 400 })
  }
  if (!sourceAmount || Number.parseFloat(sourceAmount) <= 0) {
    return NextResponse.json({ error: "sourceAmount is required and must be positive" }, { status: 400 })
  }

  const amount = Number.parseFloat(sourceAmount)
  if (!isNoahWalletSourceFiat(sourceCurrency) && !isTerminalChargeFiatSupported(sourceCurrency)) {
    return NextResponse.json(
      { error: `Unsupported sourceCurrency for Noah /prices: ${sourceCurrency}` },
      { status: 400 },
    )
  }

  try {
    const quote = await noahFiatPriceQuote({
      sourceCurrency,
      destinationCurrency,
      sourceAmount: amount,
      country: country || undefined,
      paymentMethodCategory,
    })

    return NextResponse.json({
      sourceCurrency: quote.sourceCurrency,
      destinationCurrency: quote.destinationCurrency,
      sourceAmount: String(quote.sourceAmount),
      destinationAmount: String(quote.destinationAmount),
      impliedRate: quote.impliedRate,
      country: quote.country,
      noah: quote.noah,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
