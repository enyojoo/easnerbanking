import { NextResponse } from "next/server"
import { emptyGridKybCompanyDraft } from "@easner/shared"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  listKybDocuments,
  listKybPeople,
  mapKybPersonRow,
  type KybApplicationRow,
} from "@/lib/grid/kyb-application-store"

function asCompany(value: unknown) {
  const base = emptyGridKybCompanyDraft()
  if (!value || typeof value !== "object") return base
  return { ...base, ...(value as Record<string, unknown>) }
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
  const [{ data: application }, { data: biz }] = await Promise.all([
    admin.from("business_kyb_applications").select("*").eq("business_id", businessId).maybeSingle(),
    admin
      .from("businesses")
      .select("grid_customer_id,bridge_customer_id,bridge_kyc_status,verification_status")
      .eq("id", businessId)
      .maybeSingle(),
  ])

  if (!application) {
    return NextResponse.json({
      applicationId: null,
      status: "not_started",
      company: emptyGridKybCompanyDraft(),
      people: [],
      documents: [],
      errors: [],
      gridCustomerId: biz?.grid_customer_id ? String(biz.grid_customer_id) : null,
      submittedAt: null,
      bridgeCustomerId: biz?.bridge_customer_id ? String(biz.bridge_customer_id) : null,
      bridgeKybStatus: biz?.bridge_kyc_status ? String(biz.bridge_kyc_status) : null,
    })
  }

  const row: KybApplicationRow = {
    id: String(application.id),
    business_id: String(application.business_id),
    status: String(application.status ?? "draft") as KybApplicationRow["status"],
    company: asCompany(application.company),
    grid_customer_id: application.grid_customer_id ? String(application.grid_customer_id) : null,
    grid_verification_id: application.grid_verification_id
      ? String(application.grid_verification_id)
      : null,
    last_errors: Array.isArray(application.last_errors) ? application.last_errors : [],
    submitted_at: application.submitted_at ? String(application.submitted_at) : null,
    last_synced_at: application.last_synced_at ? String(application.last_synced_at) : null,
    updated_at: application.updated_at ? String(application.updated_at) : null,
  }

  const [people, documents] = await Promise.all([
    listKybPeople(admin, row.id, true),
    listKybDocuments(admin, row.id, true),
  ])

  return NextResponse.json({
    applicationId: row.id,
    status: row.status,
    company: row.company,
    people: people.map((person) => {
      const mapped = person as ReturnType<typeof mapKybPersonRow>
      return mapped
    }),
    documents: documents.map((doc) => ({
      id: doc.id,
      personId: doc.personId,
      category: doc.category,
      documentType: doc.documentType,
      issuingCountry: doc.issuingCountry,
      issuingAuthority: doc.issuingAuthority,
      documentNumber: doc.documentNumber,
      fileName: doc.fileName,
      contentType: doc.contentType,
      byteSize: doc.byteSize,
      side: doc.side,
    })),
    errors: row.last_errors,
    gridCustomerId: row.grid_customer_id || (biz?.grid_customer_id ? String(biz.grid_customer_id) : null),
    submittedAt: row.submitted_at,
    bridgeCustomerId: biz?.bridge_customer_id ? String(biz.bridge_customer_id) : null,
    bridgeKybStatus: biz?.bridge_kyc_status ? String(biz.bridge_kyc_status) : null,
  })
}
