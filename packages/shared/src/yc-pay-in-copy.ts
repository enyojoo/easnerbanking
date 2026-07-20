export type YcPayInRail = 'bank_transfer' | 'mobile_money'

/** Prefix for the pay-in amount reminder — render at body size; amount is styled separately. */
export const YC_PAY_IN_SEND_EXACTLY_LABEL = 'Send exactly'

/** CTA on amount, MoMo setup, and review steps before pay-in complete. */
export const YC_PAY_IN_CONTINUE_CTA = 'Continue'

/** Title on YC pay-in review screens (fund balance + cross-border bank/MoMo). */
export const YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE = 'Review & Complete'

/** CTA on bank pay-in complete (after VA / send-exactly instructions). */
export const YC_PAY_IN_BANK_COMPLETE_CTA = "I've made the payment"

/** CTA on the MoMo pay-in complete screen (STK / phone prompt). */
export const YC_PAY_IN_MOMO_AUTHORIZE_CTA = 'Authorize payment'

/** CTA on YC pay-in complete screens by rail. */
export function ycPayInCompleteCta(rail: YcPayInRail): string {
  return rail === 'mobile_money' ? YC_PAY_IN_MOMO_AUTHORIZE_CTA : YC_PAY_IN_BANK_COMPLETE_CTA
}

/** Instruction shown above bank pay-in payment details. */
export function ycPayInInstructionNotice(rail: YcPayInRail): string {
  if (rail === 'mobile_money') {
    return ycPayInMomoAuthorizeNotice()
  }
  return 'Use the payment details to complete transfer.'
}

/** Instruction on MoMo Complete deposit (shown above the Authorize CTA). */
export function ycPayInMomoCompleteNotice(): string | null {
  return ycPayInMomoAuthorizeNotice()
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
