import type { SupabaseClient } from "@supabase/supabase-js"
import type { PayrollPerson } from "@/lib/payroll/types"
import { buildLineFromPerson } from "@/lib/payroll/run-utils"

type PayrollMethodRow = {
  id: unknown
  person_id: unknown
  type: unknown
  label: unknown
  masked_details: unknown
  provider_recipient_id: unknown
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

  const providerRecipientId =
    methodType === "easetag" || !method.provider_recipient_id
      ? null
      : String(method.provider_recipient_id)
  const maskedDetails =
    method.masked_details && typeof method.masked_details === "object"
      ? (method.masked_details as Record<string, unknown>)
      : {}
  const snapshot = {
    id: String(method.id),
    type: methodType,
    label: String(method.label),
    maskedDetails,
    providerRecipientId,
  }

  return {
    ...line,
    rail,
    recipient_snapshot: {
      ...line.recipient_snapshot,
      recipientId: providerRecipientId,
    },
    payment_method_id: String(method.id),
    payment_method_snapshot: snapshot,
    metadata: {
      ...line.metadata,
      maskedDestination: Object.values(maskedDetails).filter(Boolean).join(" · "),
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
      .select("id,person_id,type,label,masked_details,provider_recipient_id,owner_type,connection_id")
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
