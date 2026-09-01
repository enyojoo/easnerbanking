import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireAccountAllows, type AccountRestrictionIntent } from "./assert"

export async function requireAccountAllowsForUser(
  admin: SupabaseClient,
  userId: string,
  intent: AccountRestrictionIntent,
): Promise<{ ok: true } | NextResponse> {
  const { data: userRow } = await admin
    .from("users")
    .select("id,role,easner_business_id")
    .eq("id", userId)
    .maybeSingle()

  const result = await requireAccountAllows(
    admin,
    {
      userId,
      role: userRow?.role as string | null | undefined,
      easnerBusinessId: userRow?.easner_business_id as string | null | undefined,
    },
    intent,
  )
  if ("status" in result) return result
  return { ok: true }
}
