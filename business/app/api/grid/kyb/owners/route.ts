import { NextResponse } from "next/server"
import { requireKybContext } from "../_context"
import {
  ensureKybApplication,
  listKybPeople,
  mapKybPersonRow,
  personWritePayload,
} from "@/lib/grid/kyb-application-store"

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
  const { error } = await ctx.admin
    .from("business_kyb_people")
    .delete()
    .eq("id", id)
    .eq("application_id", application.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
