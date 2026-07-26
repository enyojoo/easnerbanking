import type { SupabaseClient } from "@supabase/supabase-js"
import { amountToCents } from "@/lib/payroll/map-payroll"
import type { PayrollPerson, PayrollRun } from "@/lib/payroll/types"
import { readBusinessAvailableBalance, computeShortfall } from "@/lib/payroll/helpers"

export async function recalculateRunTotals(
  admin: SupabaseClient,
  runId: string,
  businessId: string,
): Promise<{ totalSource: number; shortfall: number }> {
  const { data: runRow } = await admin
    .from("payroll_runs")
    .select("source_currency")
    .eq("id", runId)
    .eq("business_id", businessId)
    .maybeSingle()

  const sourceCurrency = String(runRow?.source_currency || "USD").toUpperCase()

  const { data: lines } = await admin
    .from("payroll_lines")
    .select("source_amount_cents, status")
    .eq("run_id", runId)

  let totalSource = 0
  for (const line of lines ?? []) {
    if (line.status === "skipped") continue
    const cents =
      typeof line.source_amount_cents === "string"
        ? Number(line.source_amount_cents)
        : Number(line.source_amount_cents ?? 0)
    totalSource += cents / 100
  }

  const available = await readBusinessAvailableBalance(admin, businessId, sourceCurrency)
  const shortfall = computeShortfall(totalSource, available)

  await admin
    .from("payroll_runs")
    .update({
      total_source_cents: amountToCents(totalSource),
      shortfall_cents: amountToCents(shortfall),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)

  return { totalSource, shortfall }
}

export function buildLineFromPerson(
  runId: string,
  person: PayrollPerson,
  overrides?: { amount?: number; hours?: number; sourceAmount?: number },
) {
  let amount = person.defaultAmount
  if (person.payBasis === "hourly" && overrides?.hours != null && person.hourlyRate != null) {
    amount = Math.round(person.hourlyRate * overrides.hours * 100) / 100
  } else if (overrides?.amount != null) {
    amount = overrides.amount
  }

  const sourceAmount = overrides?.sourceAmount ?? amount
  const preferredMethod = (
    person.metadata?.preferredPaymentMethod as Record<string, unknown> | undefined
  ) ?? null

  return {
    run_id: runId,
    person_id: person.id,
    recipient_snapshot: {
      fullName: person.fullName,
      email: person.email,
      type: person.type,
      easetag: person.easetag,
      recipientId: person.recipientId,
      country: person.country,
    },
    amount_cents: amountToCents(amount),
    pay_currency: person.payCurrency,
    source_amount_cents: amountToCents(sourceAmount),
    rail: person.rail,
    payment_method_id: preferredMethod?.id ? String(preferredMethod.id) : null,
    payment_method_snapshot: preferredMethod ?? {},
    status: "pending",
    metadata: {
      ...(preferredMethod?.maskedDetails
        ? { maskedDestination: Object.values(
            preferredMethod.maskedDetails as Record<string, unknown>,
          ).filter(Boolean).join(" · ") }
        : {}),
    },
    updated_at: new Date().toISOString(),
  }
}

export function summarizeRailMix(lines: { rail: string }[]): Record<string, number> {
  const mix: Record<string, number> = {}
  for (const line of lines) {
    const key = line.rail || "bank"
    mix[key] = (mix[key] ?? 0) + 1
  }
  return mix
}

export type RunWithLines = PayrollRun & { lines: NonNullable<PayrollRun["lines"]> }
