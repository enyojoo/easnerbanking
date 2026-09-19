import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { annotateAdminCorridorsWithProviderHealth } from "@/lib/admin/annotate-payout-corridors"
import { isExcludedPayoutCorridorCountry } from "@/lib/payout-corridors-exclusions"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const annotateProviders =
    searchParams.get("annotateProviders") === "true" || searchParams.get("annotateNoah") === "true"

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payout_corridors")
    .select("*")
    .order("rail", { ascending: true })
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("country_name", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let corridors = (data ?? []).filter((r) => !isExcludedPayoutCorridorCountry(String(r.country_code ?? "")))
  if (annotateProviders) {
    corridors = await annotateAdminCorridorsWithProviderHealth(corridors)
  }
  return NextResponse.json({ corridors })
}
