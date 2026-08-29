import type { SupabaseClient } from "@supabase/supabase-js"
import { generateStatementPdfBuffer } from "@/lib/generate-statement-pdf"
import { assembleStatement } from "./assemble"
import { allocateUniqueStatementId, persistGeneratedStatement } from "./persist"
import { sendAccountStatementEmail } from "./send-statement-email"
import type { AssembleStatementInput, AssembledStatement } from "./types"

export function statementDownloadFilename(assembled: AssembledStatement): string {
  return `easner-statement-${assembled.currency}-${assembled.periodFrom}-${assembled.periodTo}.pdf`
}

export async function generateAndPersistStatement(
  admin: SupabaseClient,
  input: Omit<AssembleStatementInput, "statementId"> & { communicationPreferences?: unknown },
): Promise<{ assembled: AssembledStatement; pdf: Buffer; filename: string }> {
  const statementId = await allocateUniqueStatementId(admin, input.now)
  const assembled = await assembleStatement(admin, { ...input, statementId })
  const pdf = await generateStatementPdfBuffer(assembled)
  await persistGeneratedStatement(admin, {
    assembled,
    userId: input.userId,
    businessId: input.businessId,
    pdf,
  })
  const filename = statementDownloadFilename(assembled)
  try {
    await sendAccountStatementEmail({
      assembled,
      pdf,
      filename,
      communicationPreferences: input.communicationPreferences,
    })
  } catch (error) {
    console.error("[statements] email threw", error)
  }
  return { assembled, pdf, filename }
}
