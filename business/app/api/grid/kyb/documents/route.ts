import { NextResponse } from "next/server"
import { requireKybContext } from "../_context"
import {
  ensureKybApplication,
  KYB_DOCUMENTS_BUCKET,
  mapKybDocumentRow,
} from "@/lib/grid/kyb-application-store"
import { encryptKybPii } from "@/lib/grid/kyb-pii-crypto"
import { deleteGridKybDocument } from "@/lib/grid/kyb-grid-writes"

const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"])
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error
  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a PDF, JPEG, or PNG file." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Maximum file size is 10 MB." }, { status: 400 })
  }
  const contentType = file.type || "application/octet-stream"
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Use PDF, JPEG, or PNG." }, { status: 400 })
  }

  const category = String(form.get("category") ?? "").trim()
  if (!category) return NextResponse.json({ error: "Document category is required" }, { status: 400 })
  const personId = String(form.get("personId") ?? "").trim() || null
  const documentType = String(form.get("documentType") ?? "").trim() || null
  const issuingCountry = String(form.get("issuingCountry") ?? "").trim() || null
  const issuingAuthority = String(form.get("issuingAuthority") ?? "").trim() || null
  const documentNumber = encryptKybPii(String(form.get("documentNumber") ?? ""))
  const side = String(form.get("side") ?? "").trim() || null
  const ext = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg"
  const storagePath = `${ctx.businessId}/${application.id}/${crypto.randomUUID()}.${ext}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: false,
  })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message || "Upload failed" }, { status: 400 })
  }

  const { data, error } = await ctx.admin
    .from("business_kyb_documents")
    .insert({
      application_id: application.id,
      business_id: ctx.businessId,
      person_id: personId,
      category,
      document_type: documentType,
      issuing_country: issuingCountry,
      issuing_authority: issuingAuthority,
      document_number_ciphertext: documentNumber.ciphertext,
      document_number_key_id: documentNumber.keyId,
      storage_path: storagePath,
      file_name: file.name,
      content_type: contentType,
      byte_size: file.size,
      side,
    })
    .select("*")
    .single()
  if (error || !data) {
    await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([storagePath])
    return NextResponse.json({ error: error?.message || "Could not save document" }, { status: 400 })
  }

  const mapped = mapKybDocumentRow(data as Record<string, unknown>, true)
  return NextResponse.json({ document: { ...mapped, storagePath: undefined } })
}

export async function DELETE(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error
  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const id = new URL(request.url).searchParams.get("id")?.trim() || ""
  if (!id) return NextResponse.json({ error: "Document id is required" }, { status: 400 })

  const { data: row } = await ctx.admin
    .from("business_kyb_documents")
    .select("id,storage_path,grid_document_id")
    .eq("id", id)
    .eq("application_id", application.id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  if (row.grid_document_id) {
    await deleteGridKybDocument(String(row.grid_document_id)).catch((error) => {
      console.warn("[grid/kyb/documents] Grid delete:", error)
    })
  }
  if (row.storage_path) {
    await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([String(row.storage_path)])
  }
  await ctx.admin.from("business_kyb_documents").delete().eq("id", id)
  return NextResponse.json({ ok: true })
}
