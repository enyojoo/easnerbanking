import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { attachBridgeSignedAgreement, getBridgeCustomerKycLink, getBridgeCustomer } from "@/lib/bridge/kyc-links"
import { formatBridgeKycStartError } from "@/lib/bridge/format-bridge-api-error"
import { normalizeSignedAgreementId } from "@/lib/bridge/hosted-iframe-url"
import { requireAuth, requireBridgeEnv } from "../_helpers"
import { readAccountScopeFromRequest } from "@/lib/noah/resolve-noah-context"
import { resolveGridBusinessContextAsync } from "@/app/api/grid/_helpers"

export const runtime = "nodejs"

/**
 * PUT Bridge `signed_agreement_id` after hosted TOS Accept, then return Persona.
 */
export async function POST(request: Request) {
  const mis = requireBridgeEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { signed_agreement_id?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }
  const signedAgreementId = normalizeSignedAgreementId(body.signed_agreement_id)
  if (!signedAgreementId) {
    return NextResponse.json({ error: "signed_agreement_id is required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const scope = readAccountScopeFromRequest(request)
  const type = scope === "business" ? "business" : "individual"

  try {
    let customerId = ""
    if (type === "business") {
      const ctx = await resolveGridBusinessContextAsync(user.id)
      if (!ctx.ok) return ctx.response
      const { data: biz } = await admin
        .from("businesses")
        .select("bridge_customer_id")
        .eq("id", ctx.businessId)
        .maybeSingle()
      customerId = String(biz?.bridge_customer_id ?? "").trim()
    } else {
      const { data: userRow } = await admin
        .from("users")
        .select("bridge_customer_id")
        .eq("id", user.id)
        .maybeSingle()
      customerId = String(userRow?.bridge_customer_id ?? "").trim()
    }

    if (!customerId) {
      return NextResponse.json({ error: "Start verification before accepting terms." }, { status: 400 })
    }

    await attachBridgeSignedAgreement({ customerId, signedAgreementId })

    const customer = await getBridgeCustomer(customerId).catch(() => null)
    const kycLink = await getBridgeCustomerKycLink(customerId).catch(() => null)

    return NextResponse.json({
      ok: true,
      customer_id: customerId,
      tos_status: customer?.tos_status ?? null,
      kyc_link: kycLink,
    })
  } catch (e: unknown) {
    const msg = formatBridgeKycStartError(e)
    console.warn("[bridge/tos-accept] attach failed:", msg, e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
