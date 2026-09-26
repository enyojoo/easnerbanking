import {
  ACCOUNT_LOCKED_CODE,
  ACCOUNT_RESTRICTED_CODE,
  accountRestrictionDepositsBlockedCopy,
  accountRestrictionLockedCopy,
  accountRestrictionSendBlockedCopy,
} from '@easner/shared'
import { ApiError } from '../query/api-client'

export type AccountRestrictionErrorIntent = 'send' | 'deposit'

function codeFromUnknown(err: unknown): string | null {
  if (err instanceof ApiError && err.code) return String(err.code).trim()
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && code.trim()) return code.trim()
    const payload = (err as { payload?: unknown }).payload
    if (payload && typeof payload === 'object') {
      const nested = (payload as { code?: unknown }).code
      if (typeof nested === 'string' && nested.trim()) return nested.trim()
    }
  }
  return null
}

function messageFromUnknown(err: unknown): string {
  if (err instanceof Error) return err.message.trim()
  if (typeof err === 'string') return err.trim()
  return ''
}

/** Map API restriction codes / messages to shared user-facing copy when UI gating was bypassed. */
export function accountRestrictionMessageFromError(
  err: unknown,
  intent: AccountRestrictionErrorIntent = 'send',
): string | null {
  const code = codeFromUnknown(err)
  if (code === ACCOUNT_LOCKED_CODE) return accountRestrictionLockedCopy()
  if (code === ACCOUNT_RESTRICTED_CODE) {
    return intent === 'deposit'
      ? accountRestrictionDepositsBlockedCopy()
      : accountRestrictionSendBlockedCopy()
  }

  const msg = messageFromUnknown(err)
  if (!msg) return null

  const locked = accountRestrictionLockedCopy()
  const sendBlocked = accountRestrictionSendBlockedCopy()
  const depositsBlocked = accountRestrictionDepositsBlockedCopy()
  if (msg === locked || /has been suspended/i.test(msg)) return locked
  if (msg === sendBlocked || msg === depositsBlocked) return msg
  if (/account is restricted/i.test(msg)) {
    return intent === 'deposit' ? depositsBlocked : sendBlocked
  }
  return null
}
