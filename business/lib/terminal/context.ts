import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function requireEasnerBusinessId(
  userId: string,
): Promise<{ ok: true; businessId: string } | { ok: false; response: NextResponse }> {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", userId)
    .maybeSingle()
  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: error.message }, { status: 400 }),
    }
  }
  const businessId = data?.easner_business_id as string | null | undefined
  if (!businessId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Business workspace required for Stablecoin Terminal.", code: "NO_ORG" },
        { status: 400 },
      ),
    }
  }
  return { ok: true, businessId }
}
