import { createSupabaseAdmin } from "@/lib/supabase/admin"

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

  const { data: userRow } = await admin.from("users").select("role").eq("id", userId).maybeSingle()
  const role = userRow?.role as string | null | undefined

  if (userRow == null) {
    return { ok: true }
  }

  if (surface === "business_web") {
    if (role !== "business") {
      return {
        ok: false,
        status: 403,
        code: "WRONG_ROLE_FOR_BUSINESS_WEB",
        message:
          role === "individual"
            ? "Personal Easner accounts use the mobile app. Use Easner Business with an organization account, or create one after signing up on the web."
            : "This account is not enabled for the Business dashboard.",
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
          ? "Organization accounts use the Easner Business web dashboard."
          : "This account is not enabled for the mobile app.",
    }
  }

  return { ok: true }
}
