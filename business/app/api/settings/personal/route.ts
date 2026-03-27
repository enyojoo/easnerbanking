import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromBearer } from "@/lib/supabase/admin"

type PersonalUpdateBody = {
  fullName?: string
  email?: string
  phone?: string
  dateOfBirth?: string
}

function fallbackNameFromMeta(user: { user_metadata?: Record<string, unknown> | null; email?: string | null }) {
  const meta = user.user_metadata ?? {}
  if (typeof meta.name === "string" && meta.name.trim()) return meta.name.trim()
  return user.email ?? "User"
}

export async function GET(request: Request) {
  const user = await getUserFromBearer(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("users")
    .select("id,email,full_name,phone,date_of_birth")
    .eq("id", user.id)
    .maybeSingle()

  return NextResponse.json({
    personal: {
      fullName: data?.full_name ?? fallbackNameFromMeta(user),
      email: data?.email ?? user.email ?? "",
      phone: data?.phone ?? "",
      dateOfBirth: data?.date_of_birth ?? "",
    },
  })
}

export async function PUT(request: Request) {
  const user = await getUserFromBearer(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: PersonalUpdateBody = {}
  try {
    body = (await request.json()) as PersonalUpdateBody
  } catch {
    body = {}
  }

  const admin = createSupabaseAdmin()
  const updatePayload = {
    id: user.id,
    email: body.email?.trim() || user.email || null,
    full_name: body.fullName?.trim() || null,
    phone: body.phone?.trim() || null,
    date_of_birth: body.dateOfBirth?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin.from("users").upsert(updatePayload, { onConflict: "id" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return GET(request)
}
