import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

export type BusinessOrgContext =
  | { ok: true; userId: string; businessId: string }
  | { ok: false; response: NextResponse }

export async function requireBusinessOrg(request: Request): Promise<BusinessOrgContext> {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    }
  }
  const businessId = row?.easner_business_id as string | null | undefined
  if (!businessId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Business organization required. Complete business setup first." },
        { status: 403 },
      ),
    }
  }
  return { ok: true, userId: user.id, businessId }
}
