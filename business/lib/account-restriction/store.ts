import type { SupabaseClient } from "@supabase/supabase-js"
import {
  ACCOUNT_RESTRICTION_WIND_DOWN_MS,
  computeAccountRestrictionPhase,
  emptyAccountRestriction,
  type AccountRestrictionSource,
  type AccountRestrictionSubjectKind,
  type ResolvedAccountRestriction,
} from "@easner/shared"
import {
  notifyAccountRestrictionApplied,
  notifyAccountRestrictionClosed,
  notifyAccountRestrictionLifted,
} from "@/lib/notifications/restriction-notify"

export type AccountRestrictionRow = {
  id: string
  subject_kind: AccountRestrictionSubjectKind
  user_id: string | null
  business_id: string | null
  phase: "wind_down" | "locked"
  source: AccountRestrictionSource
  restricted_at: string
  wind_down_ends_at: string
  locked_at: string | null
  lifted_at: string | null
  created_by_admin_id: string | null
  reason: string | null
  partner_event_id: string | null
}

export type ApplyAccountRestrictionInput = {
  subjectKind: AccountRestrictionSubjectKind
  userId?: string | null
  businessId?: string | null
  source: AccountRestrictionSource
  reason?: string | null
  partnerEventId?: string | null
  createdByAdminId?: string | null
  /** Office: 7-day compliance review. Closed: immediate lock after login. */
  mode?: "wind_down" | "closed"
}

