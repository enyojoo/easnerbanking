import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollPerson,
  payrollPersonToDbPayload,
  type PayrollPersonRow,
} from "@/lib/payroll/map-payroll"
import type { CreatePayrollPersonCommand, PayrollPersonInput } from "@/lib/payroll/types"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { resolvePayrollSourceDefaults } from "@/lib/payroll/source-account"

export async function GET(request: Request) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payroll_people")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("full_name", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const personIds = (data ?? []).map((row) => String(row.id))
  const [{ data: memberships }, { data: payments }] = personIds.length
    ? await Promise.all([
        admin.from("payroll_schedule_people").select("person_id,schedule_id").in("person_id", personIds),
        admin.from("payroll_lines").select("person_id,settled_at,status").in("person_id", personIds)
          .eq("status", "paid").order("settled_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }]
  const scheduleIds = [...new Set((memberships ?? []).map((membership) => String(membership.schedule_id)))]
  const { data: scheduleRows } = scheduleIds.length
    ? await admin.from("payroll_schedules").select("id,name").eq("business_id", ctx.businessId).in("id", scheduleIds)
    : { data: [] }
  const scheduleById = new Map((scheduleRows ?? []).map((schedule) => [String(schedule.id), String(schedule.name)]))
  const scheduleIdsByPerson = new Map<string, string[]>()
  for (const membership of memberships ?? []) {
    const id = String(membership.person_id)
    scheduleIdsByPerson.set(id, [...(scheduleIdsByPerson.get(id) ?? []), String(membership.schedule_id)])
  }
  const lastPaidByPerson = new Map<string, string>()
  for (const payment of payments ?? []) {
    const id = String(payment.person_id)
    if (!lastPaidByPerson.has(id) && payment.settled_at) lastPaidByPerson.set(id, String(payment.settled_at))
  }
  const people = (data ?? []).map((row) => {
    const person = mapRowToPayrollPerson(row as PayrollPersonRow)
    return {
      ...person,
      lastPaidAt: lastPaidByPerson.get(person.id) ?? person.lastPaidAt ?? null,
      scheduleSummaries: (scheduleIdsByPerson.get(person.id) ?? []).map((id) => ({
        id,
        name: scheduleById.get(id) ?? "Payroll schedule",
      })),
    }
  })
  return NextResponse.json({ people })
}

export async function POST(request: Request) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  let body: PayrollPersonInput | CreatePayrollPersonCommand
  try {
    body = (await request.json()) as PayrollPersonInput
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  let payrollDefaults
  try {
    payrollDefaults = await resolvePayrollSourceDefaults(admin, ctx.businessId)
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not load Payroll account settings." },
      { status: 500 },
    )
  }
  const businessCurrency = payrollDefaults.currency

  if ("mode" in body && body.mode === "easetag") {
    const command = body as unknown as Extract<CreatePayrollPersonCommand, { mode: "easetag" }>
    const easetag = normalizeEasetag(command.easetag)
    const { data: profile } = await admin
      .from("users")
      .select("id,easetag,full_name,email,avatar_url,noah_kyc_status")
      .eq("easetag", easetag)
      .maybeSingle()
    if (!profile) return NextResponse.json({ error: "EASETAG not found." }, { status: 404 })
    if (profile.id === ctx.userId) {
      return NextResponse.json({ error: "You cannot add yourself to Payroll." }, { status: 400 })
    }
    if (profile.noah_kyc_status !== "approved") {
      return NextResponse.json({ error: "This personal EASETAG is not verified." }, { status: 400 })
    }
    const profileEmail = String(profile.email || "").trim().toLowerCase()
    if (command.sendInvitation && !profileEmail) {
      return NextResponse.json(
        { error: "This EASETAG does not have an email available for a payroll request." },
        { status: 400 },
      )
    }
    const commandPayload = payrollPersonToDbPayload({
      businessId: ctx.businessId,
      person: {
        type: command.type,
        fullName: String(profile.full_name || easetag),
        email: profileEmail || null,
        defaultAmount: command.defaultAmount,
        payCurrency: businessCurrency,
        easetag,
        rail: "easetag",
        status: "active",
        internalReference: command.internalReference ?? null,
        metadata: {
          avatarUrl: profile.avatar_url ?? null,
          scheduleIds: command.scheduleIds ?? [],
          sendInvitationRequested: command.sendInvitation,
        },
      },
    })
    const created = await admin.from("payroll_people").insert({
      ...commandPayload,
      readiness_status: "pending_consent",
      connection_status: "pending",
    }).select("*").single()
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 })
    if (command.scheduleIds?.length) {
      const { data: validSchedules } = await admin.from("payroll_schedules").select("id")
        .eq("business_id", ctx.businessId).in("id", [...new Set(command.scheduleIds)])
      if (validSchedules?.length) {
        await admin.from("payroll_schedule_people").insert(validSchedules.map((schedule) => ({
          schedule_id: schedule.id,
          person_id: created.data.id,
          business_id: ctx.businessId,
        })))
      }
    }
    await admin.from("payroll_run_events").insert({
      business_id: ctx.businessId,
      person_id: created.data.id,
      actor_user_id: ctx.userId,
      event_type: "person.created",
      data: { mode: "easetag", invitationRequested: command.sendInvitation },
    })
    return NextResponse.json({
      person: mapRowToPayrollPerson(created.data as PayrollPersonRow),
      sendInvitation: command.sendInvitation,
    }, { status: 201 })
  }

  if ("mode" in body) {
    return NextResponse.json(
      { error: "Manual setup must include a validated receiving method." },
      { status: 400 },
    )
  }

  if (!body.fullName?.trim()) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 })
  }

  const payload = payrollPersonToDbPayload({
    businessId: ctx.businessId,
    person: {
      type: body.type,
      fullName: body.fullName,
      email: body.email ?? null,
      country: body.country ?? null,
      defaultAmount: body.defaultAmount ?? 0,
      payCurrency: businessCurrency,
      payBasis: body.payBasis ?? "fixed",
      hourlyRate: body.hourlyRate ?? null,
      recipientId: body.recipientId ?? null,
      easetag: body.easetag ?? null,
      rail: body.rail,
      status: body.status ?? "active",
      internalReference: body.internalReference ?? null,
      metadata: { scheduleIds: body.scheduleIds ?? [] },
    },
  })

  const { data, error } = await admin.from("payroll_people").insert({
    ...payload,
    readiness_status: body.recipientId ? "ready" : "missing_payment_method",
    connection_status: "manual",
  }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.recipientId) {
    const { data: destination } = await admin.from("recipients")
      .select("id,user_id,bank_name,account_number,mobile_provider,wallet_network")
      .eq("id", body.recipientId).eq("user_id", ctx.userId).maybeSingle()
    if (!destination) {
      await admin.from("payroll_people").delete().eq("id", data.id).eq("business_id", ctx.businessId)
      return NextResponse.json({ error: "The selected payment details are not available." }, { status: 400 })
    }
    const methodType = body.rail === "mobile" ? "mobile_money" : body.rail === "crypto" ? "stablecoin" : "bank"
    const account = String(destination.account_number || "")
    const method = await admin.from("payroll_payment_methods").insert({
      person_id: data.id,
      business_id: ctx.businessId,
      owner_type: "business",
      type: methodType,
      label: methodType === "mobile_money"
        ? String(destination.mobile_provider || "Mobile money")
        : methodType === "stablecoin"
          ? `${String(destination.wallet_network || "Stablecoin")} wallet`
          : String(destination.bank_name || "Bank account"),
      masked_details: { ending: account ? `••••${account.slice(-4)}` : "Protected" },
      provider_recipient_id: destination.id,
    }).select("id,type,label,masked_details").single()
    if (method.error) {
      await admin.from("payroll_people").delete().eq("id", data.id).eq("business_id", ctx.businessId)
      return NextResponse.json({ error: method.error.message }, { status: 500 })
    }
    const mapped = mapRowToPayrollPerson(data as PayrollPersonRow)
    const metadata = {
      ...mapped.metadata,
      preferredPaymentMethod: {
        id: method.data.id,
        type: method.data.type,
        label: method.data.label,
        maskedDetails: method.data.masked_details,
        preferred: true,
        ownerType: "business",
        status: "active",
      },
    }
    await admin.from("payroll_people").update({ metadata, updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("business_id", ctx.businessId)
    data.metadata = metadata
  }
  if (body.scheduleIds?.length) {
    const { data: validSchedules } = await admin.from("payroll_schedules").select("id")
      .eq("business_id", ctx.businessId).in("id", [...new Set(body.scheduleIds)])
    if (validSchedules?.length) {
      await admin.from("payroll_schedule_people").insert(validSchedules.map((schedule) => ({
        schedule_id: schedule.id,
        person_id: data.id,
        business_id: ctx.businessId,
      })))
    }
  }

  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    person_id: data.id,
    actor_user_id: ctx.userId,
    event_type: "person.created",
    data: { mode: "manual" },
  })
  return NextResponse.json({ person: mapRowToPayrollPerson(data as PayrollPersonRow) }, { status: 201 })
}
