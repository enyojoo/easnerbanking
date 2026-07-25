import type { SupabaseClient } from "@supabase/supabase-js"
import type { PayrollPerson } from "@/lib/payroll/types"
import { buildLineFromPerson } from "@/lib/payroll/run-utils"

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
  const methodByPerson = new Map<string, Record<string, unknown>>()
  for (const method of methods ?? []) {
    const personId = String(method.person_id)
    const preferredId = preferredByPerson.get(personId)
    if (
      (preferredId && String(method.id) === preferredId) ||
      (!preferredId && method.owner_type === "business")
    ) {
      methodByPerson.set(personId, method as Record<string, unknown>)
    }
  }

  return people.map((person) => {
    const line = buildLineFromPerson(runId, person)
    const method = methodByPerson.get(person.id)
    if (!method) return line
    const snapshot = {
      id: String(method.id),
      type: String(method.type),
      label: String(method.label),
      maskedDetails: (method.masked_details as Record<string, unknown>) ?? {},
      providerRecipientId: method.provider_recipient_id ?? null,
    }
    return {
      ...line,
      payment_method_id: method.id,
      payment_method_snapshot: snapshot,
      metadata: {
        ...line.metadata,
        maskedDestination: Object.values(snapshot.maskedDetails).filter(Boolean).join(" · "),
      },
    }
  })
}
