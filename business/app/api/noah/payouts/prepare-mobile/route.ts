import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../../_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import {
  buildIdentifierSellForm,
  fetchSellChannelItems,
  findIdentifierSellChannel,
  getNoahSettlementCryptoCurrency,
  prepareSellTransaction,
} from "@/lib/noah/payout-prepare"

/**
 * Prepare Noah sell for Identifier rails (e.g. mobile money) using channel discovery + dynamic form mapping.
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id, undefined, "write")
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
      acc.ctx.subjectUserId,
      acc.ctx.scope,
      acc.ctx.subjectBusinessId,
    )
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as {
    fiatAmount?: string | number
    countryCode?: string
    currency?: string
    fullName?: string
    phoneNumber?: string
    paymentMethodSubstrings?: string[]
    /** Optional override when the client already selected a channel from Noah */
    channelId?: string
    /** When channelId is set, submit this Form directly (must match channel schema). */
    form?: Record<string, unknown>
  } | null

  const country = String(body?.countryCode || "").toUpperCase()
  const fiatCurrency = String(body?.currency || "").toUpperCase()
  const fullName = String(body?.fullName || "").trim()
  const phoneNumber = String(body?.phoneNumber || "").replace(/\s/g, "")
  const fiatAmount = Number.parseFloat(String(body?.fiatAmount ?? ""))

  if (!country || !fiatCurrency) {
    return NextResponse.json({ error: "countryCode and currency are required." }, { status: 400 })
  }
  if (!fullName || !phoneNumber) {
    return NextResponse.json({ error: "fullName and phoneNumber are required." }, { status: 400 })
  }
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
    return NextResponse.json({ error: "fiatAmount must be positive." }, { status: 400 })
  }

  const cryptoCurrency = getNoahSettlementCryptoCurrency()

  try {
    const items = await fetchSellChannelItems({ country, fiatCurrency, cryptoCurrency })
    const channelIdIn = String(body?.channelId || "").trim()
    let channelId = channelIdIn
    let formSchema: Record<string, unknown> | undefined

    if (channelId) {
      const found = items.find((c) => String(c.ID) === channelId)
      formSchema = found?.FormSchema as Record<string, unknown> | undefined
    } else {
      const picked = findIdentifierSellChannel(items, {
        paymentMethodSubstrings: body?.paymentMethodSubstrings,
      })
      if (!picked) {
        return NextResponse.json(
          {
            error:
              "No Noah Identifier (mobile money) payout channel for this country and currency. Verify payout channels are enabled for your Noah program.",
          },
          { status: 400 },
        )
      }
      channelId = picked.channelId
      formSchema = picked.formSchema
    }

    const form =
      body?.form && typeof body.form === "object"
        ? body.form
        : buildIdentifierSellForm(formSchema, { phone: phoneNumber, fullName })

    const prep = await prepareSellTransaction({
      channelId,
      cryptoCurrency,
      fiatAmount: fiatAmount.toFixed(2),
      form,
      customerId: acc.ctx.noahCustomerId,
    })

    return NextResponse.json({
      ok: true,
      corridor: "IDENTIFIER_MOBILE",
      formSessionId: prep.formSessionId || null,
      cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount || null,
      cryptoAmountEstimate: prep.cryptoAmountEstimate || null,
      cryptoCurrency,
      fiatAmount: fiatAmount.toFixed(2),
      paymentMethodId: prep.paymentMethodId || null,
      channelId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
