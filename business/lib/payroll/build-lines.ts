import type { SupabaseClient } from "@supabase/supabase-js"
import type { PayrollPerson } from "@/lib/payroll/types"
import { buildLineFromPerson } from "@/lib/payroll/run-utils"
import {
  maskPayrollMethod,
  payrollMethodDetails,
} from "@/lib/payroll/personal-payroll"

type PayrollMethodRow = {
  id: unknown
  person_id: unknown
  type: unknown
  label: unknown
  account_number?: unknown
  owner_type: unknown
  connection_id: unknown
}

const railByMethodType = {
  easetag: "easetag",
  bank: "bank",
  mobile_money: "mobile",
  stablecoin: "crypto",
} as const

export function applySelectedPayrollMethod(
  line: ReturnType<typeof buildLineFromPerson>,
  method: PayrollMethodRow,
) {
  const methodType = String(method.type) as keyof typeof railByMethodType
  const rail = railByMethodType[methodType]
  if (!rail) return line

  const details = payrollMethodDetails(method as unknown as Record<string, unknown>)
  const displayDetails = maskPayrollMethod(method as unknown as Record<string, unknown>)
  const snapshot = {
    id: String(method.id),
    type: methodType,
    label: String(method.label),
    details,
    payrollOwned: methodType === "easetag" || Boolean(method.account_number),
  }

  return {
    ...line,
    rail,
    recipient_snapshot: {
      ...line.recipient_snapshot,
      recipientId: null,
    },
    payment_method_id: String(method.id),
    payment_method_snapshot: snapshot,
    metadata: {
      ...line.metadata,
      maskedDestination: Object.values(displayDetails).filter(Boolean).join(" · "),
    },
  }
}

export async function buildPayrollLines(
  admin: SupabaseClient,
  runId: string,
  people: PayrollPerson[],
) {
  const personIds = people.map((person) => person.id)
  if (personIds.length === 0) return []
  const [{ data: connections }, { data: methods }] = await Promise.all([
    admin.from("payroll_connections")
      .select("person_id,preferred_method_id")
      .in("person_id", personIds),
    admin.from("payroll_payment_methods")
      .select("id,person_id,type,label,account_number,owner_type,connection_id,full_name,country_code,currency,bank_name,phone_number,email,mobile_provider,wallet_network,routing_number,sort_code,iban,swift_bic,transfer_type,checking_or_savings,address_line1,city,state,postal_code,metadata")
      .in("person_id", personIds)
      .eq("status", "active"),
  ])
  const preferredByPerson = new Map(
    (connections ?? []).map((connection) => [
      String(connection.person_id),
      String(connection.preferred_method_id ?? ""),
    ]),
  )
  const methodByPerson = new Map<string, PayrollMethodRow>()
  for (const method of methods ?? []) {
    const personId = String(method.person_id)
    const preferredId = preferredByPerson.get(personId)
    if (
      (preferredId && String(method.id) === preferredId) ||
      (!preferredId && method.owner_type === "business")
    ) {
      methodByPerson.set(personId, method as PayrollMethodRow)
    }
  }

  return people.map((person) => {
    const line = buildLineFromPerson(runId, person)
    const method = methodByPerson.get(person.id)
    if (!method) return line
    return applySelectedPayrollMethod(line, method)
  })
}
