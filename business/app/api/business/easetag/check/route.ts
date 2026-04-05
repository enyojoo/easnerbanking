import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { validateEasetag } from "@/lib/easetag-validation"
import { isEasetagGloballyAvailable } from "@/lib/easetag-global"

/** B2B settings: Easetag availability for `businesses` row (excludes current org when owned). */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const raw = url.searchParams.get("easetag") || ""
  const validation = validateEasetag(raw)
  if (!validation.valid) {
    return NextResponse.json({ available: false, valid: false, error: validation.error })
  }

  const admin = createSupabaseAdmin()
  const { data: row } = await admin.from("users").select("easner_business_id").eq("id", user.id).maybeSingle()
  const businessId = row?.easner_business_id as string | undefined

  try {
    const available = await isEasetagGloballyAvailable(admin, raw, {
      excludeBusinessId: businessId,
    })
    return NextResponse.json({ available, valid: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ available: false, valid: true, error: msg }, { status: 500 })
  }
}
