import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

type TeamMember = {
  id: string
  membershipId?: string
  fullName: string
  email: string
  role: "Owner" | "Admin" | "Member" | "Viewer"
  status?: "active" | "invited"
  isSelf?: boolean
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "U"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

type InviteRow = {
  fullName: string
  email: string
  role: "Admin" | "Member" | "Viewer"
}

function normalizeRole(role: string | null | undefined): TeamMember["role"] {
  if (!role) return "Member"
  const value = role.toLowerCase()
  if (value === "owner") return "Owner"
  if (value === "admin") return "Admin"
  if (value === "viewer") return "Viewer"
  return "Member"
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function getMeAndOrg(admin: ReturnType<typeof createSupabaseAdmin>, userId: string) {
  const { data: me, error: meError } = await admin
    .from("users")
    .select("id,email,full_name,easner_business_id")
    .eq("id", userId)
    .maybeSingle()
  return { me, meError }
}

async function requireOwner(admin: ReturnType<typeof createSupabaseAdmin>, userId: string) {
  const { me, meError } = await getMeAndOrg(admin, userId)
  if (meError) return { error: NextResponse.json({ error: meError.message }, { status: 500 }) }
  if (!me?.easner_business_id) return { error: NextResponse.json({ error: "Business not found for user" }, { status: 400 }) }

  const { data: myMembership, error: membershipError } = await admin
    .from("business_memberships")
    .select("role")
    .eq("business_id", me.easner_business_id)
    .eq("user_id", userId)
    .maybeSingle()

  if (membershipError) return { error: NextResponse.json({ error: membershipError.message }, { status: 500 }) }
  if (!myMembership || normalizeRole(myMembership.role) !== "Owner") {
    return { error: NextResponse.json({ error: "Only business owners can manage team members" }, { status: 403 }) }
  }

  return { orgId: me.easner_business_id }
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { me, meError } = await getMeAndOrg(admin, user.id)

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 })
  }

  const myName = (me?.full_name ?? "").trim() || (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "") || "Account Owner"
  const myEmail = (me?.email ?? user.email ?? "").trim()
  const orgId = me?.easner_business_id ?? null

  if (!orgId) {
    const solo: TeamMember = {
      id: user.id,
      fullName: myName,
      email: myEmail,
      role: "Owner",
    }
    return NextResponse.json({ members: [solo] })
  }

  // Preferred source: organization memberships with granular roles.
  const { data: membershipRows, error: membershipError } = await admin
    .from("business_memberships")
    .select("id,user_id,full_name,email,role,status,created_at")
    .eq("business_id", orgId)
    .order("created_at", { ascending: true })

  if (!membershipError && membershipRows) {
    const myMembership = membershipRows.find((row) => row.user_id === user.id)
    const canManageMembers = normalizeRole(myMembership?.role) === "Owner"
    const members: TeamMember[] = membershipRows.map((row) => ({
      id: row.user_id ?? row.id,
      membershipId: row.id,
      fullName: (row.full_name ?? "").trim() || "Team Member",
      email: (row.email ?? "").trim(),
      role: normalizeRole(row.role),
      status: (row.status === "invited" ? "invited" : "active") as TeamMember["status"],
      isSelf: row.user_id === user.id,
    }))
    return NextResponse.json({
      members: members.map((m) => ({ ...m, initials: initials(m.fullName) })),
      canManageMembers,
    })
  }

  // Fallback for older schema before memberships table is migrated.
  const { data: rows, error: membersError } = await admin
    .from("users")
    .select("id,full_name,email")
    .eq("easner_business_id", orgId)
    .order("created_at", { ascending: true })

  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 })

  const members: TeamMember[] = (rows ?? []).map((row) => ({
    id: row.id,
    fullName: (row.full_name ?? "").trim() || (row.id === user.id ? myName : "Team Member"),
    email: (row.email ?? "").trim(),
    role: row.id === user.id ? "Owner" : "Member",
    status: "active",
  }))

  if (!members.some((m) => m.id === user.id)) {
    members.unshift({
      id: user.id,
      fullName: myName,
      email: myEmail,
      role: "Owner",
    })
  }

  return NextResponse.json({
    members: members.map((m) => ({ ...m, initials: initials(m.fullName) })),
    canManageMembers: true,
  })
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { invites?: InviteRow[] } = {}
  try {
    body = (await request.json()) as { invites?: InviteRow[] }
  } catch {
    body = {}
  }

  const invites = (body.invites ?? [])
    .map((row) => ({
      fullName: row.fullName?.trim() ?? "",
      email: normalizeEmail(row.email ?? ""),
      role: row.role ?? "Member",
    }))
    .filter((row) => row.fullName && row.email)

  if (invites.length === 0) {
    return NextResponse.json({ error: "No valid invites provided" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const ownerCheck = await requireOwner(admin, user.id)
  if ("error" in ownerCheck) return ownerCheck.error

  const rows = invites.map((row) => ({
    business_id: ownerCheck.orgId,
    user_id: null,
    full_name: row.fullName,
    email: row.email,
    role: row.role.toLowerCase(),
    status: "invited",
    invited_by: user.id,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await admin
    .from("business_memberships")
    .upsert(rows, { onConflict: "business_id,email" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return GET(request)
}

export async function PATCH(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { membershipId?: string; role?: "Admin" | "Member" | "Viewer" } = {}
  try {
    body = (await request.json()) as { membershipId?: string; role?: "Admin" | "Member" | "Viewer" }
  } catch {
    body = {}
  }

  if (!body.membershipId || !body.role) {
    return NextResponse.json({ error: "membershipId and role are required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const ownerCheck = await requireOwner(admin, user.id)
  if ("error" in ownerCheck) return ownerCheck.error

  const { data: existing, error: existingError } = await admin
    .from("business_memberships")
    .select("id,business_id,role")
    .eq("id", body.membershipId)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (!existing || existing.business_id !== ownerCheck.orgId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }
  if (normalizeRole(existing.role) === "Owner") {
    return NextResponse.json({ error: "Owner role cannot be changed here" }, { status: 400 })
  }

  const { error } = await admin
    .from("business_memberships")
    .update({ role: body.role.toLowerCase(), updated_at: new Date().toISOString() })
    .eq("id", body.membershipId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return GET(request)
}

export async function DELETE(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const membershipId = url.searchParams.get("membershipId")
  if (!membershipId) return NextResponse.json({ error: "membershipId is required" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const ownerCheck = await requireOwner(admin, user.id)
  if ("error" in ownerCheck) return ownerCheck.error

  const { data: existing, error: existingError } = await admin
    .from("business_memberships")
    .select("id,business_id,role")
    .eq("id", membershipId)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (!existing || existing.business_id !== ownerCheck.orgId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }
  if (normalizeRole(existing.role) === "Owner") {
    return NextResponse.json({ error: "Owner cannot be removed" }, { status: 400 })
  }

  const { error } = await admin.from("business_memberships").delete().eq("id", membershipId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return GET(request)
}
