"use client"

import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import {
  KYB_DOCUMENT_MAX_BYTES,
  KYB_DOCUMENT_TOO_LARGE,
  KYB_DOCUMENTS_BUCKET,
} from "@/lib/grid/kyb-document-limits"
import { prepareKybDocumentFile } from "@/lib/grid/prepare-kyb-upload-file"
import type { KybDocumentPacket } from "@/lib/grid/kyb-packet-types"

type UploadFields = {
  category: string
  personId?: string
  documentType?: string
  issuingCountry?: string
  issuingAuthority?: string
  documentNumber?: string
  side?: string
}

function storageErrorMessage(status: number, fallback?: string): string {
  if (status === 413) return KYB_DOCUMENT_TOO_LARGE
  return fallback || "Could not store the file."
}

export async function uploadKybDocument(file: File, fields: UploadFields): Promise<KybDocumentPacket> {
  const nextFile = await prepareKybDocumentFile(file)
  if (nextFile.size > KYB_DOCUMENT_MAX_BYTES) throw new Error(KYB_DOCUMENT_TOO_LARGE)

  const prepareRes = await fetchWithSession("/api/grid/kyb/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phase: "prepare",
      fileName: nextFile.name,
      contentType: nextFile.type || "application/octet-stream",
      byteSize: nextFile.size,
    }),
  })
  const prepareJson = (await prepareRes.json().catch(() => ({}))) as {
    error?: string
    storagePath?: string
    token?: string
  }
  if (!prepareRes.ok || !prepareJson.storagePath || !prepareJson.token) {
    throw new Error(storageErrorMessage(prepareRes.status, prepareJson.error))
  }

  const supabase = createSupabaseBrowser()
  const { error: putError } = await supabase.storage
    .from(KYB_DOCUMENTS_BUCKET)
    .uploadToSignedUrl(prepareJson.storagePath, prepareJson.token, nextFile, {
      contentType: nextFile.type || "application/octet-stream",
    })
  if (putError) {
    throw new Error(putError.message || "Could not store the file.")
  }

  const completeRes = await fetchWithSession("/api/grid/kyb/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phase: "complete",
      storagePath: prepareJson.storagePath,
      fileName: nextFile.name,
      category: fields.category,
      personId: fields.personId,
      documentType: fields.documentType,
      issuingCountry: fields.issuingCountry,
      issuingAuthority: fields.issuingAuthority,
      documentNumber: fields.documentNumber,
      side: fields.side,
    }),
  })
  const completeJson = (await completeRes.json().catch(() => ({}))) as {
    error?: string
    document?: KybDocumentPacket
  }
  if (!completeRes.ok || !completeJson.document) {
    throw new Error(storageErrorMessage(completeRes.status, completeJson.error))
  }
  return completeJson.document
}

export async function patchKybDocumentMetadata(
  id: string,
  fields: Omit<UploadFields, "category" | "personId">,
): Promise<KybDocumentPacket> {
  const res = await fetchWithSession("/api/grid/kyb/documents", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      documentType: fields.documentType,
      issuingCountry: fields.issuingCountry,
      issuingAuthority: fields.issuingAuthority,
      documentNumber: fields.documentNumber,
      side: fields.side,
    }),
  })
  const json = (await res.json().catch(() => ({}))) as {
    error?: string
    document?: KybDocumentPacket
  }
  if (!res.ok || !json.document) {
    throw new Error(json.error || "Could not update document details.")
  }
  return json.document
}
