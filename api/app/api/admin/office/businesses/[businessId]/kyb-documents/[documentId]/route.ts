import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { isOwnedKybDocumentPath, KYB_DOCUMENTS_BUCKET } from "@/lib/grid/kyb-document-limits"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string; documentId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { businessId, documentId } = await params
  if (!businessId || !documentId) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: doc, error } = await admin
    .from("business_kyb_documents")
    .select("id,business_id,application_id,storage_path,file_name,content_type")
    .eq("id", documentId)
    .eq("business_id", businessId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  const storagePath = String(doc.storage_path ?? "").trim()
  const applicationId = String(doc.application_id ?? "")
  if (!storagePath || !isOwnedKybDocumentPath(businessId, applicationId, storagePath)) {
    return NextResponse.json({ error: "Invalid document path" }, { status: 400 })
  }

  const signed = await admin.storage.from(KYB_DOCUMENTS_BUCKET).createSignedUrl(storagePath, 600)
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: signed.error?.message || "Failed to sign URL" }, { status: 500 })
  }

  return NextResponse.json({
    url: signed.data.signedUrl,
    fileName: doc.file_name,
    contentType: doc.content_type,
  })
}
