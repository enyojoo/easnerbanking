import type { SupabaseClient } from "@supabase/supabase-js"

export type ProcessingFeeOverrideSubjectType = "business" | "user"

export type ProcessingFeeOverrideRow = {
  id?: string
  subject_type: ProcessingFeeOverrideSubjectType
  subject_id: string
  pay_in_bps: number | null
  pay_out_bps: number | null
  cross_border_bps: number | null
  reason: string | null
  updated_at?: string
}

export type ProcessingFeeOverrideUpsertInput = {
  subject_type: ProcessingFeeOverrideSubjectType
  subject_id: string
  pay_in_bps?: number | null
  pay_out_bps?: number | null
  cross_border_bps?: number | null
  reason?: string | null
}

const SUBJECT_TYPES = new Set<ProcessingFeeOverrideSubjectType>(["business", "user"])

export class ProcessingFeeOverridesSetupRequiredError extends Error {
  constructor(message = "processing_fee_overrides table is not migrated") {
    super(message)
    this.name = "ProcessingFeeOverridesSetupRequiredError"
  }
}

function isMissingProcessingFeeOverridesTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = String((error as { code?: string }).code ?? "")
  const message = String((error as { message?: string }).message ?? "").toLowerCase()
  return (
    code === "42P01" ||
    message.includes("processing_fee_overrides") && message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  )
}

function rethrowProcessingFeeOverrideDbError(error: unknown): never {
  if (isMissingProcessingFeeOverridesTable(error)) {
    throw new ProcessingFeeOverridesSetupRequiredError()
  }
  throw error
}

function normalizeNullableBps(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error("bps must be a non-negative integer or null")
  return Math.round(n)
}

function normalizeReason(value: unknown): string | null {
  if (value == null) return null
  const t = String(value).trim()
  return t.length ? t : null
}

export function parseProcessingFeeOverrideSubjectType(
  raw: string | null | undefined,
): ProcessingFeeOverrideSubjectType | null {
  const v = String(raw ?? "").trim() as ProcessingFeeOverrideSubjectType
  return SUBJECT_TYPES.has(v) ? v : null
}

export async function getProcessingFeeOverrideAdmin(
  admin: SupabaseClient,
  subjectType: ProcessingFeeOverrideSubjectType,
  subjectId: string,
): Promise<ProcessingFeeOverrideRow | null> {
  const { data, error } = await admin
    .from("processing_fee_overrides")
    .select("id,subject_type,subject_id,pay_in_bps,pay_out_bps,cross_border_bps,reason,updated_at")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .maybeSingle()

  if (error) rethrowProcessingFeeOverrideDbError(error)
  if (!data) return null

  return {
    id: data.id,
    subject_type: data.subject_type as ProcessingFeeOverrideSubjectType,
    subject_id: data.subject_id,
    pay_in_bps: data.pay_in_bps == null ? null : Number(data.pay_in_bps),
    pay_out_bps: data.pay_out_bps == null ? null : Number(data.pay_out_bps),
    cross_border_bps: data.cross_border_bps == null ? null : Number(data.cross_border_bps),
    reason: data.reason ?? null,
    updated_at: data.updated_at,
  }
}

export async function upsertProcessingFeeOverrideAdmin(
  admin: SupabaseClient,
  input: ProcessingFeeOverrideUpsertInput,
  updatedBy: string,
): Promise<ProcessingFeeOverrideRow> {
  const subjectType = parseProcessingFeeOverrideSubjectType(input.subject_type)
  if (!subjectType) throw new Error("Invalid subject_type")

  const subjectId = String(input.subject_id ?? "").trim()
  if (!subjectId) throw new Error("subject_id required")

  const payload = {
    subject_type: subjectType,
    subject_id: subjectId,
    pay_in_bps: normalizeNullableBps(input.pay_in_bps),
    pay_out_bps: normalizeNullableBps(input.pay_out_bps),
    cross_border_bps: normalizeNullableBps(input.cross_border_bps),
    reason: normalizeReason(input.reason),
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await admin
    .from("processing_fee_overrides")
    .upsert(payload, { onConflict: "subject_type,subject_id" })
    .select("id,subject_type,subject_id,pay_in_bps,pay_out_bps,cross_border_bps,reason,updated_at")
    .single()

  if (error) rethrowProcessingFeeOverrideDbError(error)

  return {
    id: data.id,
    subject_type: data.subject_type as ProcessingFeeOverrideSubjectType,
    subject_id: data.subject_id,
    pay_in_bps: data.pay_in_bps == null ? null : Number(data.pay_in_bps),
    pay_out_bps: data.pay_out_bps == null ? null : Number(data.pay_out_bps),
    cross_border_bps: data.cross_border_bps == null ? null : Number(data.cross_border_bps),
    reason: data.reason ?? null,
    updated_at: data.updated_at,
  }
}

export async function deleteProcessingFeeOverrideAdmin(
  admin: SupabaseClient,
  subjectType: ProcessingFeeOverrideSubjectType,
  subjectId: string,
): Promise<void> {
  const { error } = await admin
    .from("processing_fee_overrides")
    .delete()
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)

  if (error) rethrowProcessingFeeOverrideDbError(error)
}
