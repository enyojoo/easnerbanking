import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { evaluateGridBusinessKycLinksPreflight } from "@/lib/grid/kyc-links-preflight"
import {
  ensureGridBusinessCustomer,
  loadGridBusinessProfile,
} from "@/lib/grid/ensure-grid-business-customer"
import { createGridBusinessKycLink } from "@/lib/grid/kyc-links"
import { syncGridBusinessKybToSupabase } from "@/lib/grid/sync-kyb"
import { requireAuth, requireGridEnv, resolveGridBusinessContextAsync } from "../_helpers"

export async function POST(request: Request) {
  const mis = requireGridEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const ctx = await resolveGridBusinessContextAsync(auth.user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const preflight = await evaluateGridBusinessKycLinksPreflight({
    admin,
    businessId: ctx.businessId,
  })
  if (preflight.action === "respond") return preflight.response

  const profile = await loadGridBusinessProfile(admin, ctx.businessId)
  if (!profile) {
    return NextResponse.json(
      { error: "Complete your business profile before starting verification." },
      { status: 400 },
    )
  }

  try {
    const { customerId } = await ensureGridBusinessCustomer({
      admin,
      userId: ctx.userId,
      businessId: ctx.businessId,
      profile,
    })

    if (preflight.action === "skipHostedPost") {
      await syncGridBusinessKybToSupabase({
        admin,
        businessId: ctx.businessId,
        userId: ctx.userId,
        customerId,
      })
      return NextResponse.json({
        kyc_link: null,
        kyc_status: preflight.kycStatus || "pending",
        customer_id: customerId,
        kyc_link_id: customerId,
        alreadyOnboarded: true,
        canResubmit: true,
      })
    }

    const link = await createGridBusinessKycLink({
      customerId,
      idempotencyKey: `kyb-link:${ctx.businessId}`,
    })

    return NextResponse.json({
      kyc_link: link.kycUrl,
      kyc_token: link.token ?? null,
      kyc_status: "not_started",
      customer_id: customerId,
      kyc_link_id: customerId,
      alreadyOnboarded: false,
      canResubmit: true,
      expiresAt: link.expiresAt ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
