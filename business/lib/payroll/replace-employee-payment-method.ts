import type { SupabaseClient } from "@supabase/supabase-js"

export interface EmployeePayrollMethodReplacement {
  connectionId: string
  personId: string
  businessId: string
  selectAsPreferred: boolean
  type: "bank" | "mobile_money" | "stablecoin"
  label: string
  maskedDetails: Record<string, string>
  encryptedDetails: string
  providerRecipientId: string | null
}

export interface EmployeePayrollMethodRow {
  id: string
  type: "bank" | "mobile_money" | "stablecoin"
  label: string
  masked_details: Record<string, string>
  owner_type: "employee"
  status: "active"
}

function isMissingReplacementFunction(error: { code?: string; message?: string }): boolean {
  const message = String(error.message || "").toLowerCase()
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    message.includes("replace_payroll_employee_external_method") &&
      (message.includes("schema cache") || message.includes("does not exist"))
  )
}

async function restorePreviousMethod(
  admin: SupabaseClient,
  methodId: string | null,
): Promise<void> {
  if (!methodId) return
  await admin
    .from("payroll_payment_methods")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", methodId)
}

/**
 * Replaces the single employee-owned external method while retaining the old
 * row for submitted payroll snapshots. The RPC is transactional. The fallback
 * supports deployments before the migration reaches the database.
 */
export async function replaceEmployeePayrollMethod(
  admin: SupabaseClient,
  input: EmployeePayrollMethodReplacement,
): Promise<EmployeePayrollMethodRow> {
  const shouldSelectNew = input.selectAsPreferred
  const rpc = await admin.rpc("replace_payroll_employee_external_method", {
    p_connection_id: input.connectionId,
    p_type: input.type,
    p_label: input.label,
    p_masked_details: input.maskedDetails,
    p_encrypted_details: input.encryptedDetails,
    p_provider_recipient_id: input.providerRecipientId,
    p_preferred: shouldSelectNew,
  })

  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data
    if (!row?.id) throw new Error("The replacement receiving method was not returned.")
    return row as EmployeePayrollMethodRow
  }
  if (!isMissingReplacementFunction(rpc.error)) throw new Error(rpc.error.message)

  const { data: previous, error: previousError } = await admin
    .from("payroll_payment_methods")
    .select("id")
    .eq("connection_id", input.connectionId)
    .eq("owner_type", "employee")
    .neq("type", "easetag")
    .eq("status", "active")
    .maybeSingle()
  if (previousError) throw new Error(previousError.message)

  const previousMethodId = previous?.id ? String(previous.id) : null
  if (previousMethodId) {
    const retired = await admin
      .from("payroll_payment_methods")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", previousMethodId)
      .eq("status", "active")
    if (retired.error) throw new Error(retired.error.message)
  }

  const inserted = await admin
    .from("payroll_payment_methods")
    .insert({
      connection_id: input.connectionId,
      person_id: input.personId,
      business_id: input.businessId,
      owner_type: "employee",
      type: input.type,
      label: input.label,
      masked_details: input.maskedDetails,
      encrypted_details: input.encryptedDetails,
      provider_recipient_id: input.providerRecipientId,
    })
    .select("id,type,label,masked_details,owner_type,status")
    .single()
  if (inserted.error) {
    await restorePreviousMethod(admin, previousMethodId)
    throw new Error(inserted.error.message)
  }

  if (shouldSelectNew) {
    const preferred = await admin
      .from("payroll_connections")
      .update({
        preferred_method_id: inserted.data.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.connectionId)
    if (preferred.error) {
      await admin.from("payroll_payment_methods").delete().eq("id", inserted.data.id)
      await restorePreviousMethod(admin, previousMethodId)
      throw new Error(preferred.error.message)
    }
  }

  return inserted.data as EmployeePayrollMethodRow
}
