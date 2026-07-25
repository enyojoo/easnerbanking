import { NextResponse } from "next/server"
import { getUserFromApiRequest, createSupabaseAdmin } from "@/lib/supabase/admin"
import { enforcePayrollRateLimit } from "@/lib/payroll/rate-limit"

async function canAccessDocument(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  document: { user_id: string | null; business_id: string },
): Promise<boolean> {
  if (document.user_id === userId) return true
  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from("users").select("easner_business_id").eq("id", userId).maybeSingle(),
    admin.from("business_memberships").select("id").eq("business_id", document.business_id)
      .eq("user_id", userId).maybeSingle(),
  ])
  return profile?.easner_business_id === document.business_id || Boolean(membership)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const admin = createSupabaseAdmin()
  if (!(await enforcePayrollRateLimit(admin, `payroll_download:${user.id}`, {
    limit: 60,
    windowSeconds: 60,
  }))) {
    return NextResponse.json({ error: "Too many document requests. Try again shortly." }, { status: 429 })
  }
  const { data: document } = await admin.from("payroll_documents")
    .select("*").eq("id", id).maybeSingle()
  if (!document || !(await canAccessDocument(admin, user.id, document))) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  const { data: signed, error } = await admin.storage.from("payroll-documents")
    .createSignedUrl(String(document.storage_path), 300, {
      download: new URL(request.url).searchParams.get("download") === "1"
        ? String(document.filename)
        : false,
    })
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message || "Document unavailable" }, { status: 500 })
  }
  await admin.from("payroll_run_events").insert({
    business_id: document.business_id,
    run_id: document.run_id,
    person_id: document.person_id,
    actor_user_id: user.id,
    event_type: "document.downloaded",
    data: { documentId: document.id, download: new URL(request.url).searchParams.get("download") === "1" },
  })
  return NextResponse.json({
    document: {
      id: document.id,
      type: document.type,
      status: document.status,
      filename: document.filename,
      templateVersion: document.template_version,
      metadata: document.metadata,
      generatedAt: document.generated_at,
      downloadUrl: signed.signedUrl,
    },
  }, { headers: { "Cache-Control": "private, no-store" } })
}
