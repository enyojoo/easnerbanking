import type { Recipient } from '../types'

/** Infer Noah network from `Wallet (ASSET/Network)` when `wallet_network` column is null. */
export function resolveRecipientWalletNetwork(
  r: Pick<Recipient, 'bank_name' | 'wallet_network'> | null | undefined,
): string {
  if (!r) return ''
  const fromCol = String(r.wallet_network || '').trim()
  if (fromCol) return fromCol

  const walletMatch = String(r.bank_name || '').match(/^Wallet\s*\((.*)\)\s*$/i)
  if (!walletMatch) return ''

  const descriptor = (walletMatch[1] || '').trim()
  if (descriptor.includes('/')) {
    const parts = descriptor.split('/').map((p) => p.trim())
    return parts[1] || ''
  }
  return descriptor
}

/** Balance-funded on-chain send (not Easetag P2P, not mobile money). */
export function isWalletSendRecipient(
  r: Pick<Recipient, 'bank_name' | 'wallet_network' | 'mobile_provider'> | null | undefined,
): boolean {
  if (!r) return false
  const bank = String(r.bank_name || '').toLowerCase()
  if (bank.includes('easetag') || bank.includes('easenet')) return false
  if (bank.includes('mobile money') || r.mobile_provider) return false
  if (resolveRecipientWalletNetwork(r)) return true
  return bank.includes('wallet')
}
