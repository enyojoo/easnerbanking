import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isGridConfigured } from "@/lib/grid/config"

export async function requireAuth(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { user }
}

export function requireGridEnv() {
  if (!isGridConfigured()) {
    return NextResponse.json(
      {
        error:
          "Business verification is not available in this environment. Configure Grid credentials on the business API deployment.",
      },
      { status: 503 },
    )
  }
  return null
}

export async function resolveGridBusinessContextAsync(sessionUserId: string): Promise<
  | { ok: true; businessId: string; userId: string }
  | { ok: false; response: NextResponse }
> {
  const admin = createSupabaseAdmin()
  const { data: userRow } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", sessionUserId)
    .maybeSingle()

  const businessId = (userRow?.easner_business_id as string | null | undefined) ?? null
  if (!businessId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Business mode requires an organization. Complete business setup first.",
          code: "NO_ORG",
        },
        { status: 400 },
      ),
    }
  }

  return { ok: true, businessId, userId: sessionUserId }
}