export type ResolveAccountRestrictionInput = {
  userId?: string | null
  businessId?: string | null
  role?: string | null
  easnerBusinessId?: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

function rowToResolved(row: AccountRestrictionRow, now = Date.now()): ResolvedAccountRestriction {
  const phase = computeAccountRestrictionPhase({
    restrictedAt: row.restricted_at,
    windDownEndsAt: row.wind_down_ends_at,
    lockedAt: row.locked_at,
    now,
  })
  return {
    active: true,
    phase,
    subjectKind: row.subject_kind,
    restrictedAt: row.restricted_at,
    windDownEndsAt: row.wind_down_ends_at,
    lockedAt: row.locked_at ?? (phase === "locked" ? row.wind_down_ends_at : null),
    reason: row.reason,
    source: row.source,
  }
}

export function resolveRestrictionSubject(input: ResolveAccountRestrictionInput): {
  subjectKind: AccountRestrictionSubjectKind
  userId: string | null
  businessId: string | null
} {
  const role = String(input.role ?? "").toLowerCase()
  const businessId = String(input.businessId ?? input.easnerBusinessId ?? "").trim() || null
  if (role === "business" || businessId) {
    return { subjectKind: "business", userId: null, businessId }
  }
  const userId = String(input.userId ?? "").trim() || null
  return { subjectKind: "user", userId, businessId: null }
}

async function fetchActiveRestriction(
  admin: SupabaseClient,
  subject: ReturnType<typeof resolveRestrictionSubject>,
): Promise<AccountRestrictionRow | null> {
  let q = admin
    .from("account_restrictions")
    .select("*")
    .is("lifted_at", null)
    .limit(1)

  if (subject.subjectKind === "business" && subject.businessId) {
    q = q.eq("subject_kind", "business").eq("business_id", subject.businessId)
  } else if (subject.userId) {
    q = q.eq("subject_kind", "user").eq("user_id", subject.userId)
  } else {
    return null
  }

  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(`fetchActiveRestriction: ${error.message}`)
  return (data as AccountRestrictionRow | null) ?? null
}

async function maybePromoteToLocked(
  admin: SupabaseClient,
  row: AccountRestrictionRow,
  now = Date.now(),
): Promise<AccountRestrictionRow> {
  const phase = computeAccountRestrictionPhase({
    restrictedAt: row.restricted_at,
    windDownEndsAt: row.wind_down_ends_at,
    lockedAt: row.locked_at,
    now,
  })
  if (phase !== "locked" || row.phase === "locked") return row

  const wasReviewPeriod = row.phase === "wind_down"
  const lockedAt = nowIso()
  const { data, error } = await admin
    .from("account_restrictions")
    .update({ phase: "locked", locked_at: lockedAt, updated_at: lockedAt })
    .eq("id", row.id)
    .is("lifted_at", null)
    .select("*")
    .maybeSingle()

  if (error) throw new Error(`maybePromoteToLocked: ${error.message}`)
  const promoted = (data as AccountRestrictionRow | null) ?? { ...row, phase: "locked", locked_at: lockedAt }
  if (promoted.phase === "locked" && wasReviewPeriod) {
    void notifyAccountRestrictionClosed(admin, promoted).catch((err) =>
      console.error("[account-restriction] auto-close email failed:", err),
    )
  }
  return promoted
}

export async function resolveAccountRestriction(
  admin: SupabaseClient,
  input: ResolveAccountRestrictionInput,
): Promise<ResolvedAccountRestriction> {
  const subject = resolveRestrictionSubject(input)
  if (!subject.userId && !subject.businessId) return emptyAccountRestriction()

  const row = await fetchActiveRestriction(admin, subject)
  if (!row) return emptyAccountRestriction()

  const current = await maybePromoteToLocked(admin, row)
  return rowToResolved(current)
}

export async function applyAccountRestriction(
  admin: SupabaseClient,
  input: ApplyAccountRestrictionInput,
): Promise<{ applied: boolean; row: AccountRestrictionRow | null }> {
  const subject =
    input.subjectKind === "business"
      ? { subjectKind: "business" as const, userId: null, businessId: String(input.businessId ?? "").trim() || null }
      : { subjectKind: "user" as const, userId: String(input.userId ?? "").trim() || null, businessId: null }

  if (subject.subjectKind === "business" && !subject.businessId) {
    throw new Error("applyAccountRestriction: businessId required")
  }
  if (subject.subjectKind === "user" && !subject.userId) {
    throw new Error("applyAccountRestriction: userId required")
  }

  const existing = await fetchActiveRestriction(admin, subject)
  const mode = input.mode ?? "wind_down"
  if (existing) {
    if (mode === "closed" && existing.phase === "wind_down" && !existing.locked_at) {
      const lockedAt = nowIso()
      const { data, error } = await admin
        .from("account_restrictions")
        .update({
          phase: "locked",
          locked_at: lockedAt,
          wind_down_ends_at: lockedAt,
          updated_at: lockedAt,
        })
        .eq("id", existing.id)
        .is("lifted_at", null)
        .select("*")
        .maybeSingle()

      if (error) throw new Error(`applyAccountRestriction: ${error.message}`)
      const escalated =
        (data as AccountRestrictionRow | null) ??
        ({ ...existing, phase: "locked", locked_at: lockedAt, wind_down_ends_at: lockedAt } as AccountRestrictionRow)
      void notifyAccountRestrictionClosed(admin, escalated).catch((err) =>
        console.error("[account-restriction] close email failed:", err),
      )
      return { applied: true, row: escalated }
    }
    return { applied: false, row: existing }
  }

  const restrictedAt = nowIso()
  const immediateClose = mode === "closed"
  const windDownEndsAt = immediateClose
    ? restrictedAt
    : new Date(Date.now() + ACCOUNT_RESTRICTION_WIND_DOWN_MS).toISOString()
  const lockedAt = immediateClose ? restrictedAt : null
  const phase = immediateClose ? "locked" : "wind_down"
  const { data, error } = await admin
    .from("account_restrictions")
    .insert({
      subject_kind: subject.subjectKind,
      user_id: subject.userId,
      business_id: subject.businessId,
      phase,
      source: input.source,
      restricted_at: restrictedAt,
      wind_down_ends_at: windDownEndsAt,
      locked_at: lockedAt,
      reason: input.reason?.trim() || null,
      partner_event_id: input.partnerEventId?.trim() || null,
      created_by_admin_id: input.createdByAdminId?.trim() || null,
    })
    .select("*")
    .single()

  if (error) throw new Error(`applyAccountRestriction: ${error.message}`)
  const row = data as AccountRestrictionRow
  if (immediateClose) {
    void notifyAccountRestrictionClosed(admin, row).catch((err) =>
      console.error("[account-restriction] close email failed:", err),
    )
  } else {
    void notifyAccountRestrictionApplied(admin, row).catch((err) =>
      console.error("[account-restriction] restriction email failed:", err),
    )
  }
  return { applied: true, row }
}

export async function liftAccountRestriction(
  admin: SupabaseClient,
  input: ResolveAccountRestrictionInput,
): Promise<{ lifted: boolean; row?: AccountRestrictionRow | null; blocked?: boolean; error?: string }> {
  const subject = resolveRestrictionSubject(input)
  if (!subject.userId && !subject.businessId) return { lifted: false }

  const existing = await fetchActiveRestriction(admin, subject)
  if (!existing) return { lifted: false }

  if (existing.source === "grid" || existing.source === "noah") {
    return {
      lifted: false,
      blocked: true,
      row: existing,
      error:
        existing.source === "noah"
          ? "Noah restrictions cannot be lifted from Office."
          : "Grid compliance restrictions cannot be lifted from Office.",
    }
  }

  const liftedAt = nowIso()
  const { error } = await admin
    .from("account_restrictions")
    .update({ lifted_at: liftedAt, updated_at: liftedAt })
    .eq("id", existing.id)
    .is("lifted_at", null)

  if (error) throw new Error(`liftAccountRestriction: ${error.message}`)
  void notifyAccountRestrictionLifted(admin, existing).catch((err) =>
    console.error("[account-restriction] lift email failed:", err),
  )
  return { lifted: true, row: existing }
}

export async function resolveAccountRestrictionForUserId(
  admin: SupabaseClient,
  userId: string,
): Promise<ResolvedAccountRestriction> {
  const { data: userRow } = await admin
    .from("users")
    .select("id,role,easner_business_id")
    .eq("id", userId)
    .maybeSingle()

  return resolveAccountRestriction(admin, {
    userId,
    role: userRow?.role as string | null | undefined,
    easnerBusinessId: userRow?.easner_business_id as string | null | undefined,
  })
}
