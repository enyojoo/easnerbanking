/**
 * Whether a fiat virtual-account (bank deposit) tab should be shown for a currency.
 * Uses Noah provisioning result (`hasAccount`) – not a geo blocklist.
 */

export function isVaAnswerSettled(opts: {
  isFetched: boolean
  hasCachedEntry: boolean
}): boolean {
  return opts.isFetched || opts.hasCachedEntry
}

export function shouldShowBankDepositTab(opts: {
  verificationComplete: boolean
  /** True once network fetch completed OR we have a persisted/cached VA answer for this currency. */
  vaSettled: boolean
  hasVirtualAccount: boolean
}): boolean {
  if (!opts.verificationComplete) return true
  if (!opts.vaSettled) return false
  return opts.hasVirtualAccount
}
