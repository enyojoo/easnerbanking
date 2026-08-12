import { NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { countries } from "@/lib/countries"
import {
  isApplePrivateRelayFromIdentity,
  resolveSignupEmailBlock,
  type SignupEmailBlockReason,
} from "@easner/shared"
import { isCountryAllowedForSurface } from "@/lib/jurisdiction-country-policy"
import { noahCustomerIdFromBusinessId, noahCustomerIdFromUserId } from "@/lib/noah/customer-id"
import { ensureTurnkeySubOrgForEasnerOwner } from "@/lib/wallet/ensure-turnkey-sub-org"
import { emailService } from "@easner/server"
import { getEmailAudienceProfile } from "@easner/server"
import { claimTeamInvite } from "@/lib/business/claim-team-invite"
import { ensureBusinessOrganizationId, firstNameFromFullName } from "@/lib/business/ensure-business-organization"
import { ensureDefaultCommunicationPreferences } from "@/lib/notifications/ensure-communication-preferences"
import { cancelAccountDeletion } from "@/lib/settings/account-deletion"
import { isGridConfigured } from "@/lib/grid/config"
import {
  fetchCurrentEndUserTermsVersion,
  inferAcceptanceMethod,
  recordGridEndUserTermsAcceptance,
  resolveClientIp,
  shouldRefreshGridTermsAcceptance,
  type GridEndUserTermsUserRow,
} from "@/lib/grid/end-user-terms-consent"

type BootstrapBody = {
  countryCode?: string
  role?: "business" | "individual"
  fullName?: string | null
  membershipId?: string
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

function countryNameFromCode(code: string | null): string | null {
  if (!code) return null
  const match = countries.find((c) => c.code === code)
  return match?.name ?? null
}

function parseName(fullName: string | null | undefined): { fullName: string | null } {
  const trimmed = typeof fullName === "string" ? fullName.trim() : ""
  if (!trimmed) return { fullName: null }
  return { fullName: trimmed }
}

function signupEmailBlockForAuthUser(user: User): SignupEmailBlockReason | null {
  const emailBlock = resolveSignupEmailBlock(user.email)
  if (emailBlock) return emailBlock

  for (const identity of user.identities ?? []) {
    if (identity.provider !== "apple") continue
    const data =
      identity.identity_data && typeof identity.identity_data === "object"
        ? (identity.identity_data as Record<string, unknown>)
        : null
    if (isApplePrivateRelayFromIdentity(data)) {
      return resolveSignupEmailBlock(user.email, { applePrivateRelay: true })
    }
  }

  return null
}

async function loadAuthUserForSignupPolicy(
  admin: ReturnType<typeof createSupabaseAdmin>,
  user: User,
): Promise<User> {
  if ((user.identities?.length ?? 0) > 0) return user
  const { data, error } = await admin.auth.admin.getUserById(user.id)
  if (error || !data.user) return user
  return data.user
}

async function sendWelcomeEmailIfNew(input: {
  email: string | null | undefined
  firstName: string | null | undefined
  audience: "business" | "personal"
  isNewAccount: boolean
}) {
  if (!input.isNewAccount || !input.email?.trim()) return
  const audience = input.audience
  const profile = getEmailAudienceProfile(audience)
  const firstName =
    input.firstName?.trim() ||
    input.email.split("@")[0]?.trim() ||
    "there"
  await emailService
    .sendWelcomeEmail(
      {
        firstName,
        email: input.email.trim(),
        dashboardUrl: profile.dashboardUrl,
        audience,
      },
      undefined,
    )
    .catch((e) => console.warn("welcome email (non-fatal):", e))
}

async function ensureOwnerMembership(params: {
  admin: ReturnType<typeof createSupabaseAdmin>
  businessId: string
  userId: string
  fullName: string | null
  email: string | null
}) {
  const { admin, businessId, userId, fullName, email } = params
  if (!email) return

  // Best-effort: if memberships table is not migrated yet, bootstrap should still succeed.
  await admin.from("business_memberships").upsert(
    {
      business_id: businessId,
      user_id: userId,
      full_name: fullName?.trim() || "Account Owner",
      email: email.trim().toLowerCase(),
      role: "owner",
      status: "active",
      invited_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,email" },
  )
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let body: BootstrapBody = {}
  try {
    body = (await request.json()) as BootstrapBody
  } catch {
    body = {}
  }

  const role: "business" | "individual" = body.role === "individual" ? "individual" : "business"
  const countryCode = normalizeCountryCode(body.countryCode)
  const country = countryNameFromCode(countryCode)
  const metadataName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null
  /** Only JSON string counts as explicit — `fullName: null` must not wipe DB (treat as omit; preserve/seed). */
  const explicitFullNameProvided = typeof body.fullName === "string"
  const explicitName = parseName(explicitFullNameProvided ? body.fullName : null)
  const admin = createSupabaseAdmin()

  if (role === "business" && countryCode) {
    const ok = isCountryAllowedForSurface(countryCode, "signup")
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "This country is not available for registration. Choose another or contact support." },
        { status: 400 },
      )
    }
  }

  const { data: userRow } = await admin
    .from("users")
    .select(
      "id,easner_business_id,full_name,role,residence_country,deletion_scheduled_at,deleted_at,grid_end_user_terms_version,grid_end_user_terms_accepted_at,grid_end_user_terms_accept_ip,grid_end_user_terms_accept_method",
    )
    .eq("id", user.id)
    .maybeSingle()

  const existingRole =
    userRow?.role === "business" || userRow?.role === "individual" ? userRow.role : null
  const hasBusinessLink = typeof userRow?.easner_business_id === "string" && userRow.easner_business_id.length > 0

  if (userRow?.deleted_at) {
    return NextResponse.json(
      {
        ok: false,
        error: "This account has been closed. Contact support@easner.com if you need help restoring access.",
        code: "ACCOUNT_CLOSED",
      },
      { status: 403 },
    )
  }

  // Signing back in during the grace period cancels pending account closure.
  if (userRow?.id && userRow.deletion_scheduled_at) {
    try {
      await cancelAccountDeletion(admin, user.id)
    } catch (e) {
      console.warn("[bootstrap] cancel pending account deletion:", e)
    }
  }

  if (role === "individual") {
    const isNewIndividual = !userRow?.id
    if (isNewIndividual && !countryCode) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please select your country of residence.",
          code: "RESIDENCE_COUNTRY_REQUIRED",
        },
        { status: 400 },
      )
    }
    if (countryCode) {
      const ok = isCountryAllowedForSurface(countryCode, "individual_residence")
      if (!ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "This country is not available for registration. Choose another or contact support.",
            code: "COUNTRY_NOT_SUPPORTED",
          },
          { status: 400 },
        )
      }
    }
  }

  /**
   * Server-side anti-bot guard (defense-in-depth behind the sign-up pre-check): refuse to create an
   * app account for a disposable/throwaway email or Apple Hide My Email relay. Only applies to
   * brand-new accounts so existing users are never locked out on a later sign-in.
   */
  if (!userRow?.id) {
    const authUserForPolicy = await loadAuthUserForSignupPolicy(admin, user)
    const emailBlock = signupEmailBlockForAuthUser(authUserForPolicy)
    if (emailBlock) {
      return NextResponse.json(
        {
          ok: false,
          error: emailBlock.error,
          code: emailBlock.code,
        },
        { status: 403 },
      )
    }
  }

  const dbFullNameTrim =
    typeof userRow?.full_name === "string" ? userRow.full_name.trim() : ""

  const resolvedBootstrapFullName =
    userRow?.id && dbFullNameTrim.length > 0
      ? dbFullNameTrim
      : explicitFullNameProvided
        ? explicitName.fullName
        : userRow?.id
          ? typeof userRow.full_name === "string"
            ? userRow.full_name
            : null
          : parseName(metadataName).fullName

  const membershipId = typeof body.membershipId === "string" ? body.membershipId.trim() : ""

  if (role === "business" && membershipId) {
    const claim = await claimTeamInvite(admin, {
      userId: user.id,
      authEmail: user.email,
      fullName: resolvedBootstrapFullName,
      membershipId,
    })
    if (!claim.ok) {
      return NextResponse.json(
        { ok: false, error: claim.message, code: claim.code },
        { status: claim.httpStatus },
      )
    }
    if (claim.claimed) {
      let turnkeySubOrgReady = false
      try {
        const tk = await ensureTurnkeySubOrgForEasnerOwner({
          admin,
          scope: "business",
          subjectUserId: user.id,
          subjectBusinessId: claim.businessId,
          noahCustomerId: noahCustomerIdFromBusinessId(claim.businessId),
          userEmail: user.email,
          displayName: resolvedBootstrapFullName,
        })
        turnkeySubOrgReady = tk.ok
        if (!tk.ok && tk.reason !== "email_required" && tk.reason !== "turnkey_disabled") {
          console.warn("[bootstrap] Turnkey sub-org (team invite):", tk.reason)
        }
      } catch (e) {
        console.warn("[bootstrap] Turnkey sub-org (team invite) error:", e)
      }

      await ensureDefaultCommunicationPreferences(admin, user.id)

      return NextResponse.json({
        ok: true,
        role: "business",
        userId: user.id,
        businessId: claim.businessId,
        joinedViaInvite: true,
        turnkeySubOrgReady,
      })
    }
  }

  /**
   * Never allow bootstrap to flip an existing account between consumer/business roles.
   * - Existing individual cannot be upgraded to business via bootstrap.
   * - Existing business (or linked org user) cannot be downgraded to individual via bootstrap.
   */
  if (existingRole && existingRole !== role) {
    return NextResponse.json(
      {
        ok: false,
        error:
          existingRole === "individual"
            ? "You're an Easner Mobile user, please sign in through the Easner mobile app."
            : "You're an Easner Business user, please sign in at business.easner.com.",
        code: "ROLE_TRANSITION_DENIED",
      },
      { status: 403 },
    )
  }
  if (role === "individual" && hasBusinessLink) {
    return NextResponse.json(
      {
        ok: false,
        error: "You're an Easner Business user, please sign in at business.easner.com.",
        code: "BUSINESS_LINKED_ACCOUNT",
      },
      { status: 403 },
    )
  }

  const existingResidence =
    typeof userRow?.residence_country === "string" ? userRow.residence_country.trim().toUpperCase() : ""
  const shouldSetResidence = role === "individual" && Boolean(countryCode) && !existingResidence

  const baseUserPayload: Record<string, unknown> = {
    id: user.id,
    email: user.email ?? null,
    full_name: resolvedBootstrapFullName,
    updated_at: new Date().toISOString(),
  }
  if (shouldSetResidence) {
    baseUserPayload.residence_country = countryCode
  }

  const isMissingResidenceColumn = (err: { code?: string; message?: string } | null | undefined) =>
    err?.code === "42703" || Boolean(err?.message && /residence_country/i.test(err.message))

  let residencePersisted = Boolean(existingResidence)
  if (shouldSetResidence && countryCode) {
    residencePersisted = false
  }

  // Prefer full payload; only strip residence_country when the column is missing (pre-migration).
  const { error: upsertErrWithRole } = await admin
    .from("users")
    .upsert({ ...baseUserPayload, role: existingRole ?? role }, { onConflict: "id" })
  if (!upsertErrWithRole) {
    if (shouldSetResidence) residencePersisted = true
  } else if (isMissingResidenceColumn(upsertErrWithRole) && shouldSetResidence) {
    const payloadNoResidence = {
      id: user.id,
      email: user.email ?? null,
      full_name: resolvedBootstrapFullName,
      updated_at: new Date().toISOString(),
    }
    const { error: upsertErrWithRoleNoRes } = await admin
      .from("users")
      .upsert({ ...payloadNoResidence, role: existingRole ?? role }, { onConflict: "id" })
    if (upsertErrWithRoleNoRes) {
      const { error: upsertErrNoRole } = await admin.from("users").upsert(payloadNoResidence, { onConflict: "id" })
      if (upsertErrNoRole) {
        await admin
          .from("users")
          .upsert(
            {
              id: user.id,
              email: user.email ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" },
          )
      }
    }
    residencePersisted = false
  } else {
    // Unrelated upsert error — retry without role / minimal fields, but keep residence when we can.
    const { error: upsertErrNoRole } = await admin.from("users").upsert(baseUserPayload, { onConflict: "id" })
    if (!upsertErrNoRole) {
      if (shouldSetResidence) residencePersisted = true
    } else if (isMissingResidenceColumn(upsertErrNoRole) && shouldSetResidence) {
      const payloadNoResidence = {
        id: user.id,
        email: user.email ?? null,
        full_name: resolvedBootstrapFullName,
        updated_at: new Date().toISOString(),
      }
      await admin.from("users").upsert(payloadNoResidence, { onConflict: "id" })
      residencePersisted = false
    } else {
      await admin
        .from("users")
        .upsert(
          {
            id: user.id,
            email: user.email ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
      if (shouldSetResidence) residencePersisted = false
    }
  }

  // Grid End User Terms audit — non-blocking if Grid is down; ensure* fails closed later.
  if (isGridConfigured()) {
    try {
      const { version } = await fetchCurrentEndUserTermsVersion()
      const termsRow = (userRow ?? { id: null }) as GridEndUserTermsUserRow
      if (shouldRefreshGridTermsAcceptance(termsRow, version)) {
        const authUserForMethod = await loadAuthUserForSignupPolicy(admin, user)
        await recordGridEndUserTermsAcceptance(admin, {
          userId: user.id,
          ip: resolveClientIp(request),
          method: inferAcceptanceMethod(!userRow?.id, authUserForMethod.identities),
          version,
        })
      }
    } catch (e) {
      console.warn("[bootstrap] grid end-user-terms record (non-fatal):", e)
    }
  }

  const resolvedResidenceCountry =
    (residencePersisted && (existingResidence || countryCode)) || existingResidence || null

  /**
   * When DB `full_name` differs from JWT (e.g. edited in Supabase or profile API), align auth metadata
   * so the mobile session can refresh to match without another profile save.
   */
  if (role === "individual" && dbFullNameTrim.length > 0) {
    const jwtName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim() : ""
    if (jwtName !== dbFullNameTrim) {
      try {
        const { data: cur, error: gErr } = await admin.auth.admin.getUserById(user.id)
        if (!gErr && cur?.user) {
          const meta = { ...(cur.user.user_metadata ?? {}) } as Record<string, unknown>
          meta.name = dbFullNameTrim
          await admin.auth.admin.updateUserById(user.id, { user_metadata: meta })
        }
      } catch {
        /* non-fatal */
      }
    }
  }

  if (role === "individual") {
    let turnkeySubOrgReady = false
    try {
      const tk = await ensureTurnkeySubOrgForEasnerOwner({
        admin,
        scope: "individual",
        subjectUserId: user.id,
        subjectBusinessId: null,
        noahCustomerId: noahCustomerIdFromUserId(user.id),
        userEmail: user.email,
        displayName: resolvedBootstrapFullName,
      })
      turnkeySubOrgReady = tk.ok
      if (!tk.ok && tk.reason !== "email_required" && tk.reason !== "turnkey_disabled") {
        console.warn("[bootstrap] Turnkey sub-org (individual):", tk.reason)
      }
    } catch (e) {
      console.warn("[bootstrap] Turnkey sub-org (individual) error:", e)
    }
    await sendWelcomeEmailIfNew({
      email: user.email,
      firstName: firstNameFromFullName(resolvedBootstrapFullName),
      audience: "personal",
      isNewAccount: !userRow?.id,
    })
    await ensureDefaultCommunicationPreferences(admin, user.id)
    return NextResponse.json({
      ok: true,
      role,
      userId: user.id,
      businessId: userRow?.easner_business_id ?? null,
      turnkeySubOrgReady,
      residenceCountry: resolvedResidenceCountry,
    })
  }

  let businessId = userRow?.easner_business_id ?? null
  const isNewBusinessAccount = !userRow?.id

  if (!businessId) {
    businessId = await ensureBusinessOrganizationId(admin, {
      userId: user.id,
      email: user.email ?? null,
      fullName: resolvedBootstrapFullName,
      country,
    })
  } else if (country) {
    try {
      const { data: orgRow } = await admin.from("businesses").select("country").eq("id", businessId).maybeSingle()
      const cur = typeof orgRow?.country === "string" ? orgRow.country.trim() : ""
      if (!cur) {
        await admin.from("businesses").update({ country, updated_at: new Date().toISOString() }).eq("id", businessId)
      }
    } catch {
      // non-fatal
    }
  }

  const userLinkPayload = {
    id: user.id,
    email: user.email ?? null,
    full_name: resolvedBootstrapFullName,
    easner_business_id: businessId,
    updated_at: new Date().toISOString(),
  }

  const businessUserPayload = { ...userLinkPayload, role: "business" as const }
  const { error: linkErr } = await admin.from("users").upsert(businessUserPayload, { onConflict: "id" })
  if (linkErr) {
    // Retry field-by-field so a partial row never keeps role=individual with a linked org.
    const { error: linkErrMinimal } = await admin.from("users").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        easner_business_id: businessId,
        role: "business",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    if (linkErrMinimal) {
      return NextResponse.json({ ok: false, error: linkErrMinimal.message }, { status: 500 })
    }
  }

  await ensureOwnerMembership({
    admin,
    businessId,
    userId: user.id,
    fullName: resolvedBootstrapFullName,
    email: user.email ?? null,
  })

  let turnkeySubOrgReady = false
  try {
    const tk = await ensureTurnkeySubOrgForEasnerOwner({
      admin,
      scope: "business",
      subjectUserId: user.id,
      subjectBusinessId: businessId,
      noahCustomerId: noahCustomerIdFromBusinessId(businessId),
      userEmail: user.email,
      displayName: resolvedBootstrapFullName,
    })
    turnkeySubOrgReady = tk.ok
    if (!tk.ok && tk.reason !== "email_required" && tk.reason !== "turnkey_disabled") {
      console.warn("[bootstrap] Turnkey sub-org (business):", tk.reason)
    }
  } catch (e) {
    console.warn("[bootstrap] Turnkey sub-org (business) error:", e)
  }

  await sendWelcomeEmailIfNew({
    email: user.email,
    firstName: firstNameFromFullName(resolvedBootstrapFullName),
    audience: "business",
    isNewAccount: isNewBusinessAccount,
  })

  await ensureDefaultCommunicationPreferences(admin, user.id)

  return NextResponse.json({
    ok: true,
    role: "business",
    userId: user.id,
    businessId,
    country: country ?? null,
    turnkeySubOrgReady,
  })
}
