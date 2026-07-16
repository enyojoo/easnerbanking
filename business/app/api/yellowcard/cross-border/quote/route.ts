import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { createCrossBorderTransfer } from "@/lib/yellowcard/cross-border-orchestrator"
import { expireStalePendingAuthorizeTransfers } from "@/lib/yellowcard/expire-pending-authorize"
import { ycPayInInstructionNotice } from "@easner/shared"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const admin = createSupabaseAdmin()
  void expireStalePendingAuthorizeTransfers(admin, { userId: user.id }).catch(() => {})

  const body = (await request.json().catch(() => null)) as {
    recipientId?: string
    receiveAmount?: number
    payInCurrency?: string
    payInCountry?: string
    payInRail?: "bank_transfer" | "mobile_money"
    sourcePhone?: string
    networkId?: string
    sourceNetworkName?: string
  } | null

  const recipientId = body?.recipientId?.trim()
  const receiveAmount = Number(body?.receiveAmount)
  const payInCurrency = String(body?.payInCurrency ?? "").trim().toUpperCase()
  const payInCountry = String(body?.payInCountry ?? "").trim().toUpperCase()
  if (!recipientId || !(receiveAmount > 0) || !payInCurrency || !payInCountry) {
    return NextResponse.json({ error: "recipientId, receiveAmount, payInCurrency, payInCountry required" }, { status: 400 })
  }

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
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", user.id)
    .maybeSingle()

  const payInRail = body?.payInRail === "mobile_money" ? "mobile_money" : "bank_transfer"
  if (payInRail === "mobile_money") {
    const sourcePhone = String(body?.sourcePhone ?? "").trim()
    const networkId = String(body?.networkId ?? "").trim()
    if (!sourcePhone || !networkId) {
      return NextResponse.json(
        { error: "Mobile money cross-border requires sourcePhone and networkId", code: "momo_source_required" },
        { status: 400 },
      )
    }
  }

  try {
    const result = await createCrossBorderTransfer({
      admin,
      userId: user.id,
      customerUID: user.id,
      payInCurrency,
      payInCountry,
      payInRail,
      receiveAmount,
      recipient: recipient as RecipientSellPrepareRow,
      sourcePhone: body?.sourcePhone,
      sourceNetworkId: body?.networkId,
      sourceNetworkName: body?.sourceNetworkName,
      senderProfile: {
        residenceCountry: userRow?.residence_country ?? payInCountry,
        kycIdType: userRow?.kyc_id_type,
        kycIdNumber: userRow?.kyc_id_number,
        ngLocalIdType: userRow?.ng_local_id_type,
        ngLocalIdNumber: userRow?.ng_local_id_number,
        fullName: userRow?.full_name,
        phone: userRow?.phone,
        email: userRow?.email,
        dateOfBirth: userRow?.date_of_birth,
        addressStreet: userRow?.kyc_address_street,
        addressCity: userRow?.kyc_address_city,
        addressCountry: userRow?.kyc_address_country,
      },
    })

    return NextResponse.json({
      ok: true,
      ...result,
      payInNotice: ycPayInInstructionNotice(payInRail),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cross-border quote failed"
    if (message === "deposit_omnibus_solana_address_usd_required") {
      return NextResponse.json(
        {
          error: message,
          code: "yc_settlement_wallet_not_configured",
          hint: "Set DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD on the business API (USDC Solana omnibus for YC pay-in settlement).",
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
