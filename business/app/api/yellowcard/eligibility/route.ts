import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { selectProviderForCorridor } from "@/lib/payout-providers"
import {
  mapResidenceToLocalCurrency,
  resolveRecipientYcSendRail,
  resolveThroughLocalCurrencyEligibility,
} from "@/lib/yellowcard/cross-border-eligibility"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"

export const runtime = "nodejs"

/**
 * Send-amount eligibility: Through Local Currency + balance payout provider.
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const url = new URL(request.url)
  const recipientId = url.searchParams.get("recipientId")?.trim()
  if (!recipientId) {
    return NextResponse.json({ error: "recipientId required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: recipient } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 })
  }

  const { data: userRow } = await admin
    .from("users")
    .select("residence_country")
    .eq("id", user.id)
    .maybeSingle()

  const payInCurrency = mapResidenceToLocalCurrency(String(userRow?.residence_country ?? ""))
  const receiveCurrency = String(recipient.currency ?? "").trim().toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(recipient as never)
  const sendRail = resolveRecipientYcSendRail(recipient)

  let balanceProvider: "noah" | "yellowcard" | "grid" | null = null
  let balanceAvailable = false
  if (countryCode && receiveCurrency) {
    try {
      const provider = await selectProviderForCorridor(admin, {
        countryCode,
        currencyCode: receiveCurrency,
        rail: sendRail,
        mobileProvider: recipient.mobile_provider,
        bankName: recipient.bank_name,
        senderCountryCode: String(userRow?.residence_country ?? "").trim().toUpperCase() || null,
        userId: user.id,
      })
      balanceProvider =
        provider.id === "yellowcard"
          ? "yellowcard"
          : provider.id === "grid"
            ? "grid"
            : "noah"
      balanceAvailable = true
    } catch {
      balanceAvailable = false
    }
  }

  const throughLocalCurrency = await resolveThroughLocalCurrencyEligibility(admin, {
    residenceCountry: String(userRow?.residence_country ?? ""),
    payInCurrency,
    recipient,
    userId: user.id,
  })

  return NextResponse.json({
    throughLocalCurrency,
    balancePayout: {
      provider: balanceProvider,
      available: balanceAvailable,
    },
  })
}
