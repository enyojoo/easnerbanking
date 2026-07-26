/**
 * Copies legacy encrypted Payroll destinations into normalized Payroll-owned columns.
 *
 * Dry run:
 *   node --env-file=.env.local --import tsx scripts/backfill-payroll-payment-methods.ts
 * Apply:
 *   node --env-file=.env.local --import tsx scripts/backfill-payroll-payment-methods.ts --execute
 */
import { createClient } from "@supabase/supabase-js"
import { decryptLegacyPayrollMethodDetails } from "./lib/decrypt-legacy-payroll-method"
import { payrollMethodDbPayload } from "../lib/send-destination"

async function main() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!url || !key) throw new Error("Supabase admin environment is required.")
  const execute = process.argv.includes("--execute")
  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await admin
    .from("payroll_payment_methods")
    .select("id,person_id,type,encrypted_details,account_number")
    .neq("type", "easetag")
    .not("encrypted_details", "is", null)
  if (error) throw new Error(error.message)

  const personIds = [...new Set((data ?? []).map((row) => String(row.person_id || "")).filter(Boolean))]
  const { data: people, error: peopleError } = personIds.length
    ? await admin
        .from("payroll_people")
        .select("id,full_name,email,country")
        .in("id", personIds)
    : { data: [], error: null }
  if (peopleError) throw new Error(peopleError.message)
  const peopleById = new Map(
    (people ?? []).map((person) => [String(person.id), person]),
  )

  let eligible = 0
  let updated = 0
  const failures: Array<{ id: string; error: string }> = []
  for (const row of data ?? []) {
    if (String(row.account_number || "").trim()) continue
    eligible++
    try {
      const decrypted = decryptLegacyPayrollMethodDetails(String(row.encrypted_details))
      const person = peopleById.get(String(row.person_id || ""))
      const details = {
        ...decrypted,
        fullName:
          String(decrypted.fullName || decrypted.full_name || person?.full_name || "").trim(),
        email:
          String(decrypted.email || person?.email || "").trim(),
        countryCode:
          String(
            decrypted.countryCode ||
              decrypted.country_code ||
              person?.country ||
              "",
          ).trim(),
      }
      const payload = payrollMethodDbPayload(
        String(row.type) as "bank" | "mobile_money" | "stablecoin",
        details,
      )
      const methodType = String(row.type)
      const missing = [
        !String(payload.full_name || "").trim() ? "full_name" : null,
        !String(payload.currency || "").trim() ? "currency" : null,
        !String(payload.account_number || "").trim() ? "destination" : null,
        methodType === "bank" || methodType === "mobile_money"
          ? !String(payload.country_code || "").trim()
            ? "country_code"
            : null
          : null,
        methodType === "bank" && !String(payload.bank_name || "").trim()
          ? "bank_name"
          : null,
        methodType === "mobile_money" &&
        !String(payload.mobile_provider || "").trim()
          ? "mobile_provider"
          : null,
        methodType === "mobile_money" && !String(payload.phone_number || "").trim()
          ? "phone_number"
          : null,
        methodType === "stablecoin" &&
        !String(payload.wallet_network || "").trim()
          ? "wallet_network"
          : null,
      ].filter(Boolean)
      if (missing.length > 0) {
        throw new Error(`Required normalized fields are missing: ${missing.join(", ")}.`)
      }
      if (execute) {
        const result = await admin
          .from("payroll_payment_methods")
          .update(payload)
          .eq("id", row.id)
        if (result.error) throw new Error(result.error.message)
      }
      updated++
    } catch (cause) {
      failures.push({
        id: String(row.id),
        error: cause instanceof Error ? cause.message : "Unknown backfill error",
      })
    }
  }

  const { data: incomplete, error: incompleteError } = await admin
    .from("payroll_payment_methods")
    .select(
      "id,type,full_name,country_code,currency,account_number,bank_name,phone_number,mobile_provider,wallet_network",
    )
    .eq("status", "active")
    .neq("type", "easetag")
  if (incompleteError) throw new Error(incompleteError.message)
  const incompleteActiveMethods = (incomplete ?? []).filter((method) => {
    const type = String(method.type || "")
    const commonMissing =
      !String(method.full_name || "").trim() ||
      !String(method.currency || "").trim() ||
      !String(method.account_number || "").trim()
    if (commonMissing) return true
    if (type === "bank") {
      return (
        !String(method.country_code || "").trim() ||
        !String(method.bank_name || "").trim()
      )
    }
    if (type === "mobile_money") {
      return (
        !String(method.country_code || "").trim() ||
        !String(method.phone_number || "").trim() ||
        !String(method.mobile_provider || "").trim()
      )
    }
    if (type === "stablecoin") {
      return !String(method.wallet_network || "").trim()
    }
    return true
  })

  const { count: legacyColumnRows, error: legacyError } = await admin
    .from("payroll_payment_methods")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .neq("type", "easetag")
    .or("provider_recipient_id.not.is.null,encrypted_details.not.is.null")
  if (legacyError) throw new Error(legacyError.message)

  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    eligible,
    updated,
    failures,
    incompleteActiveMethods,
    activeMethodsStillCarryingLegacyColumns: legacyColumnRows ?? 0,
    safeToRemoveLegacyColumns:
      failures.length === 0 && incompleteActiveMethods.length === 0,
  }, null, 2))
  if (failures.length || incompleteActiveMethods.length) process.exitCode = 1
}

void main()
