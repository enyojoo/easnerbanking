import type { SupabaseClient } from "@supabase/supabase-js"

export async function sendPayrollRunSummaryEmail(input: {
  admin: SupabaseClient
  businessId: string
  runId: string
  completed: number
  failed: number
}): Promise<void> {
  const [{ data: business }, { data: run }, { data: memberships }, { data: legacyUsers }] =
    await Promise.all([
      input.admin.from("businesses").select("name").eq("id", input.businessId).maybeSingle(),
      input.admin.from("payroll_runs").select("metadata").eq("id", input.runId).maybeSingle(),
      input.admin
        .from("business_memberships")
        .select("user_id,role")
        .eq("business_id", input.businessId),
      input.admin.from("users").select("id,email").eq("easner_business_id", input.businessId),
    ])

  const privilegedUserIds = (memberships ?? [])
    .filter((membership) => ["owner", "admin"].includes(String(membership.role || "").toLowerCase()))
    .map((membership) => String(membership.user_id))
  const { data: membershipUsers } = privilegedUserIds.length
    ? await input.admin.from("users").select("id,email").in("id", privilegedUserIds)
    : { data: [] }
  const emails = new Set(
    [...(membershipUsers ?? []), ...(legacyUsers ?? [])]
      .map((user) => String(user.email || "").trim().toLowerCase())
      .filter(Boolean),
  )
  if (emails.size === 0) return

  const metadata = (run?.metadata as Record<string, unknown> | null) ?? {}
  const businessName = String(business?.name || "Easner Business")
  const runName = String(metadata.name || "Payroll run")
  const baseUrl =
    process.env.NEXT_PUBLIC_BUSINESS_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://business.easner.com"
  const { emailService } = await import("@easner/server")
  await Promise.all(
    [...emails].map((to) =>
      emailService.sendEmail({
        to,
        template: "payrollRunSummary",
        audience: "business",
        data: {
          businessName,
          runName,
          completed: input.completed,
          failed: input.failed,
          total: input.completed + input.failed,
          runUrl: `${baseUrl}/payroll/runs/${encodeURIComponent(input.runId)}`,
        },
      }),
    ),
  )
}
