import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { selectProviderForCorridor } from "@/lib/payout-providers"
import { findYcCrossRate, listYcRates } from "@/lib/fx/yc-rates"
import { isYcLocalPayInEnabledForCountry } from "@/lib/yellowcard/yc-receive-gate"
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

  let balanceProvider: "noah" | "yellowcard" | null = null
  let balanceAvailable = false
  if (countryCode && receiveCurrency) {
    try {
      const provider = await selectProviderForCorridor(admin, {
        countryCode,
        currencyCode: receiveCurrency,
        rail:
          recipient.mobile_provider ||
          String(recipient.bank_name || "").toLowerCase().includes("mobile money")
            ? "mobile_money"
            : "bank_transfer",
        mobileProvider: recipient.mobile_provider,
        bankName: recipient.bank_name,
      })
      balanceProvider = provider.id === "yellowcard" ? "yellowcard" : "noah"
      balanceAvailable = true
    } catch {
      balanceAvailable = false
    }
  }

  let throughLocalCurrency: {
    payInCurrency: string | null
    available: boolean
    reason?: string
  } = { payInCurrency, available: false }

  if (!payInCurrency) {
    throughLocalCurrency = { payInCurrency: null, available: false, reason: "receive_not_enabled" }
  } else if (payInCurrency === receiveCurrency) {
    throughLocalCurrency = { payInCurrency, available: false, reason: "same_currency" }
  } else {
    const rates = await listYcRates(admin, { status: "active" })
    const cross = findYcCrossRate(rates, payInCurrency, receiveCurrency)
    const { data: corridor } = await admin
      .from("payout_corridors")
      .select("enabled,metadata")
      .eq("country_code", countryCode ?? "")
      .eq("currency_code", receiveCurrency)
      .eq("enabled", true)
      .limit(1)
      .maybeSingle()

    const ycReceiveOn = await isYcLocalPayInEnabledForCountry(
      admin,
      String(userRow?.residence_country ?? ""),
    )
    if (!ycReceiveOn) {
      throughLocalCurrency = { payInCurrency, available: false, reason: "receive_not_enabled" }
    } else if (!cross?.rate) {
      throughLocalCurrency = { payInCurrency, available: false, reason: "corridor_disabled" }
    } else if (!corridor) {
      throughLocalCurrency = { payInCurrency, available: false, reason: "recipient_not_yc" }
    } else {
      throughLocalCurrency = { payInCurrency, available: true }
    }
  }

  return NextResponse.json({
    throughLocalCurrency,
    balancePayout: {
      provider: balanceProvider,
      available: balanceAvailable,
    },
  })
}

function mapResidenceToLocalCurrency(residence: string): string | null {
  const cc = residence.trim().toUpperCase()
  const map: Record<string, string> = {
    NG: "NGN",
    KE: "KES",
    GH: "GHS",
    ZA: "ZAR",
    UG: "UGX",
    TZ: "TZS",
    RW: "RWF",
    MX: "MXN",
    BR: "BRL",
    AR: "ARS",
    CO: "COP",
    CL: "CLP",
  }
  return map[cc] ?? null
}

