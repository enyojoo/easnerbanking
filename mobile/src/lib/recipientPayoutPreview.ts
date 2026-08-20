import type { Recipient } from '../types'
import {
  formatAccountNumberDigits as formatAccountNumber,
  formatIbanDisplay as formatIBAN,
  getPayoutRecipientSubtitleParts as getPartsFromSource,
  isMobileMoneyPayoutRow,
  isWalletPayoutRow,
  truncateMiddle,
  type PayoutRecipientSubtitleInput,
} from '@easner/shared'
import { isEasenetRecipientRecord } from './easenetRecipientUi'

export { formatAccountNumber, formatIBAN, truncateMiddle }
export { isMobileMoneyPayoutRow as isMobileMoneyRecipient, isWalletPayoutRow as isWalletRecipientDisplay }

function recipientToSubtitleInput(r: Recipient): PayoutRecipientSubtitleInput {
  return {
    bankName: r.bank_name,
    phone: r.phone_number,
    mobileProvider: r.mobile_provider,
    iban: r.iban,
    accountNumber: r.account_number,
    fullAccountNumber: r.account_number,
    walletNetwork: r.wallet_network,
    swiftBic: r.swift_bic,
    payeeEasetag: isEasenetRecipientRecord(r) ? '@easetag' : undefined,
  }
}

/**
 * Subtitle parts for mobile money, bank, and wallet rows – `Left • Right`.
 * Not used for Easenet rows (handled separately).
 */
export function getPayoutRecipientSubtitleParts(r: Recipient): { left: string; right: string } {
  if (isEasenetRecipientRecord(r)) {
    return { left: '', right: '' }
  }
  return getPartsFromSource(recipientToSubtitleInput(r))
}
