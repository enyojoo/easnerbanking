import { describe, expect, it } from '@jest/globals'
import type { Recipient } from '../src/types'
import { isWalletSendRecipient, resolveRecipientWalletNetwork } from '../src/lib/recipientWalletMeta'

describe('resolveRecipientWalletNetwork', () => {
  it('reads network from Wallet (ASSET/Network) label when column is null', () => {
    const row = {
      bank_name: 'Wallet (USDT/Tron)',
      wallet_network: null,
    } as Recipient
    expect(resolveRecipientWalletNetwork(row)).toBe('Tron')
    expect(isWalletSendRecipient(row)).toBe(true)
  })

  it('prefers wallet_network column when set', () => {
    const row = {
      bank_name: 'Wallet (USDT/Tron)',
      wallet_network: 'Tron',
    } as Recipient
    expect(resolveRecipientWalletNetwork(row)).toBe('Tron')
  })
})
