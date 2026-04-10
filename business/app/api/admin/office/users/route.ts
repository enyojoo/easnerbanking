import { NextResponse } from "next/server"
import { parseCommunicationPreferences } from "@easner/shared"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

/**
 * Office user directory: full `public.users` rows with service role (bypasses RLS).
 * Merges `email_confirmed_at` from auth for the same users.
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin.from("users").select("*").order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const authById = new Map<string, string | undefined>()
  let page = 1
  const perPage = 1000
  for (;;) {
    const { data: batch, error: listErr } = await admin.auth.admin.listUsers({ page, perPage })
    if (listErr) {
      console.error("office users: auth list merge:", listErr.message)
      break
    }
    const users = batch?.users ?? []
    for (const u of users) {
      authById.set(u.id, u.email_confirmed_at)
    }
    if (users.length < perPage) break
    page += 1
    if (page > 100) break
  }

  type UserRow = { id: string; easner_business_id?: string | null }
  const bizIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => (r as UserRow).easner_business_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const orgKybByBusinessId = new Map<
    string,
    { name: string | null; noah_customer_id: string | null; noah_kyb_status: string | null }
  >()
  if (bizIds.length) {
    const { data: orgs } = await admin
      .from("businesses")
      .select("id,name,noah_customer_id,noah_kyb_status")
      .in("id", bizIds)
    for (const o of orgs ?? []) {
      orgKybByBusinessId.set(String(o.id), {
        name: (o.name as string | null) ?? null,
        noah_customer_id: (o.noah_customer_id as string | null) ?? null,
        noah_kyb_status: (o.noah_kyb_status as string | null) ?? null,
      })
    }
  }

  const users = (rows ?? []).map((row) => {
    const r = row as UserRow & {
      communication_preferences?: unknown
      expo_push_token?: string | null
    }
    const org = r.easner_business_id ? orgKybByBusinessId.get(r.easner_business_id) : undefined
    const token = r.expo_push_token
    const hasExpoPushToken = typeof token === "string" && token.length > 0
    const { expo_push_token: _omitToken, communication_preferences: commRaw, ...rest } = row as Record<
      string,
      unknown
    >
    return {
      ...rest,
      communicationPreferences: parseCommunicationPreferences(commRaw),
      hasExpoPushToken,
      email_confirmed_at: authById.get(r.id) ?? null,
      ...(org
        ? {
            noah_kyb_customer_id: org.noah_customer_id,
            noah_kyb_status: org.noah_kyb_status,
            linkedBusinessName: org.name,
          }
        : {}),
    }
  })

  return NextResponse.json({ users })
}
