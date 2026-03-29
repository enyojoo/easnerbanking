import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromBearer } from "@/lib/supabase/admin"
import { extensionForMime, uploadPublicImage, validateImageFile } from "@/lib/supabase/storage-server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const user = await getUserFromBearer(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data: userRow } = await admin
    .from("users")
    .select("easner_organization_id")
    .eq("id", user.id)
    .maybeSingle()

  const organizationId = userRow?.easner_organization_id ?? null
  if (!organizationId) {
    return NextResponse.json({ error: "No organization linked to your account." }, { status: 400 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 })
  }

  const raw = form.get("file")
  if (!raw || typeof raw === "string") {
    return NextResponse.json({ error: "Missing file." }, { status: 400 })
  }

  const file = raw as File
  const v = validateImageFile(file)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const ext = extensionForMime(file.type)
  const path = `${organizationId}/${randomUUID()}.${ext}`

  const result = await uploadPublicImage({
    bucket: "org-logos",
    path,
    bytes: buf,
    contentType: file.type,
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ url: result.url, path: result.path })
}
