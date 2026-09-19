import { NextResponse } from "next/server"
import { requireKybContext } from "../_context"
import {
  ensureKybApplication,
  KYB_DOCUMENTS_BUCKET,
  mapKybDocumentRow,
} from "@/lib/grid/kyb-application-store"
import { encryptKybPii } from "@/lib/grid/kyb-pii-crypto"
import { deleteGridKybDocument } from "@/lib/grid/kyb-grid-writes"
import { normalizeKybDocumentBytes } from "@/lib/grid/kyb-document-file"
import {
  extensionFromKybContentType,
  extensionFromKybFileName,
  isOwnedKybDocumentPath,
  KYB_DOCUMENT_MAX_BYTES,
  KYB_DOCUMENT_TOO_LARGE,
} from "@/lib/grid/kyb-document-limits"

export async function POST(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error
  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: KYB_DOCUMENT_TOO_LARGE },
      { status: 400 },
    )
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const phase = String(body?.phase ?? "")

  if (phase === "prepare") {
    const fileName = String(body?.fileName ?? "").trim() || "document"
    const byteSize = Number(body?.byteSize ?? 0)
    if (!Number.isFinite(byteSize) || byteSize <= 0) {
      return NextResponse.json({ error: "Choose a PDF, JPEG, or PNG file." }, { status: 400 })
    }
    if (byteSize > KYB_DOCUMENT_MAX_BYTES) {
      return NextResponse.json({ error: KYB_DOCUMENT_TOO_LARGE }, { status: 400 })
    }
    const ext = extensionFromKybFileName(fileName) || extensionFromKybContentType(String(body?.contentType ?? ""))
    const storagePath = `${ctx.businessId}/${application.id}/${crypto.randomUUID()}.${ext}`
    const { data, error } = await ctx.admin.storage
      .from(KYB_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storagePath)
    if (error || !data?.token || !data.path) {
      console.error("[grid/kyb/documents] signed upload url:", error)
      return NextResponse.json({ error: "Could not start the file upload." }, { status: 400 })
    }
    return NextResponse.json({ storagePath: data.path, token: data.token })
  }

  if (phase !== "complete") {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 })
  }

  const storagePath = String(body?.storagePath ?? "").trim()
  if (!isOwnedKybDocumentPath(ctx.businessId, application.id, storagePath)) {
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 })
  }

  const { data: blob, error: downloadError } = await ctx.admin.storage
    .from(KYB_DOCUMENTS_BUCKET)
    .download(storagePath)
  if (downloadError || !blob) {
    console.error("[grid/kyb/documents] storage download:", downloadError)
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 })
  }

  const rawBytes = Buffer.from(await blob.arrayBuffer())
  if (rawBytes.length > KYB_DOCUMENT_MAX_BYTES) {
    await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([storagePath])
    return NextResponse.json({ error: KYB_DOCUMENT_TOO_LARGE }, { status: 400 })
  }

  const normalized = await normalizeKybDocumentBytes({
    bytes: rawBytes,
    contentType: blob.type || "application/octet-stream",
    fileName: String(body?.fileName ?? "document"),
  })
  if ("error" in normalized) {
    await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([storagePath])
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  let finalPath = storagePath
  const { bytes, contentType: storedType, fileName } = normalized
  const wantedExt = extensionFromKybContentType(storedType)
  if (!finalPath.endsWith(`.${wantedExt}`) || bytes.length !== rawBytes.length) {
    const nextPath = `${ctx.businessId}/${application.id}/${crypto.randomUUID()}.${wantedExt}`
    const { error: rewriteError } = await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).upload(nextPath, bytes, {
      contentType: storedType,
      upsert: false,
    })
    if (rewriteError) {
      console.error("[grid/kyb/documents] storage rewrite:", rewriteError)
      await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([storagePath])
      return NextResponse.json(
        { error: rewriteError.message || "Could not store the file. Try a JPEG or PNG under 10 MB." },
        { status: 400 },
      )
    }
    await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([storagePath])
    finalPath = nextPath
  }

  const category = String(body?.category ?? "").trim()
  if (!category) {
    await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([finalPath])
    return NextResponse.json({ error: "Document category is required" }, { status: 400 })
  }
  const personId = String(body?.personId ?? "").trim() || null
  const documentType = String(body?.documentType ?? "").trim() || null
  const issuingCountry = String(body?.issuingCountry ?? "").trim() || null
  const issuingAuthority = String(body?.issuingAuthority ?? "").trim() || null
  const rawDocumentNumber = String(body?.documentNumber ?? "").trim()
  if (category === "identity" && (!documentType || !issuingCountry || !issuingAuthority || !rawDocumentNumber)) {
    await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([finalPath])
    return NextResponse.json(
      { error: "Add issuing country, issuing authority, and document number before uploading an ID." },
      { status: 400 },
    )
  }
  const documentNumber = encryptKybPii(rawDocumentNumber)
  const side = String(body?.side ?? "").trim() || null

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
      storage_path: finalPath,
      file_name: fileName,
      content_type: storedType,
      byte_size: bytes.length,
      side,
    })
    .select("*")
    .single()
  if (error || !data) {
    await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([finalPath])
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
    const { error: storageError } = await ctx.admin.storage
      .from(KYB_DOCUMENTS_BUCKET)
      .remove([String(row.storage_path)])
    if (storageError) {
      console.warn("[grid/kyb/documents] storage delete:", storageError)
    }
  }
  const { error: deleteError } = await ctx.admin.from("business_kyb_documents").delete().eq("id", id)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Could not remove document" }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error
  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const id = String(body?.id ?? "").trim()
  if (!id) return NextResponse.json({ error: "Document id is required" }, { status: 400 })

  const { data: row } = await ctx.admin
    .from("business_kyb_documents")
    .select("id,category")
    .eq("id", id)
    .eq("application_id", application.id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  const documentType = String(body?.documentType ?? "").trim() || null
  const issuingCountry = String(body?.issuingCountry ?? "").trim() || null
  const issuingAuthority = String(body?.issuingAuthority ?? "").trim() || null
  const rawDocumentNumber = String(body?.documentNumber ?? "").trim()
  if (row.category === "identity" && (!documentType || !issuingCountry || !issuingAuthority || !rawDocumentNumber)) {
    return NextResponse.json(
      { error: "Add issuing country, issuing authority, and document number for this ID." },
      { status: 400 },
    )
  }
  const documentNumber = encryptKybPii(rawDocumentNumber)
  const side = String(body?.side ?? "").trim() || null

  const { data, error } = await ctx.admin
    .from("business_kyb_documents")
    .update({
      document_type: documentType,
      issuing_country: issuingCountry,
      issuing_authority: issuingAuthority,
      document_number_ciphertext: documentNumber.ciphertext,
      document_number_key_id: documentNumber.keyId,
      side,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not update document" }, { status: 400 })
  }

  const mapped = mapKybDocumentRow(data as Record<string, unknown>, true)
  return NextResponse.json({ document: { ...mapped, storagePath: undefined } })
}
