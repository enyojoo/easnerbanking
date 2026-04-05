import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../_helpers"
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
import { fetchAllPaymentMethodsForCustomer } from "@/lib/noah/list-payment-methods"

/**
 * Register a fiat payout destination under the sender's Noah customer.
 * US: ACH/Wire-style bank form; EU: SEPA IBAN form.
 * @see https://docs.noah.com/recipes/payout/global-payouts-business
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
    bankName?: string
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
  const fiatAmountRaw = body?.fiatAmount != null ? String(body.fiatAmount) : ""
  const fiatAmount = Number.parseFloat(fiatAmountRaw || "10")

  if (!fullName) {
    return NextResponse.json({ error: "fullName is required." }, { status: 400 })
  }
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
    return NextResponse.json({ error: "fiatAmount must be a positive number (used for Noah prepare validation)." }, { status: 400 })
  }

  const cryptoCurrency = getNoahSettlementCryptoCurrency()

  try {
    if (country === "US" && fiatCurrency === "USD") {
      const accountNumber = String(body?.accountNumber || "").trim()
      const routingNumber = String(body?.routingNumber || "").trim()
      if (!accountNumber || !routingNumber) {
        return NextResponse.json(
          {
            error:
              "US USD bank payouts require accountNumber, routingNumber, countryCode US.",
          },
          { status: 400 },
        )
      }
      const addressLine1 = String(body?.addressLine1 || "").trim()
      const city = String(body?.city || "").trim()
      const state = String(body?.state || "").trim()
      const postalCode = String(body?.postalCode || "").trim()
      if (!addressLine1 || !city || !state || !postalCode) {
        return NextResponse.json(
          { error: "US bank registration requires addressLine1, city, state, postalCode." },
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
        return NextResponse.json({ error: "No Noah bank payout channel for country/currency pair." }, { status: 400 })
      }

      const achRail = isNoahUsAchChannel(channel.paymentMethodType)
      const form = buildUsBankSellForm({
        accountHolderAddress: {
          address: addressLine1,
          city,
          state,
          postalCode,
        },
        accountNumber,
        routingNumber,
        accountType: achRail ? body?.accountType ?? "Checking" : undefined,
        achRail,
      })

      const prep = await prepareSellTransaction({
        channelId: channel.channelId,
        cryptoCurrency,
        fiatAmount: fiatAmount.toFixed(2),
        form,
        customerId: acc.ctx.noahCustomerId,
      })

      let paymentMethodId = prep.paymentMethodId || ""
      if (!paymentMethodId) {
        const methods = await fetchAllPaymentMethodsForCustomer(acc.ctx.noahCustomerId)
        const last4 = accountNumber.slice(-4)
        for (const pm of methods) {
          const dd = pm.DisplayDetails as Record<string, unknown> | undefined
          const masked = String(dd?.BankAccountNumber ?? dd?.AccountNumber ?? "")
          if (last4 && masked.includes(last4)) {
            paymentMethodId = String(pm.ID ?? pm.Id ?? "")
            break
          }
        }
      }

      return NextResponse.json({
        ok: true,
        corridor: "US_USD_BANK",
        noahExternalAccountId: paymentMethodId || null,
        formSessionId: prep.formSessionId || null,
        cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount || null,
        cryptoCurrency,
        fiatAmount: fiatAmount.toFixed(2),
        channelId: channel.channelId,
        note:
          paymentMethodId || prep.formSessionId
            ? undefined
            : "Noah did not return a reusable payment method id; use prepare again with the same fiat amount before sell, or retry after KYC/channel availability.",
      })
    }

    if (fiatCurrency === "EUR") {
      const iban = String(body?.iban || "").trim().replace(/\s/g, "")
      if (!iban) {
        return NextResponse.json(
          { error: "EUR registration requires iban and EU/EEA countryCode." },
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
        return NextResponse.json({ error: "No Noah SEPA payout channel for this corridor." }, { status: 400 })
      }

      const form = buildEurSepaSellForm({
        iban,
        accountType: body?.accountType ?? "Checking",
      })
      const prep = await prepareSellTransaction({
        channelId: channel.channelId,
        cryptoCurrency,
        fiatAmount: fiatAmount.toFixed(2),
        form,
        customerId: acc.ctx.noahCustomerId,
      })

      let paymentMethodId = prep.paymentMethodId || ""
      if (!paymentMethodId) {
        const methods = await fetchAllPaymentMethodsForCustomer(acc.ctx.noahCustomerId)
        const last4 = iban.slice(-4)
        for (const pm of methods) {
          const dd = pm.DisplayDetails as Record<string, unknown> | undefined
          const masked = String(dd?.BankAccountNumber ?? dd?.AccountNumber ?? dd?.Iban ?? "")
          if (last4 && masked.toLowerCase().includes(last4.toLowerCase())) {
            paymentMethodId = String(pm.ID ?? pm.Id ?? "")
            break
          }
        }
      }

      return NextResponse.json({
        ok: true,
        corridor: "EUR_SEPA_BANK",
        noahExternalAccountId: paymentMethodId || null,
        formSessionId: prep.formSessionId || null,
        cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount || null,
        cryptoCurrency,
        fiatAmount: fiatAmount.toFixed(2),
        channelId: channel.channelId,
        note:
          paymentMethodId || prep.formSessionId
            ? undefined
            : "Noah did not return a reusable payment method id; use prepare again with the same fiat amount before sell, or retry after KYC/channel availability.",
      })
    }

    return NextResponse.json(
      { error: "Unsupported corridor for external account registration (US USD or EUR SEPA)." },
      { status: 400 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
