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
    { name: string | null; grid_customer_id: string | null; verification_status: string | null }
  >()
  if (bizIds.length) {
    const { data: orgs } = await admin
      .from("businesses")
      .select("id,name,grid_customer_id,verification_status")
      .in("id", bizIds)
    for (const o of orgs ?? []) {
      orgKybByBusinessId.set(String(o.id), {
        name: (o.name as string | null) ?? null,
        grid_customer_id: (o.grid_customer_id as string | null) ?? null,
        verification_status: (o.verification_status as string | null) ?? null,
      })
    }
  }

  const userIds = (rows ?? []).map((r) => String((r as { id: string }).id))
  const countByUser = new Map<string, number>()
  if (userIds.length) {
    const { data: devRows, error: devErr } = await admin
      .from("user_push_devices")
      .select("user_id")
      .in("user_id", userIds)
    if (!devErr && devRows) {
      for (const d of devRows) {
        const uid = String((d as { user_id: string }).user_id)
        countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1)
      }
    }
  }

  const users = (rows ?? []).map((row) => {
    const r = row as UserRow & { communication_preferences?: unknown }
    const org = r.easner_business_id ? orgKybByBusinessId.get(r.easner_business_id) : undefined
    const n = countByUser.get(r.id) ?? 0
    const hasExpoPushToken = n > 0
    const { communication_preferences: commRaw, ...rest } = row as Record<string, unknown>
    return {
      ...rest,
      communicationPreferences: parseCommunicationPreferences(commRaw),
      hasExpoPushToken,
      pushDeviceCount: n,
      email_confirmed_at: authById.get(r.id) ?? null,
      ...(org
        ? {
            grid_customer_id: org.grid_customer_id,
            verification_status: org.verification_status,
            linkedBusinessName: org.name,
          }
        : {}),
    }
  })

  return NextResponse.json({ users })
}
