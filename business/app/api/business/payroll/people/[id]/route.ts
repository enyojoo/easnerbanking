import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapRowToPayrollPerson, payrollPersonToDbPayload, type PayrollPersonRow } from "@/lib/payroll/map-payroll"
import type { PayrollPersonInput } from "@/lib/payroll/types"
import { payrollMethodDetails } from "@/lib/payroll/personal-payroll"
import { buildPayrollLines } from "@/lib/payroll/build-lines"
import { resolvePayrollSourceDefaults } from "@/lib/payroll/source-account"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { normalizePayrollResidenceCountry } from "@/lib/payroll/residence-country"
import { normalizePayrollReceivingMethodInput } from "@/lib/payroll/receiving-method-input"
import { payrollMethodDbPayload } from "@/lib/send-destination"
import { formatPayrollZonedDateTime } from "@/lib/payroll/schedule-preview"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payroll_people")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const mappedPerson = mapRowToPayrollPerson(data as PayrollPersonRow)
  const { data: easetagProfile } =
    mappedPerson.easetag && !mappedPerson.email
      ? await admin.from("users").select("email").eq("easetag", normalizeEasetag(mappedPerson.easetag)).maybeSingle()
      : { data: null }
  const person = {
    ...mappedPerson,
    email:
      mappedPerson.email ||
      String(easetagProfile?.email || "")
        .trim()
        .toLowerCase() ||
      null,
  }

  const [{ data: connection }, { data: lines }] = await Promise.all([
    admin
      .from("payroll_connections")
      .select("id,status,approved_at,declined_at,revoked_at,preferred_method_id")
      .eq("person_id", id)
      .eq("business_id", ctx.businessId)
      .maybeSingle(),
    admin
      .from("payroll_lines")
      .select(
        "id,run_id,amount_cents,pay_currency,status,settled_at,payroll_documents(id,type,status,filename,generated_at)",
      )
      .eq("person_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ])
  const methodQuery = admin
    .from("payroll_payment_methods")
    .select("id,type,label,status,full_name,country_code,currency,account_number,bank_name,phone_number,email,mobile_provider,wallet_network,routing_number,sort_code,iban,swift_bic,transfer_type,checking_or_savings,address_line1,city,state,postal_code,metadata")
    .eq("person_id", id)
    .eq("business_id", ctx.businessId)
    .eq("status", "active")
  const { data: methodRows, error: methodsError } = connection
    ? connection.status === "approved"
      ? await methodQuery.eq("connection_id", connection.id)
      : { data: [], error: null }
    : await methodQuery.eq("owner_type", "business").is("connection_id", null)
  if (methodsError) {
    return NextResponse.json({ error: methodsError.message }, { status: 500 })
  }
  const methods = ((methodRows ?? []) as Array<Record<string, unknown>>).filter((method) => method.status === "active")
  const runIds = [...new Set((lines ?? []).map((line) => String(line.run_id)).filter(Boolean))]
  const { data: historyRuns } = runIds.length
    ? await admin
        .from("payroll_runs")
        .select("id,approval_snapshot")
        .in("id", runIds)
    : { data: [] }
  const historyRunsById = new Map(
    (historyRuns ?? []).map((run) => [String(run.id), run]),
  )
  const selectedMethod =
    methods.find((method) => String(method.id) === String(connection?.preferred_method_id || "")) ??
    methods[0] ??
    null
  const preferredMethod = selectedMethod
    ? {
        id: String(selectedMethod.id),
        type: String(selectedMethod.type),
        label: String(selectedMethod.label),
        details: payrollMethodDetails(selectedMethod),
        preferred: true,
        ownerType: connection ? "employee" : "business",
        status: "active",
      }
    : null
  return NextResponse.json({
    person: {
      ...person,
      receivingMethodSummary: preferredMethod ?? person.receivingMethodSummary,
    },
    connection: connection
      ? {
          id: connection.id,
          status: connection.status,
          approvedAt: connection.approved_at,
          declinedAt: connection.declined_at,
          revokedAt: connection.revoked_at,
          preferredMethod,
        }
      : null,
    paymentHistory: (lines ?? []).map((line) => ({
      ...(() => {
        const historyRun = historyRunsById.get(String(line.run_id))
        const executionSchedule = (
          (historyRun?.approval_snapshot as Record<string, unknown> | null)?.executionSchedule as
            | { timezone?: string }
            | undefined
        )
        const timezone = String(executionSchedule?.timezone || "UTC")
        return {
          timezone,
          settledAtDisplay: line.settled_at
            ? formatPayrollZonedDateTime(String(line.settled_at), timezone)
            : null,
        }
      })(),
      id: line.id,
      runId: line.run_id,
      amount: Number(line.amount_cents ?? 0) / 100,
      currency: line.pay_currency,
      status: line.status,
      settledAt: line.settled_at,
      documents: line.payroll_documents ?? [],
    })),
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  let body: Partial<PayrollPersonInput>
  try {
    body = (await request.json()) as Partial<PayrollPersonInput>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: existing } = await admin
    .from("payroll_people")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

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
  const current = mapRowToPayrollPerson(existing as PayrollPersonRow)
  const isEasetagPerson = Boolean(current.easetag || current.connectionId || current.connectionStatus !== "manual")
  let nextRail = body.rail ?? current.rail
  const nextEmail = String(body.email !== undefined ? body.email || "" : current.email || "")
    .trim()
    .toLowerCase()
  const nextCountry = normalizePayrollResidenceCountry(body.country !== undefined ? body.country : current.country)
  let manualDestination: {
    label: string
    details: Record<string, string>
  } | null = null

  if (!isEasetagPerson) {
    if (!EMAIL_PATTERN.test(nextEmail)) {
      return NextResponse.json(
        { error: "A valid email is required for payroll confirmations and pay stubs." },
        { status: 400 },
      )
    }
    if (!nextCountry) {
      return NextResponse.json({ error: "Country of residence is required." }, { status: 400 })
    }
    if (body.receivingMethod) {
      try {
        const normalized = normalizePayrollReceivingMethodInput(
          {
            ...body.receivingMethod,
            fullName: body.fullName ?? current.fullName,
          },
          body.fullName ?? current.fullName,
        )
        nextRail = normalized.rail
        manualDestination = {
          label: normalized.label,
          details: normalized.details,
        }
      } catch (cause) {
        return NextResponse.json(
          { error: cause instanceof Error ? cause.message : "The receiving method is invalid." },
          { status: 400 },
        )
      }
    } else if (body.recipientId) {
      return NextResponse.json(
        { error: "Update Payroll payment details directly in Payroll." },
        { status: 400 },
      )
    }
  }
  const payload = payrollPersonToDbPayload({
    businessId: ctx.businessId,
    person: {
      type: body.type ?? current.type,
      fullName: isEasetagPerson ? current.fullName : (body.fullName ?? current.fullName),
      email: isEasetagPerson ? current.email : nextEmail,
      country: isEasetagPerson ? current.country : nextCountry,
      defaultAmount: body.defaultAmount ?? current.defaultAmount,
      payCurrency: businessCurrency,
      payBasis: body.payBasis ?? current.payBasis,
      hourlyRate: body.hourlyRate !== undefined ? body.hourlyRate : current.hourlyRate,
      recipientId: isEasetagPerson ? current.recipientId : null,
      easetag: isEasetagPerson ? current.easetag : body.easetag !== undefined ? body.easetag : current.easetag,
      rail: isEasetagPerson ? current.rail : nextRail,
      status: (body as { status?: typeof current.status }).status ?? current.status,
      internalReference: body.internalReference !== undefined ? body.internalReference : current.internalReference,
      metadata: current.metadata,
    },
  })

  const { data, error } = await admin
    .from("payroll_people")
    .update(payload)
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let person = mapRowToPayrollPerson(data as PayrollPersonRow)
  if (manualDestination) {
    const methodType = nextRail === "mobile" ? "mobile_money" : nextRail === "crypto" ? "stablecoin" : "bank"
    const label = manualDestination.label
    const destinationPayload = payrollMethodDbPayload(methodType, manualDestination.details)
    const methodResult = await admin.rpc("replace_payroll_business_payment_method", {
      p_person_id: id,
      p_business_id: ctx.businessId,
      p_type: methodType,
      p_label: label,
      p_destination: destinationPayload,
    })
    if (methodResult.error) {
      return NextResponse.json({ error: methodResult.error.message }, { status: 500 })
    }
    const refreshed = await admin
      .from("payroll_people")
      .select("*")
      .eq("id", id)
      .eq("business_id", ctx.businessId)
      .single()
    if (refreshed.error) {
      return NextResponse.json({ error: refreshed.error.message }, { status: 500 })
    }
    person = mapRowToPayrollPerson(refreshed.data as PayrollPersonRow)
  }
  const [draftLine] = await buildPayrollLines(admin, "draft-sync", [person])
  const { data: drafts } = await admin
    .from("payroll_runs")
    .select("id")
    .eq("business_id", ctx.businessId)
    .eq("status", "draft")
  const draftIds = (drafts ?? []).map((run) => String(run.id))
  if (draftLine && draftIds.length > 0) {
    await admin
      .from("payroll_lines")
      .update({
        recipient_snapshot: draftLine.recipient_snapshot,
        amount_cents: draftLine.amount_cents,
        pay_currency: draftLine.pay_currency,
        rail: draftLine.rail,
        payment_method_id: draftLine.payment_method_id,
        payment_method_snapshot: draftLine.payment_method_snapshot,
        metadata: draftLine.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("person_id", id)
      .in("run_id", draftIds)
  }
  if (body.scheduleIds !== undefined) {
    const unique = [...new Set(body.scheduleIds)]
    const { data: validSchedules } = unique.length
      ? await admin.from("payroll_schedules").select("id").eq("business_id", ctx.businessId).in("id", unique)
      : { data: [] }
    await admin.from("payroll_schedule_people").delete().eq("person_id", id).eq("business_id", ctx.businessId)
    if (validSchedules?.length) {
      await admin.from("payroll_schedule_people").insert(
        validSchedules.map((schedule) => ({
          schedule_id: schedule.id,
          person_id: id,
          business_id: ctx.businessId,
        })),
      )
    }
  }
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    person_id: id,
    actor_user_id: ctx.userId,
    event_type: "person.updated",
    data: { affectedDraftRuns: draftIds },
  })
  return NextResponse.json({ person })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()

  const { data: person } = await admin
    .from("payroll_people")
    .select("id")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { count } = await admin.from("payroll_lines").select("id", { count: "exact", head: true }).eq("person_id", id)
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "This person is part of payroll history and cannot be deleted. Put them on hold instead." },
      { status: 409 },
    )
  }

  const { error } = await admin.from("payroll_people").delete().eq("id", id).eq("business_id", ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
