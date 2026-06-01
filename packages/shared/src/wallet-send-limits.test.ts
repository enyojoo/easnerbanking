import { describe, expect, it } from 'vitest'
import {
  isWalletSendRecipient,
  validateWalletSendReceiveAmount,
  WALLET_SEND_MIN_RECEIVE_AMOUNT,
} from './wallet-send-limits'

describe('wallet-send-limits', () => {
  it('detects wallet recipients by wallet_network', () => {
    expect(isWalletSendRecipient({ wallet_network: 'Solana' })).toBe(true)
    expect(isWalletSendRecipient({ wallet_network: '' })).toBe(false)
    expect(isWalletSendRecipient({})).toBe(false)
  })

  it('requires at least one receive unit', () => {
    expect(WALLET_SEND_MIN_RECEIVE_AMOUNT).toBe(1)
    expect(validateWalletSendReceiveAmount(1, 'USDC')).toEqual({ ok: true })
    expect(validateWalletSendReceiveAmount(0.5, 'USDC').ok).toBe(false)
    expect(validateWalletSendReceiveAmount(0.5, 'USDC').message).toContain('USDC')
  })
})
