export type YcPayInRail = 'bank_transfer' | 'mobile_money'

/** Instruction shown above YC pay-in payment details (bank vs mobile money). */
export function ycPayInInstructionNotice(rail: YcPayInRail): string {
  if (rail === 'mobile_money') {
    return 'Enter your phone number below, then complete the payment steps on your phone.'
  }
  return 'Complete your transfer using the payment details below.'
}

/** Prominent amount reminder on the pay-in screen. */
export function ycPayInSendingExactlyCopy(formattedAmount: string): string {
  return `You're sending exactly ${formattedAmount}`
}
