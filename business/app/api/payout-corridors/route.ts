import { createHash } from "crypto"
import { NextResponse } from "next/server"
import {
  isBalancePayoutCorridorExecutable,
  isCustomerFacingFiatCorridorLive,
  pickPublicPayInMetadata,
  projectCorridorForSurface,
  type ProviderRoutingEntry,
} from "@easner/shared"
import { loadUserRoutingSurface } from "@/lib/corridor-routing-surface"
import { annotateCorridorsWithGridAvailability } from "@/lib/grid/corridor-availability"
import { annotateCorridorsWithNoahAvailability } from "@/lib/noah/channel-availability"
import { annotateCorridorsWithYcAvailability } from "@/lib/yellowcard/channel-availability"
import { isExcludedPayoutCorridorCountry } from "@/lib/payout-corridors-exclusions"
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
  provider_routing?: unknown
  metadata?: unknown
  updated_at: string
}

type AnnotatedCorridorRow = PayoutCorridorRow & {
  noah_sell_available?: boolean
  grid_send_available?: boolean
  yc_send_available?: boolean
}

function parseProviderRouting(raw: unknown): ProviderRoutingEntry[] {
  if (!Array.isArray(raw)) return []
  const out: ProviderRoutingEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const provider = String(o.provider ?? "").trim()
    const priority = Number(o.priority)
    if (!provider || !Number.isFinite(priority)) continue
    out.push({
      provider,
      priority,
      ...(o.settlement_asset ? { settlement_asset: String(o.settlement_asset) } : {}),
    })
  }
  return out.sort((a, b) => a.priority - b.priority)
}

function publicCorridorPayload(row: AnnotatedCorridorRow, surface: "business" | "personal") {
  const projected = projectCorridorForSurface(
    { provider_routing: row.provider_routing, metadata: row.metadata },
    surface,
  )
  return {
    id: row.id,
    rail: row.rail,
    country_code: row.country_code,
    country_name: row.country_name,
    currency_code: row.currency_code,
    currency_name: row.currency_name,
    sort_order: row.sort_order,
    providers: row.providers,
    provider_routing: projected.provider_routing,
    ...(typeof row.noah_sell_available === "boolean"
      ? { noah_sell_available: row.noah_sell_available }
      : {}),
    ...(typeof row.grid_send_available === "boolean"
      ? { grid_send_available: row.grid_send_available }
      : {}),
    ...(typeof row.yc_send_available === "boolean"
      ? { yc_send_available: row.yc_send_available }
      : {}),
    ...(row.metadata != null ? { metadata: pickPublicPayInMetadata(projected.metadata) } : {}),
  }
}

function weakEtagFromRows(rows: PayoutCorridorRow[], surface: "business" | "personal"): string {
  const h = createHash("sha256")
  h.update(`${surface}|`)
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
  const annotateProviders =
    searchParams.get("annotateProviders") === "true" ||
    searchParams.get("annotateNoah") === "true" ||
    executableOnly
  const railFilter =
    rail === "bank_transfer" || rail === "mobile_money" ? rail : rail === "all" || rail == null ? null : "invalid"

  if (railFilter === "invalid") {
    return NextResponse.json({ error: "Invalid rail (use bank_transfer, mobile_money, or all)" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const surface = await loadUserRoutingSurface(admin, user.id)
  let q = admin
    .from("payout_corridors")
    .select(
      "id,rail,country_code,country_name,currency_code,currency_name,sort_order,providers,provider_routing,metadata,updated_at",
    )
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

  let rows = ((data ?? []) as PayoutCorridorRow[]).filter((r) => !isExcludedPayoutCorridorCountry(r.country_code))
  if (annotateProviders) {
    const noahAnnotated = await annotateCorridorsWithNoahAvailability(rows)
    const ycAnnotated = await annotateCorridorsWithYcAvailability(noahAnnotated)
    rows = await annotateCorridorsWithGridAvailability(ycAnnotated)
  }
  if (executableOnly) {
    rows = (rows as AnnotatedCorridorRow[]).filter((row) => {
      const projected = projectCorridorForSurface(
        { provider_routing: row.provider_routing, metadata: row.metadata },
        surface,
      )
      return isBalancePayoutCorridorExecutable({
        provider_routing: projected.provider_routing,
        metadata: row.metadata,
        noah_sell_available: row.noah_sell_available,
        grid_send_available: row.grid_send_available,
        yc_send_available: row.yc_send_available,
      })
    })
  }
  rows = (rows as AnnotatedCorridorRow[]).filter((row) =>
    isCustomerFacingFiatCorridorLive(
      {
        enabled: true,
        provider_routing: parseProviderRouting(row.provider_routing),
        metadata: row.metadata,
      },
      surface,
    ),
  )
  const etag = weakEtagFromRows(rows, surface)
  const inm = request.headers.get("if-none-match")
  if (inm && inm === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "no-store",
      },
    })
  }

  const body = {
    catalog_version: `${surface}:${catalogVersion(rows)}`,
    corridors: (rows as AnnotatedCorridorRow[]).map((row) => publicCorridorPayload(row, surface)),
  }

  return NextResponse.json(body, {
    headers: {
      ETag: etag,
      "Cache-Control": "no-store",
    },
  })
}
