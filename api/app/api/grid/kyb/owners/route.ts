import { NextResponse } from "next/server"
import { requireKybContext } from "../_context"
import {
  ensureKybApplication,
  KYB_DOCUMENTS_BUCKET,
  listKybPeople,
  mapKybPersonRow,
  personWritePayload,
} from "@/lib/grid/kyb-application-store"
import { deleteGridBeneficialOwner, deleteGridKybDocument } from "@/lib/grid/kyb-grid-writes"

export async function GET(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error
  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const people = await listKybPeople(ctx.admin, application.id, true)
  return NextResponse.json({ people })
}

export async function POST(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error
  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const { data, error } = await ctx.admin
    .from("business_kyb_people")
    .insert(
      personWritePayload({
        applicationId: application.id,
        businessId: ctx.businessId,
        person: body,
      }),
    )
    .select("*")
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not save owner" }, { status: 400 })
  }
  return NextResponse.json({ person: mapKybPersonRow(data as Record<string, unknown>, true) })
}

export async function PATCH(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error
  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(body.id ?? "").trim()
  if (!id) return NextResponse.json({ error: "Owner id is required" }, { status: 400 })
  const { data, error } = await ctx.admin
    .from("business_kyb_people")
    .update(
      personWritePayload({
        applicationId: application.id,
        businessId: ctx.businessId,
        person: body,
      }),
    )
    .eq("id", id)
    .eq("application_id", application.id)
    .select("*")
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not update owner" }, { status: 400 })
  }
  return NextResponse.json({ person: mapKybPersonRow(data as Record<string, unknown>, true) })
}

export async function DELETE(request: Request) {
  const ctx = await requireKybContext(request)
  if ("error" in ctx) return ctx.error
  const application = await ensureKybApplication(ctx.admin, ctx.businessId)
  const url = new URL(request.url)
  const id = url.searchParams.get("id")?.trim() || ""
  if (!id) return NextResponse.json({ error: "Owner id is required" }, { status: 400 })

  const { data: person } = await ctx.admin
    .from("business_kyb_people")
    .select("id,grid_beneficial_owner_id")
    .eq("id", id)
    .eq("application_id", application.id)
    .maybeSingle()
  if (!person) return NextResponse.json({ error: "Owner not found" }, { status: 404 })

  const { data: docs } = await ctx.admin
    .from("business_kyb_documents")
    .select("id,storage_path,grid_document_id")
    .eq("application_id", application.id)
    .eq("person_id", id)

  for (const doc of docs ?? []) {
    if (doc.grid_document_id) {
      await deleteGridKybDocument(String(doc.grid_document_id)).catch((error) => {
        console.warn("[grid/kyb/owners] Grid document delete:", error)
      })
    }
    if (doc.storage_path) {
      await ctx.admin.storage.from(KYB_DOCUMENTS_BUCKET).remove([String(doc.storage_path)])
    }
  }
  await ctx.admin.from("business_kyb_documents").delete().eq("application_id", application.id).eq("person_id", id)

  const gridOwnerId = String(person.grid_beneficial_owner_id ?? "").trim()
  if (gridOwnerId) {
    await deleteGridBeneficialOwner(gridOwnerId).catch((error) => {
      console.warn("[grid/kyb/owners] Grid owner delete:", error)
    })
  }

  const { error } = await ctx.admin
    .from("business_kyb_people")
    .delete()
    .eq("id", id)
    .eq("application_id", application.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
