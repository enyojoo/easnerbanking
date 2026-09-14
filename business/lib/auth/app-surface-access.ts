import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { hasPendingTeamInviteForEmail } from "@/lib/business/claim-team-invite"
import { ACCOUNT_CLOSED_MESSAGE } from "@/lib/settings/account-deletion"
import {
  accessForSurface,
  PLATFORM_MAINTENANCE_CODE,
  platformMaintenanceMessage,
  readPlatformAccess,
} from "@/lib/platform-access"

export type AppSurface = "business_web" | "consumer_mobile"

export type SurfaceAccessFailure = {
  ok: false
  status: number
  code: string
  message: string
}

export type SurfaceAccessResult = { ok: true } | SurfaceAccessFailure

/**
 * Enforces which Supabase-authenticated users may use each product surface.
 * - Active `admin_users` → Office console only (not Business web or consumer mobile).
 * - Business web → only `role === business` once a `public.users` row exists (no row yet: allow so bootstrap can create org user).
 * - Consumer mobile → only `role === individual` once a row exists (no row yet: allow so bootstrap can create individual user).
 */
export async function validateAppSurfaceAccess(
  userId: string,
  surface: AppSurface,
  userEmail?: string | null,
): Promise<SurfaceAccessResult> {
  const admin = createSupabaseAdmin()

  const { data: officeRow } = await admin
    .from("admin_users")
    .select("status")
    .eq("id", userId)
    .maybeSingle()

  if (officeRow?.status === "active") {
    return {
      ok: false,
      status: 403,
      code: "OFFICE_ADMIN_WRONG_APP",
      message:
        surface === "business_web"
          ? "Office administrator accounts must sign in through the Easner Office console."
          : "Office administrator accounts must sign in through the Easner Office console.",
    }
  }

  const flags = accessForSurface(await readPlatformAccess(admin), surface)
  if (flags.maintenance) {
    return {
      ok: false,
      status: 403,
      code: PLATFORM_MAINTENANCE_CODE,
      message: platformMaintenanceMessage(surface),
    }
  }

  const { data: userRow } = await admin
    .from("users")
    .select("role,deleted_at,deletion_scheduled_at")
    .eq("id", userId)
    .maybeSingle()
  const role = userRow?.role as string | null | undefined

  if (userRow?.deleted_at) {
    return {
      ok: false,
      status: 403,
      code: "ACCOUNT_CLOSED",
      message: ACCOUNT_CLOSED_MESSAGE,
    }
  }

  if (userRow == null) {
    return { ok: true }
  }

  if (surface === "business_web") {
    if (role !== "business") {
      if (role === "individual") {
        const email = typeof userEmail === "string" ? userEmail.trim() : ""
        if (email && (await hasPendingTeamInviteForEmail(admin, email))) {
          return { ok: true }
        }
        return {
          ok: false,
          status: 403,
          code: "WRONG_ROLE_FOR_BUSINESS_WEB",
          message: "You're an Easner Mobile user, please sign in through the Easner mobile app.",
        }
      }
      return {
        ok: false,
        status: 403,
        code: "WRONG_ROLE_FOR_BUSINESS_WEB",
        message: "This account is not enabled for the Business dashboard.",
      }
    }
    return { ok: true }
  }

  if (role !== "individual") {
    return {
      ok: false,
      status: 403,
      code: "WRONG_ROLE_FOR_MOBILE",
      message:
        role === "business"
          ? "You're an Easner Business user, please sign in at business.easner.com."
          : "This account is not enabled for the mobile app.",
    }
  }

  return { ok: true }
}
