import { officeFetch } from "@/lib/api-client"

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

export type ProcessingFeeOverrideUpsertPayload = {
  subject_type: ProcessingFeeOverrideSubjectType
  subject_id: string
  pay_in_bps?: number | null
  pay_out_bps?: number | null
  cross_border_bps?: number | null
  reason?: string | null
}

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export type ProcessingFeeOverrideGetResult = {
  override: ProcessingFeeOverrideRow | null
  setupRequired?: boolean
  error?: string
}

export const processingFeeOverridesApi = {
  async get(
    subjectType: ProcessingFeeOverrideSubjectType,
    subjectId: string,
  ): Promise<ProcessingFeeOverrideGetResult> {
    const params = new URLSearchParams({
      subject_type: subjectType,
      subject_id: subjectId,
    })
    const res = await officeFetch(`/api/admin/processing-fee-overrides?${params}`)
    const data = await asJson<ProcessingFeeOverrideGetResult>(res)
    return {
      override: data.override ?? null,
      setupRequired: data.setupRequired === true,
      error: data.error,
    }
  },

  async upsert(payload: ProcessingFeeOverrideUpsertPayload): Promise<ProcessingFeeOverrideRow> {
    const res = await officeFetch("/api/admin/processing-fee-overrides", {
      method: "PUT",
      body: JSON.stringify(payload),
    })
    const data = await asJson<{ override: ProcessingFeeOverrideRow }>(res)
    return data.override
  },

  async remove(
    subjectType: ProcessingFeeOverrideSubjectType,
    subjectId: string,
  ): Promise<void> {
    const params = new URLSearchParams({
      subject_type: subjectType,
      subject_id: subjectId,
    })
    const res = await officeFetch(`/api/admin/processing-fee-overrides?${params}`, {
      method: "DELETE",
    })
    await asJson<{ ok?: boolean }>(res)
  },
}
