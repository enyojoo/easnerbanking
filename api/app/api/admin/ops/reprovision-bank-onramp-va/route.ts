import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireNoahEnv } from "@/app/api/noah/_helpers"
import { reprovisionBankOnrampVirtualAccounts } from "@/lib/noah/bank-onramp-virtual-accounts"
import { resolveReprovisionSubject } from "@/lib/noah/resolve-reprovision-subject"
import { businessUsesGridVerification } from "@/lib/compliance/business-tier1"

export const runtime = "nodejs"

type Rail = "usd" | "eur"

function parseRails(raw: unknown): Rail[] | undefined {
  if (raw == null) return undefined
  if (Array.isArray(raw)) {
    const rails = raw.map((r) => String(r).toLowerCase()).filter((r): r is Rail => r === "usd" || r === "eur")
    return rails.length ? rails : undefined
  }
  const v = String(raw).toLowerCase()
  if (v === "both" || v === "all") return ["usd", "eur"]
  if (v === "usd" || v === "eur") return [v]
  return undefined
}

/**
 * Staff-only: force Noah bank on-ramp VA re-provision for existing or new approved customers.
 * Re-binds DestinationAddress to omnibus (when flagged) or user vault.
 */
export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const mis = requireNoahEnv()
  if (mis) return mis

  let body: {
    userId?: string
    businessId?: string
    noahCustomerId?: string
    rails?: Rail[] | string
    dryRun?: boolean
  } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const subject = await resolveReprovisionSubject(admin, {
    userId: body.userId,
    businessId: body.businessId,
    noahCustomerId: body.noahCustomerId,
  })
  if ("error" in subject) {
    return NextResponse.json({ error: subject.error }, { status: 400 })
  }

  if (subject.scope === "business" && subject.subjectBusinessId) {
    const { data: biz } = await admin
      .from("businesses")
      .select("verification_provider")
      .eq("id", subject.subjectBusinessId)
      .maybeSingle()
    if (businessUsesGridVerification(biz as { verification_provider?: string | null } | null)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Grid-verified businesses use Grid INTERNAL_FIAT accounts, not Noah bank on-ramp.",
          code: "GRID_BUSINESS_NO_NOAH_ONRAMP",
        },
        { status: 400 },
      )
    }
  }

  const rails = parseRails(body.rails)
  const dryRun = body.dryRun === true

  const results = await reprovisionBankOnrampVirtualAccounts(admin, {
    ...subject,
    rails,
    dryRun,
  })

  await logAdminAction(auth.ctx.userId, "ops.reprovision_bank_onramp_va", subject.noahCustomerId, {
    scope: subject.scope,
    businessId: subject.subjectBusinessId,
    userId: subject.subjectUserId,
    rails: rails ?? ["usd", "eur"],
    dryRun,
    results,
  })

  const ok = results.every((r) => r.ok)
  return NextResponse.json({ ok, subject, results }, { status: ok ? 200 : 502 })
}
