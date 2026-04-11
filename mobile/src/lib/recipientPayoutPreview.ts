import type { Recipient } from '../types'
import { formatAccountNumber, formatIBAN } from '../utils/formatters'
import { isEasenetRecipientRecord } from './easenetRecipientUi'

export function isMobileMoneyRecipient(r: Pick<Recipient, 'bank_name' | 'mobile_provider'>): boolean {
  const b = (r.bank_name || '').toLowerCase()
  return b.includes('mobile money') || Boolean(r.mobile_provider)
}

export function isWalletRecipientDisplay(r: Pick<Recipient, 'bank_name' | 'wallet_network'>): boolean {
  if ((r.bank_name || '').toLowerCase().includes('wallet')) return true
  return Boolean(r.wallet_network)
}

function parseMobileProviderFromBank(bankName: string): string {
  const m = String(bankName || '').match(/^Mobile Money \(([^)]+)\)/i)
  if (!m?.[1]) return ''
  const inner = m[1]
  const ccIdx = inner.lastIndexOf('|CC:')
  const providerPart = ccIdx >= 0 ? inner.slice(0, ccIdx) : inner
  return providerPart.split('|')[0].trim()
}

function normalizeProviderLabel(raw: string | undefined): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const first = s.split(/\s+/)[0] || s
  if (first.length <= 4 && first === first.toUpperCase()) return first
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export function formatMobilePhoneDisplay(phone: string | undefined | null): string {
  const t = String(phone || '').trim()
  if (!t) return ''
  const compact = t.replace(/[^\d+]/g, '')
  if (compact.startsWith('+')) {
    return `+${compact.slice(1).replace(/\D/g, '')}`
  }
  const d = compact.replace(/\D/g, '')
  if (d.length >= 8) return `+${d}`
  return t
}

function bankNameLead(bankName: string): string {
  const s = String(bankName || '').trim()
  if (!s) return 'Bank'
  const first = s.split(/\s+/)[0] || s
  return first.length > 20 ? `${first.slice(0, 18)}…` : first
}

export function truncateMiddle(s: string, start = 6, end = 6): string {
  const t = s.trim()
  if (!t) return ''
  if (t.length <= start + end + 3) return t
  return `${t.slice(0, start)}...${t.slice(-end)}`
}

function formatBankAccountDisplay(r: Recipient): string {
  const iban = r.iban?.replace(/\s/g, '').trim()
  const acct = r.account_number?.trim()
  if (iban) {
    return formatIBAN(iban)
  }
  if (acct) {
    if (/^0x[a-fA-F0-9]+$/.test(acct)) {
      return truncateMiddle(acct, 6, 6)
    }
    const digits = acct.replace(/\D/g, '')
    if (digits.length >= 8) {
      return formatAccountNumber(digits)
    }
    return acct
  }
  return ''
}

function walletNetworkLabel(r: Recipient): string {
  if (r.wallet_network?.trim()) {
    const w = r.wallet_network.trim()
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }
  const b = r.bank_name || ''
  const m = b.match(/^Wallet \((.*)\)$/i)
  if (!m?.[1]) return 'Wallet'
  const inner = m[1].trim()
  if (inner.includes('/')) {
    const parts = inner.split('/')
    const network = (parts[1] || parts[0]).trim()
    return network || 'Wallet'
  }
  return inner || 'Wallet'
}

/**
 * Subtitle parts for mobile money, bank, and wallet rows — `Left • Right` (e.g. `MTN • +237…`, `Lead • 8282 2033 202`).
 * Not used for Easenet rows (handled separately).
 */
export function getPayoutRecipientSubtitleParts(r: Recipient): { left: string; right: string } {
  if (isEasenetRecipientRecord(r)) {
    return { left: '', right: '' }
  }

  if (isMobileMoneyRecipient(r)) {
    const fromField = normalizeProviderLabel(r.mobile_provider)
    const fromBank = normalizeProviderLabel(parseMobileProviderFromBank(r.bank_name))
    const left = fromField || fromBank || 'Mobile'
    const right = formatMobilePhoneDisplay(r.phone_number || r.account_number)
    return { left, right }
  }

  if (isWalletRecipientDisplay(r)) {
    const left = walletNetworkLabel(r)
    const addr = (r.account_number || r.swift_bic || r.wallet_memo_tag || '').trim()
    const right = addr ? truncateMiddle(addr, 6, 6) : ''
    return { left, right }
  }

  const left = bankNameLead(r.bank_name)
  const right = formatBankAccountDisplay(r)
  return { left, right: right || '' }
}
