import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { prepareSellFromRecipientRow } from "@/lib/terminal/recipient-sell-prepare"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"

/**
 * Register Noah external account for a saved US/EUR bank recipient (probe prepare).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) as { fiatAmount?: number | string } | null
  const fiatAmount = Number.parseFloat(String(body?.fiatAmount ?? "1"))
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
    return NextResponse.json({ error: "fiatAmount must be positive." }, { status: 400 })
  }

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin
    .from("recipients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!row) return NextResponse.json({ error: "Recipient not found." }, { status: 404 })

  const recipient = row as RecipientSellPrepareRow
  const currency = String(recipient.currency || "").toUpperCase()
  const country = String(recipient.country_code || "").toUpperCase()
  const isUsBank = country === "US" && currency === "USD"
  const isEurBank = currency === "EUR" && Boolean(recipient.iban?.trim())
  if (!isUsBank && !isEurBank) {
    return NextResponse.json(
      { error: "External account registration applies to US bank or EUR IBAN recipients only." },
      { status: 400 },
    )
  }

  const cryptoCurrency =
    currency === "EUR" ? getNoahEurCryptoTicker() : getNoahUsdCryptoTicker()

  try {
    const { prep } = await prepareSellFromRecipientRow({
      row: recipient,
      fiatAmount,
      cryptoCurrency,
      noahCustomerId: acc.ctx.noahCustomerId,
    })
    const paymentMethodId = prep.paymentMethodId?.trim() || null
    if (!paymentMethodId) {
      return NextResponse.json(
        { error: "Noah did not return an external account id for this recipient." },
        { status: 400 },
      )
    }

    const { data: updated, error: updErr } = await admin
      .from("recipients")
      .update({
        noah_external_account_id: paymentMethodId,
        noah_form_session_id: prep.formSessionId || null,
        noah_sell_crypto_authorized: prep.cryptoAuthorizedAmount || null,
        noah_sell_crypto_currency: cryptoCurrency,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single()

    if (updErr) {
      return NextResponse.json(
        {
          ok: true,
          noahExternalAccountId: paymentMethodId,
          warning: updErr.message,
        },
        { status: 200 },
      )
    }

    return NextResponse.json({
      ok: true,
      noahExternalAccountId: paymentMethodId,
      recipient: updated,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
