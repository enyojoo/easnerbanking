/**
 * Inbound bank-deposit display: sender name (hero/list) vs ACH narration (detail row).
 */

import { formatDisplayPersonName } from "../format-display-name"
import { parseSentFromNarrationLabel } from "./bank-deposit-narration-parse"
import { isVerificationDepositMetadata } from "./deposit-metadata-guards"

export { parseSentFromNarrationLabel } from "./bank-deposit-narration-parse"

/** FiatDeposit remitter for list/hero — never VA account holder or narration. */
export function deriveBankDepositInboundDisplayLabel(input: {
  metadata?: Record<string, unknown> | null
  fiatDepositSenderName?: string | null
}): string | undefined {
  const meta = input.metadata || {}
  if (isVerificationDepositMetadata(meta)) return undefined
  const depositSender =
    input.fiatDepositSenderName ??
    meta.noah_fiat_deposit_sender_name ??
    meta.remitter_name ??
    meta.sender_name
  if (depositSender != null && String(depositSender).trim()) {
    const formatted = formatDisplayPersonName(String(depositSender))
    if (formatted) return formatted
  }
  return undefined
}

/** "Sent from Grey" for the narration summary row. */
export function deriveBankDepositNarrationLabel(input: {
  metadata?: Record<string, unknown> | null
  paymentReference?: string | null
}): string | undefined {
  const meta = input.metadata || {}
  if (typeof meta.deposit_narration === "string" && meta.deposit_narration.trim()) {
    return meta.deposit_narration.trim()
  }
  if (typeof meta.narration === "string" && meta.narration.trim()) {
    const n = meta.narration.trim()
    if (/^sent from /i.test(n)) return n
  }
  const refCandidates: unknown[] = [
    input.paymentReference,
    meta.payment_reference,
    meta.reference,
  ]
  for (const ref of refCandidates) {
    if (ref == null) continue
    const sentFrom = parseSentFromNarrationLabel(String(ref))
    if (sentFrom) return sentFrom
  }
  return undefined
}
