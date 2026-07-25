import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  confirmGridCrossBorderTransfer,
  lockAndConfirmGridCrossBorderOrder,
} from "@/lib/grid/cross-border-orchestrator"
import { GridHttpError } from "@/lib/grid/http"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { normalizeYcMomoPhone } from "@easner/shared"

export const runtime = "nodejs"

function mapGridCrossBorderConfirmError(e: unknown): string {
  if (e instanceof GridHttpError) {
    const body = (e.body ?? {}) as { reason?: string; message?: string }
    if (body.reason?.trim()) return body.reason.trim()
    if (body.message?.trim()) return body.message.trim()
    return e.message
  }
  if (e instanceof Error) return e.message
  return "Cross-border confirm failed"
}

/** Lock Grid quote + create pay-in transaction after user confirms review. */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response

  const admin = createSupabaseAdmin()
  const businessId = noahCtxResult.scope === "business" ? noahCtxResult.businessId : null
  const orgOwnerId =
    noahCtxResult.scope === "business" && noahCtxResult.businessId
      ? await resolveBusinessOrgOwnerUserId(admin, noahCtxResult.businessId).catch(() => null)
      : null
  const kycUserId = orgOwnerId ?? user.id

  const body = (await request.json().catch(() => null)) as {
    recipientId?: string
    receiveAmount?: number
    payInCurrency?: string
    payInCountry?: string
    payInRail?: "bank_transfer" | "mobile_money"
    sourcePhone?: string
    networkId?: string
    sourceNetworkName?: string
    leg2DraftId?: string
  } | null

  const legacyQuoteId = body?.leg2DraftId?.trim()

  try {
    if (legacyQuoteId) {
      const result = await confirmGridCrossBorderTransfer({
        admin,
        userId: kycUserId,
        businessId,
        quoteId: legacyQuoteId,
      })
      return NextResponse.json({
        ok: true,
        provider: "grid",
        quotePhase: "locked",
        leg2DraftId: legacyQuoteId,
        transferId: result.transferId,
        transactionId: result.transactionId,
        easnerTransactionId: result.easnerTransactionId,
        localPayIn: result.localPayIn,
        customerRate: result.customerRate,
        receiveAmount: result.receiveAmount,
        receiveCurrency: result.receiveCurrency,
        bankInfo: result.bankInfo,
        expiresAt: result.expiresAt,
      })
    }

    const recipientId = body?.recipientId?.trim()
    const receiveAmount = Number(body?.receiveAmount)
    const payInCurrency = String(body?.payInCurrency ?? "").trim().toUpperCase()
    const payInCountry = String(body?.payInCountry ?? "").trim().toUpperCase()
    if (!recipientId || !(receiveAmount > 0) || !payInCurrency || !payInCountry) {
      return NextResponse.json(
        { error: "recipientId, receiveAmount, payInCurrency, payInCountry required", code: "recipient_required" },
        { status: 400 },
      )
    }

    const payInRail = body?.payInRail === "mobile_money" ? "mobile_money" : "bank_transfer"

    const { data: recipient } = await admin
      .from("recipients")
      .select("*")
      .eq("id", recipientId)
      .eq("user_id", kycUserId)
      .maybeSingle()
    if (!recipient) {
      return NextResponse.json({ error: "Recipient not found", code: "recipient_not_found" }, { status: 404 })
    }

    const { data: userRow } = await admin
      .from("users")
      .select(
        "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
      )
      .eq("id", kycUserId)
      .maybeSingle()

    const result = await lockAndConfirmGridCrossBorderOrder({
      admin,
      userId: kycUserId,
      businessId,
      sourceCountry: payInCountry,
      sourceCurrency: payInCurrency,
      recipient: recipient as RecipientSellPrepareRow,
      receiveAmount,
      payInRail,
      sourcePhone:
        payInRail === "mobile_money"
          ? normalizeYcMomoPhone(String(body?.sourcePhone ?? "").trim(), payInCountry)
          : undefined,
      sourceNetworkId: payInRail === "mobile_money" ? String(body?.networkId ?? "").trim() : undefined,
      sourceNetworkName:
        payInRail === "mobile_money"
          ? String(body?.sourceNetworkName ?? "").trim() || undefined
          : undefined,
      profile: {
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

    return NextResponse.json(result)
  } catch (e) {
    const message = mapGridCrossBorderConfirmError(e)
    console.warn("[grid-cross-border-confirm]", { error: message })
    return NextResponse.json({ error: message, code: "grid_cross_border_confirm_failed" }, { status: 400 })
  }
}
