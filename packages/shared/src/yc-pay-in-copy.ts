export type YcPayInRail = 'bank_transfer' | 'mobile_money'

/** Prefix for the pay-in amount reminder — render at body size; amount is styled separately. */
export const YC_PAY_IN_SEND_EXACTLY_LABEL = 'Send exactly'

/** CTA on the MoMo authorize screen. */
export const YC_PAY_IN_MOMO_AUTHORIZE_CTA = 'Authorize payment'

/** Instruction shown above bank pay-in payment details. */
export function ycPayInInstructionNotice(rail: YcPayInRail): string {
  if (rail === 'mobile_money') {
    return ycPayInMomoAuthorizeNotice()
  }
  return 'Use the payment details to complete transfer.'
}

/** Instruction on MoMo Complete deposit (network/phone + Authorize CTA — no duplicate authorize copy). */
export function ycPayInMomoCompleteNotice(): string | null {
  return null
}

/** Instruction on the MoMo authorize screen (before user submits phone + network). */
export function ycPayInMomoAuthorizeNotice(): string {
  return 'Click authorize, check your phone and approve the payment prompt.'
}

/** Notice above pay-in details on Complete deposit. */
export function ycPayInCompleteNotice(rail: YcPayInRail): string | null {
  if (rail === 'mobile_money') {
    return ycPayInMomoCompleteNotice()
  }
  return ycPayInInstructionNotice(rail)
}

/** Full pay-in amount reminder (prefix + amount) for plain-text contexts. */
export function ycPayInSendingExactlyCopy(formattedAmount: string): string {
  return `${YC_PAY_IN_SEND_EXACTLY_LABEL} ${formattedAmount}`
}
