import { NextResponse } from "next/server"
import { parseCommunicationPreferences } from "@easner/shared"
import { computeAccountRestrictionPhase } from "@easner/shared"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

type UsersCursor = { createdAt: string; id: string }

function encodeUsersCursor(cursor: UsersCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function decodeUsersCursor(raw: string | null): UsersCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as UsersCursor
    if (typeof parsed?.createdAt === "string" && typeof parsed?.id === "string") return parsed
  } catch {
    // fall through
  }
  return null
}

/**
 * Office user directory: full `public.users` rows with service role (bypasses RLS).
 * Merges `email_confirmed_at` from auth for the same users.
 *
 * Optional pagination (docs/speed-ux-plan.md, O2.4): pass `limit` (≤500) and
 * the `nextCursor` from a prior response. Without `limit`, the full directory
 * is returned unchanged (backward compatible with the current office client).
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const limitRaw = Number.parseInt(url.searchParams.get("limit") || "", 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : null
  const cursor = limit ? decodeUsersCursor(url.searchParams.get("cursor")) : null

  const admin = createSupabaseAdmin()
  let usersQuery = admin
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
  if (limit) {
    if (cursor) {
      usersQuery = usersQuery.or(
        `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt."${cursor.id}")`,
      )
    }
    usersQuery = usersQuery.limit(limit + 1)
  }
  const { data: fetchedRows, error } = await usersQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let rows = fetchedRows
  let nextCursor: string | null = null
  if (limit && rows && rows.length > limit) {
    rows = rows.slice(0, limit)
    const last = rows[rows.length - 1] as { created_at?: string | null; id: string }
    if (last?.created_at) {
      nextCursor = encodeUsersCursor({ createdAt: String(last.created_at), id: String(last.id) })
    }
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

  const restrictionByUser = new Map<string, { phase: string; windDownEndsAt: string | null }>()
  const restrictionByBusiness = new Map<string, { phase: string; windDownEndsAt: string | null }>()
  {
    const { data: activeRestrictions } = await admin
      .from("account_restrictions")
      .select("subject_kind,user_id,business_id,phase,restricted_at,wind_down_ends_at,locked_at")
      .is("lifted_at", null)
    for (const row of activeRestrictions ?? []) {
      const phase = computeAccountRestrictionPhase({
        restrictedAt: String(row.restricted_at),
        windDownEndsAt: String(row.wind_down_ends_at),
        lockedAt: row.locked_at as string | null,
      })
      const payload = { phase, windDownEndsAt: String(row.wind_down_ends_at) }
      if (row.subject_kind === "user" && row.user_id) {
        restrictionByUser.set(String(row.user_id), payload)
      }
      if (row.subject_kind === "business" && row.business_id) {
        restrictionByBusiness.set(String(row.business_id), payload)
      }
    }
  }

  const users = (rows ?? []).map((row) => {
    const r = row as UserRow & { communication_preferences?: unknown }
    const org = r.easner_business_id ? orgKybByBusinessId.get(r.easner_business_id) : undefined
    const n = countByUser.get(r.id) ?? 0
    const hasExpoPushToken = n > 0
    const { communication_preferences: commRaw, ...rest } = row as Record<string, unknown>
    const role = String(rest.role ?? "").toLowerCase()
    const businessId = r.easner_business_id ? String(r.easner_business_id) : null
    const restriction =
      (role === "business" || businessId) && businessId
        ? restrictionByBusiness.get(businessId)
        : restrictionByUser.get(r.id)
    return {
      ...rest,
      communicationPreferences: parseCommunicationPreferences(commRaw),
      hasExpoPushToken,
      pushDeviceCount: n,
      email_confirmed_at: authById.get(r.id) ?? null,
      accountRestrictionPhase: restriction?.phase ?? null,
      accountRestrictionWindDownEndsAt: restriction?.windDownEndsAt ?? null,
      ...(org
        ? {
            grid_customer_id: org.grid_customer_id,
            verification_status: org.verification_status,
            linkedBusinessName: org.name,
          }
        : {}),
    }
  })

  return NextResponse.json({ users, ...(limit ? { nextCursor } : {}) })
}
