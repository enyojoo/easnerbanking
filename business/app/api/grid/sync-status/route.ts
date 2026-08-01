import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { ensureGridBusinessCustomer, loadGridBusinessProfile } from "@/lib/grid/ensure-grid-business-customer"
import { syncGridBusinessKybToSupabase } from "@/lib/grid/sync-kyb"
import { provisionAfterVerificationApproved } from "@/lib/verification/provision-after-approval"
import { needsBusinessProvisionAfterApproval } from "@/lib/compliance/needs-business-provision"
import { requireAuth, requireGridEnv, resolveGridBusinessContextAsync } from "../_helpers"

export const runtime = "nodejs"
export const maxDuration = 60

async function runGridBusinessSync(request: Request) {
  const mis = requireGridEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const ctx = await resolveGridBusinessContextAsync(auth.user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const profile = await loadGridBusinessProfile(admin, ctx.businessId)
  if (!profile) {
    return NextResponse.json({ error: "Business profile incomplete for Grid KYB" }, { status: 400 })
  }

  try {
    const { customerId } = await ensureGridBusinessCustomer({
      admin,
      userId: ctx.userId,
      businessId: ctx.businessId,
      profile,
    })

    const { status } = await syncGridBusinessKybToSupabase({
      admin,
      businessId: ctx.businessId,
      userId: ctx.userId,
      customerId,
    })

    let provisioned: Record<string, unknown> | undefined
    if (status === "approved") {
      provisioned = await provisionAfterVerificationApproved({
        admin,
        scope: "business",
        subjectUserId: ctx.userId,
        subjectBusinessId: ctx.businessId,
        partnerCustomerId: customerId,
      })
    }

    const needsFiatAccountsAfter =
      status === "approved"
        ? await needsBusinessProvisionAfterApproval(admin, {
            businessId: ctx.businessId,
            userId: ctx.userId,
          })
        : false

    return NextResponse.json({
      success: true,
      kycStatus: status,
      provisioned,
      needsFiatAccounts: needsFiatAccountsAfter,
      fiatAccountsProvisionAttempted: status === "approved",
      ...(needsFiatAccountsAfter && status === "approved"
        ? {
            hint:
              "KYB is approved but bank receive details are still provisioning. Retry sync in a moment.",
          }
        : {}),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function GET(request: Request) {
  return runGridBusinessSync(request)
}

export async function POST(request: Request) {
  return runGridBusinessSync(request)
}
