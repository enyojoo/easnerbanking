import { emailService } from "@easner/server"
import { formatStatementCalendarDate } from "./format"
import type { AssembledStatement } from "./types"

export type AccountStatementEmailData = {
  firstName?: string
  statementId: string
  periodLabel: string
  periodToLabel: string
  currency: string
  availableLabel: string
}

export async function sendAccountStatementEmail(input: {
  assembled: AssembledStatement
  pdf: Buffer
  filename: string
  communicationPreferences?: unknown
}): Promise<void> {
  const to = input.assembled.holderEmail.trim()
  if (!to) return

  const result = await emailService.sendEmail(
    {
      to,
      template: "accountStatement",
      audience: input.assembled.scope === "business" ? "business" : "personal",
      data: {
        firstName: input.assembled.holderFirstName ?? undefined,
        statementId: input.assembled.statementId,
        periodLabel: input.assembled.periodLabel,
        periodToLabel: formatStatementCalendarDate(input.assembled.periodTo),
        currency: input.assembled.currency,
        availableLabel: input.assembled.availableLabel,
      } satisfies AccountStatementEmailData,
      attachments: [
        {
          content: input.pdf.toString("base64"),
          filename: input.filename,
          type: "application/pdf",
          disposition: "attachment",
        },
      ],
    },
    input.communicationPreferences,
  )
  if (!result.success) {
    console.error("[statements] email failed", result.error)
  }
}
