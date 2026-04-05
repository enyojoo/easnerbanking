import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../../_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import {
  buildEurSepaSellForm,
  buildUsBankSellForm,
  findBankSellChannelId,
  getNoahSettlementCryptoCurrency,
  isNoahUsAchChannel,
  prepareSellTransaction,
} from "@/lib/noah/payout-prepare"

/**
 * Prepare Noah sell (form session + crypto authorization) for bank payouts.
 * Corridors: US USD ACH/Wire-style forms, EU EUR SEPA-style IBAN forms.
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(acc.ctx.subjectUserId, acc.ctx.scope)
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as {
    fiatAmount?: string | number
    countryCode?: string
    currency?: string
    fullName?: string
    accountNumber?: string
    routingNumber?: string
    iban?: string
    addressLine1?: string
    city?: string
    state?: string
    postalCode?: string
    accountType?: "Checking" | "Savings"
    /** US domestic: `ACH` or `Wire` (Fedwire). Defaults to ACH when omitted. */
    transferType?: "ACH" | "Wire"
  } | null

  const country = String(body?.countryCode || "US").toUpperCase()
  const fiatCurrency = String(body?.currency || "USD").toUpperCase()
  const fullName = String(body?.fullName || "").trim()
  const fiatAmount = Number.parseFloat(String(body?.fiatAmount ?? ""))

  if (!fullName) {
    return NextResponse.json({ error: "fullName is required." }, { status: 400 })
  }
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
    return NextResponse.json({ error: "fiatAmount must be positive." }, { status: 400 })
  }

  const cryptoCurrency = getNoahSettlementCryptoCurrency()

  const tryPrepare = async (form: Record<string, unknown>, channelId: string) => {
    const prep = await prepareSellTransaction({
      channelId,
      cryptoCurrency,
      fiatAmount: fiatAmount.toFixed(2),
      form,
      customerId: acc.ctx.noahCustomerId,
    })
    return prep
  }

  try {
    if (country === "US" && fiatCurrency === "USD") {
      const accountNumber = String(body?.accountNumber || "").trim()
      const routingNumber = String(body?.routingNumber || "").trim()
      if (!accountNumber || !routingNumber) {
        return NextResponse.json(
          { error: "US USD payout prepare requires accountNumber and routingNumber." },
          { status: 400 },
        )
      }
      const addressLine1 = String(body?.addressLine1 || "").trim()
      const city = String(body?.city || "").trim()
      const state = String(body?.state || "").trim()
      const postalCode = String(body?.postalCode || "").trim()
      if (!addressLine1 || !city || !state || !postalCode) {
        return NextResponse.json(
          {
            error:
              "US bank payouts require account holder address: addressLine1, city, state, postalCode.",
          },
          { status: 400 },
        )
      }
      const transferTypeRaw = String(body?.transferType ?? "ACH").trim().toUpperCase()
      const preferAch = transferTypeRaw !== "WIRE"
      const channel = await findBankSellChannelId({
        country,
        fiatCurrency,
        cryptoCurrency,
        preferAch,
      })
      if (!channel) {
        return NextResponse.json({ error: "No Noah bank payout channel for US USD." }, { status: 400 })
      }
      const achRail = isNoahUsAchChannel(channel.paymentMethodType)
      const form = buildUsBankSellForm({
        accountHolderAddress: { address: addressLine1, city, state, postalCode },
        accountNumber,
        routingNumber,
        accountType: achRail ? body?.accountType ?? "Checking" : undefined,
        achRail,
      })
      const prep = await tryPrepare(form, channel.channelId)
      return NextResponse.json({
        ok: true,
        corridor: "US_USD_BANK",
        formSessionId: prep.formSessionId || null,
        cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount || null,
        cryptoAmountEstimate: prep.cryptoAmountEstimate || null,
        cryptoCurrency,
        fiatAmount: fiatAmount.toFixed(2),
        paymentMethodId: prep.paymentMethodId || null,
        channelId: channel.channelId,
      })
    }

    if (fiatCurrency === "EUR") {
      const iban = String(body?.iban || "").trim()
      if (!iban) {
        return NextResponse.json(
          { error: "EUR payout prepare requires iban (SEPA) and countryCode (EU/EEA)." },
          { status: 400 },
        )
      }
      const channel = await findBankSellChannelId({
        country,
        fiatCurrency,
        cryptoCurrency,
        preferAch: false,
        preferSepa: true,
      })
      if (!channel) {
        return NextResponse.json(
          { error: "No Noah SEPA payout channel for this country and EUR." },
          { status: 400 },
        )
      }
      const form = buildEurSepaSellForm({
        iban,
        accountType: body?.accountType ?? "Checking",
      })
      const prep = await tryPrepare(form, channel.channelId)
      return NextResponse.json({
        ok: true,
        corridor: "EUR_SEPA_BANK",
        formSessionId: prep.formSessionId || null,
        cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount || null,
        cryptoAmountEstimate: prep.cryptoAmountEstimate || null,
        cryptoCurrency,
        fiatAmount: fiatAmount.toFixed(2),
        paymentMethodId: prep.paymentMethodId || null,
        channelId: channel.channelId,
      })
    }

    return NextResponse.json(
      { error: "Unsupported bank payout corridor. Use US USD or EUR (SEPA) with a supported countryCode." },
      { status: 400 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
