import type { createSupabaseAdmin } from "@/lib/supabase/admin"

type Admin = ReturnType<typeof createSupabaseAdmin>

export type TeamInviteErrorCode =
  | "INVITE_NOT_FOUND"
  | "EMAIL_MISMATCH"
  | "ALREADY_HAS_BUSINESS"
  | "AMBIGUOUS_INVITE"
  | "INVITE_BUSINESS_GONE"
  | "AUTH_EMAIL_REQUIRED"

export type PendingTeamInviteRow = {
  id: string
  business_id: string
  email: string
  role: string
  full_name: string | null
  status: string
  user_id: string | null
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function displayRoleFromMembership(role: string | null | undefined): string {
  const value = (role ?? "").toLowerCase()
  if (value === "owner") return "Owner"
  if (value === "admin") return "Admin"
  if (value === "viewer") return "Viewer"
  return "Member"
}

type FindPendingInput = {
  email: string
  membershipId?: string | null
}

type FindPendingResult =
  | { ok: true; invite: PendingTeamInviteRow }
  | { ok: false; code: TeamInviteErrorCode; message: string }

export async function findPendingTeamInvite(
  admin: Admin,
  input: FindPendingInput,
): Promise<FindPendingResult> {
  const email = normalizeInviteEmail(input.email)
  if (!email) {
    return { ok: false, code: "AUTH_EMAIL_REQUIRED", message: "Email is required." }
  }

  const membershipId = typeof input.membershipId === "string" ? input.membershipId.trim() : ""

  if (membershipId) {
    const { data: row, error } = await admin
      .from("business_memberships")
      .select("id,business_id,email,role,full_name,status,user_id")
      .eq("id", membershipId)
      .maybeSingle()

    if (error) {
      return { ok: false, code: "INVITE_NOT_FOUND", message: error.message }
    }
    if (!row || row.status !== "invited" || row.user_id) {
      return { ok: false, code: "INVITE_NOT_FOUND", message: "Invitation not found or already accepted." }
    }
    if (normalizeInviteEmail(row.email ?? "") !== email) {
      return { ok: false, code: "EMAIL_MISMATCH", message: "Sign in with the email address that received this invitation." }
    }

    const { data: business } = await admin.from("businesses").select("id").eq("id", row.business_id).maybeSingle()
    if (!business?.id) {
      return { ok: false, code: "INVITE_BUSINESS_GONE", message: "This business organization no longer exists." }
    }

    return { ok: true, invite: row as PendingTeamInviteRow }
  }

  const { data: rows, error } = await admin
    .from("business_memberships")
    .select("id,business_id,email,role,full_name,status,user_id")
    .eq("email", email)
    .eq("status", "invited")
    .is("user_id", null)
    .order("updated_at", { ascending: false })

  if (error) {
    return { ok: false, code: "INVITE_NOT_FOUND", message: error.message }
  }

  const pending = (rows ?? []) as PendingTeamInviteRow[]
  if (pending.length === 0) {
    return { ok: false, code: "INVITE_NOT_FOUND", message: "No pending invitation found for this email." }
  }
  if (pending.length > 1) {
    return {
      ok: false,
      code: "AMBIGUOUS_INVITE",
      message: "Multiple pending invitations found. Open the link from your invitation email.",
    }
  }

  const invite = pending[0]!
  const { data: business } = await admin.from("businesses").select("id").eq("id", invite.business_id).maybeSingle()
  if (!business?.id) {
    return { ok: false, code: "INVITE_BUSINESS_GONE", message: "This business organization no longer exists." }
  }

  return { ok: true, invite }
}

export async function hasPendingTeamInviteForEmail(admin: Admin, email: string | null | undefined): Promise<boolean> {
  const normalized = email ? normalizeInviteEmail(email) : ""
  if (!normalized) return false

  const { data, error } = await admin
    .from("business_memberships")
    .select("id")
    .eq("email", normalized)
    .eq("status", "invited")
    .is("user_id", null)
    .limit(1)

  return !error && Boolean(data?.length)
}

type ClaimInput = {
  userId: string
  authEmail: string | null | undefined
  fullName: string | null | undefined
  membershipId?: string | null
}

export type ClaimTeamInviteResult =
  | { ok: true; claimed: false }
  | { ok: true; claimed: true; businessId: string; role: string; membershipId: string }
  | { ok: false; code: TeamInviteErrorCode; message: string; httpStatus: number }

export async function claimTeamInvite(admin: Admin, input: ClaimInput): Promise<ClaimTeamInviteResult> {
  const authEmail = input.authEmail ? normalizeInviteEmail(input.authEmail) : ""
  if (!authEmail) {
    return {
      ok: false,
      code: "AUTH_EMAIL_REQUIRED",
      message: "A verified email is required to accept an invitation.",
      httpStatus: 400,
    }
  }

  const membershipId = typeof input.membershipId === "string" ? input.membershipId.trim() : ""
  if (!membershipId) {
    return { ok: true, claimed: false }
  }

  const { data: userRow } = await admin
    .from("users")
    .select("id,easner_business_id,role")
    .eq("id", input.userId)
    .maybeSingle()

  if (userRow?.easner_business_id) {
    return {
      ok: false,
      code: "ALREADY_HAS_BUSINESS",
      message: "This account is already linked to a business organization.",
      httpStatus: 409,
    }
  }

  const found = await findPendingTeamInvite(admin, { email: authEmail, membershipId })
  if (!found.ok) {
    const httpStatus =
      found.code === "EMAIL_MISMATCH"
        ? 403
        : found.code === "ALREADY_HAS_BUSINESS"
          ? 409
          : found.code === "AMBIGUOUS_INVITE"
            ? 409
            : 404
    return { ok: false, code: found.code, message: found.message, httpStatus }
  }

  const invite = found.invite
  const displayName = (input.fullName ?? invite.full_name ?? "").trim() || "Team Member"
  const now = new Date().toISOString()

  const { error: membershipError } = await admin
    .from("business_memberships")
    .update({
      user_id: input.userId,
      status: "active",
      full_name: displayName,
      updated_at: now,
    })
    .eq("id", invite.id)
    .eq("status", "invited")
    .is("user_id", null)

  if (membershipError) {
    return {
      ok: false,
      code: "INVITE_NOT_FOUND",
      message: membershipError.message,
      httpStatus: 500,
    }
  }

  const userPayload = {
    id: input.userId,
    email: authEmail,
    full_name: displayName,
    easner_business_id: invite.business_id,
    role: "business" as const,
    updated_at: now,
  }

  const { error: userErrWithRole } = await admin.from("users").upsert(userPayload, { onConflict: "id" })
  if (userErrWithRole) {
    const { error: userErrNoRole } = await admin.from("users").upsert(
      {
        id: input.userId,
        email: authEmail,
        full_name: displayName,
        easner_business_id: invite.business_id,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    if (userErrNoRole) {
      return {
        ok: false,
        code: "INVITE_NOT_FOUND",
        message: userErrNoRole.message,
        httpStatus: 500,
      }
    }
  }

  return {
    ok: true,
    claimed: true,
    businessId: invite.business_id,
    role: invite.role,
    membershipId: invite.id,
  }
}

export async function getInvitePreviewByMembershipId(
  admin: Admin,
  membershipId: string,
): Promise<
  | { ok: true; businessName: string; role: string; status: "invited"; email: string; fullName: string | null }
  | { ok: false; code: "INVITE_NOT_FOUND"; message: string }
> {
  const id = membershipId.trim()
  if (!id) {
    return { ok: false, code: "INVITE_NOT_FOUND", message: "Invitation not found." }
  }

  const { data: row, error } = await admin
    .from("business_memberships")
    .select("id,role,status,business_id,email,full_name")
    .eq("id", id)
    .maybeSingle()

  if (error || !row || row.status !== "invited") {
    return { ok: false, code: "INVITE_NOT_FOUND", message: "Invitation not found or already accepted." }
  }

  const inviteEmail = normalizeInviteEmail(typeof row.email === "string" ? row.email : "")
  if (!inviteEmail) {
    return { ok: false, code: "INVITE_NOT_FOUND", message: "Invitation not found or already accepted." }
  }

  const { data: business } = await admin
    .from("businesses")
    .select("legal_name,display_name,name")
    .eq("id", row.business_id)
    .maybeSingle()

  const businessName =
    String(business?.display_name ?? business?.legal_name ?? business?.name ?? "Easner Business").trim() ||
    "Easner Business"

  const fullName =
    typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : null

  return {
    ok: true,
    businessName,
    role: displayRoleFromMembership(row.role),
    status: "invited",
    email: inviteEmail,
    fullName,
  }
}

/** Reject team invite when email belongs to owner of a different org. */
export async function recipientHasEasnerAccount(admin: Admin, email: string): Promise<boolean> {
  const normalized = normalizeInviteEmail(email)
  if (!normalized) return false
  const { data, error } = await admin.from("users").select("id").eq("email", normalized).maybeSingle()
  return !error && Boolean(data?.id)
}

export async function isEmailOwnerOfAnotherBusiness(
  admin: Admin,
  email: string,
  currentBusinessId: string,
): Promise<boolean> {
  const normalized = normalizeInviteEmail(email)
  const { data: userRow } = await admin
    .from("users")
    .select("id,easner_business_id")
    .eq("email", normalized)
    .maybeSingle()

  if (!userRow?.easner_business_id || userRow.easner_business_id === currentBusinessId) {
    return false
  }

  const { data: membership } = await admin
    .from("business_memberships")
    .select("role,status")
    .eq("business_id", userRow.easner_business_id)
    .eq("user_id", userRow.id)
    .maybeSingle()

  if (membership && membership.status !== "invited") {
    return displayRoleFromMembership(membership.role) === "Owner"
  }

  return userRow.easner_business_id !== currentBusinessId
}
