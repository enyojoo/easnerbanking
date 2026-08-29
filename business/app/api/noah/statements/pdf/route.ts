import { NextResponse } from "next/server"
import { requireAuth } from "../../_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { generateAndPersistStatement } from "@/lib/statements/generate"
import { isStatementCurrency, parseIsoDateOnly } from "@/lib/statements/format"

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000

function parseBody(json: unknown): {
  from: string
  to: string
  currency: string
  timeZone: string | null
} | null {
  if (!json || typeof json !== "object") return null
  const o = json as Record<string, unknown>
  const from = typeof o.from === "string" ? o.from : ""
  const to = typeof o.to === "string" ? o.to : ""
  const currency = typeof o.currency === "string" ? o.currency.trim() : ""
  const timeZone = typeof o.timeZone === "string" ? o.timeZone : null
  if (!from || !to || !currency) return null
  return { from, to, currency, timeZone }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = parseBody(body)
  if (!parsed) {
    return NextResponse.json(
      { error: "Expected { from, to, currency } – ISO dates and account currency (USD or EUR)" },
      { status: 400 },
    )
  }

  const fromIso = parseIsoDateOnly(parsed.from)
  const toIso = parseIsoDateOnly(parsed.to)
  if (!fromIso || !toIso) {
    return NextResponse.json({ error: "Invalid from/to dates" }, { status: 400 })
  }
  if (fromIso > toIso) {
    return NextResponse.json({ error: "from must be before to" }, { status: 400 })
  }
  if (new Date(`${toIso}T00:00:00.000Z`).getTime() - new Date(`${fromIso}T00:00:00.000Z`).getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ error: "Date range cannot exceed 366 days" }, { status: 400 })
  }

  const currency = parsed.currency.toUpperCase()
  if (!isStatementCurrency(currency)) {
    return NextResponse.json({ error: "currency must be USD or EUR" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: prefsRow } = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", acc.ctx.subjectUserId)
    .maybeSingle()

  try {
    const { pdf, filename } = await generateAndPersistStatement(admin, {
      userId: acc.ctx.subjectUserId,
      businessId: acc.ctx.subjectBusinessId,
      currency,
      fromIso,
      toIso,
      timeZone: parsed.timeZone,
      communicationPreferences: (prefsRow as { communication_preferences?: unknown } | null)
        ?.communication_preferences,
    })

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
