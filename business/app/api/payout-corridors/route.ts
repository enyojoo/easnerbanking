import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { annotateCorridorsWithNoahAvailability } from "@/lib/noah/channel-availability"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

export const runtime = "nodejs"

type PayoutCorridorRow = {
  id: string
  rail: string
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  sort_order: number | null
  providers: unknown
  updated_at: string
}

function publicCorridorPayload(row: PayoutCorridorRow & { noah_sell_available?: boolean }) {
  return {
    id: row.id,
    rail: row.rail,
    country_code: row.country_code,
    country_name: row.country_name,
    currency_code: row.currency_code,
    currency_name: row.currency_name,
    sort_order: row.sort_order,
    providers: row.providers,
    ...(typeof row.noah_sell_available === "boolean"
      ? { noah_sell_available: row.noah_sell_available }
      : {}),
  }
}

function weakEtagFromRows(rows: PayoutCorridorRow[]): string {
  const h = createHash("sha256")
  for (const r of rows) {
    h.update(`${r.id}:${r.updated_at}|`)
  }
  return `W/"${h.digest("base64url")}"`
}

function catalogVersion(rows: PayoutCorridorRow[]): string {
  let max = ""
  for (const r of rows) {
    if (r.updated_at > max) max = r.updated_at
  }
  return max || new Date(0).toISOString()
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rail = searchParams.get("rail")
  const executableOnly = searchParams.get("executable") === "true"
  const annotateNoah =
    searchParams.get("annotateNoah") === "true" || executableOnly
  const railFilter =
    rail === "bank_transfer" || rail === "mobile_money" ? rail : rail === "all" || rail == null ? null : "invalid"

  if (railFilter === "invalid") {
    return NextResponse.json({ error: "Invalid rail (use bank_transfer, mobile_money, or all)" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  let q = admin
    .from("payout_corridors")
    .select("id,rail,country_code,country_name,currency_code,currency_name,sort_order,providers,updated_at")
    .eq("enabled", true)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("country_name", { ascending: true })

  if (railFilter) {
    q = q.eq("rail", railFilter)
  }

  const { data, error } = await q

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let rows = (data ?? []) as PayoutCorridorRow[]
  if (annotateNoah) {
    rows = await annotateCorridorsWithNoahAvailability(rows)
  }
  if (executableOnly) {
    rows = rows.filter((r) => (r as PayoutCorridorRow & { noah_sell_available?: boolean }).noah_sell_available)
  }
  const etag = weakEtagFromRows(rows)
  const inm = request.headers.get("if-none-match")
  if (inm && inm === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    })
  }

  const body = {
    catalog_version: catalogVersion(rows),
    corridors: rows.map(publicCorridorPayload),
  }

  return NextResponse.json(body, {
    headers: {
      ETag: etag,
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
    },
  })
}
