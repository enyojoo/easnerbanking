import type { SupabaseClient } from "@supabase/supabase-js"
import { generateStatementId } from "./statement-id"
import type { AssembledStatement } from "./types"

export const ACCOUNT_STATEMENTS_BUCKET = "account-statements"

export function statementStoragePath(assembled: AssembledStatement, subjectId: string): string {
  return `${assembled.scope}/${subjectId}/${assembled.statementId}.pdf`
}

export async function allocateUniqueStatementId(
  admin: SupabaseClient,
  at = new Date(),
): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const statementId = generateStatementId(at)
    const { data, error } = await admin
      .from("account_statements")
      .select("id")
      .eq("statement_id", statementId)
      .maybeSingle()
    if (error) throw error
    if (!data) return statementId
  }
  throw new Error("Could not allocate a unique statement id")
}

export async function persistGeneratedStatement(
  admin: SupabaseClient,
  input: {
    assembled: AssembledStatement
    userId: string
    businessId: string | null
    pdf: Buffer
  },
): Promise<{ storagePath: string }> {
  const subjectId = input.businessId || input.userId
  const storagePath = statementStoragePath(input.assembled, subjectId)
  const { error: uploadError } = await admin.storage
    .from(ACCOUNT_STATEMENTS_BUCKET)
    .upload(storagePath, input.pdf, {
      contentType: "application/pdf",
      upsert: false,
    })
  if (uploadError) throw uploadError

  const { error: insertError } = await admin.from("account_statements").insert({
    statement_id: input.assembled.statementId,
    user_id: input.userId,
    business_id: input.businessId,
    scope: input.assembled.scope,
    currency: input.assembled.currency,
    period_from: input.assembled.periodFrom,
    period_to: input.assembled.periodTo,
    available_as_of: input.assembled.availableAsOf,
    time_zone: input.assembled.timeZone,
    holder_name: input.assembled.holderName,
    holder_email: input.assembled.holderEmail,
    available_balance: input.assembled.available,
    storage_path: storagePath,
  })
  if (insertError) {
    await admin.storage.from(ACCOUNT_STATEMENTS_BUCKET).remove([storagePath])
    throw insertError
  }
  return { storagePath }
}
