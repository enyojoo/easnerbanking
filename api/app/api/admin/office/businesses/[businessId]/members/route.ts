import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

function normalizeRole(role: string | null | undefined): string {
  const value = String(role ?? "").toLowerCase()
  if (value === "owner") return "Owner"
  if (value === "admin") return "Admin"
  if (value === "viewer") return "Viewer"
  return "Member"
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { businessId } = await params
  if (!businessId) return NextResponse.json({ error: "Missing business id" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data: membershipRows, error } = await admin
    .from("business_memberships")
    .select("id,user_id,full_name,email,role,status,created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true })

  if (!error && membershipRows) {
    return NextResponse.json({
      members: membershipRows.map((row) => ({
        id: row.user_id ?? row.id,
        membershipId: row.id,
        fullName: String(row.full_name ?? "").trim() || "Team Member",
        email: String(row.email ?? "").trim(),
        role: normalizeRole(row.role),
        status: row.status === "invited" ? "invited" : "active",
      })),
    })
  }

  const { data: users } = await admin
    .from("users")
    .select("id,full_name,email")
    .eq("easner_business_id", businessId)
    .order("created_at", { ascending: true })

  return NextResponse.json({
    members: (users ?? []).map((row) => ({
      id: row.id,
      fullName: String(row.full_name ?? "").trim() || "Team Member",
      email: String(row.email ?? "").trim(),
      role: "Member",
      status: "active",
    })),
  })
}
