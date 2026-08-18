import type { createSupabaseAdmin } from "@/lib/supabase/admin"

type Admin = ReturnType<typeof createSupabaseAdmin>

export async function syncCheckoutAllowedOrigins(admin: Admin, businessId: string) {
  const { data: sites } = await admin
    .from("business_checkout_sites")
    .select("origin")
    .eq("business_id", businessId)

  const origins = [
    ...new Set(
      (sites ?? [])
        .map((row) => (typeof row.origin === "string" ? row.origin.trim() : ""))
        .filter(Boolean),
    ),
  ]

  await admin.from("business_checkout_settings").upsert(
    {
      business_id: businessId,
      allowed_origins: origins,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  )
}
