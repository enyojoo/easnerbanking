import { describe, expect, it } from 'vitest'
import {
  getBusinessWalletSendMin,
  isDirectTurnkeyWalletCorridor,
  isWalletSendRecipient,
  resolveEffectiveWalletSendMin,
  validateWalletSendReceiveAmount,
  WALLET_SEND_MIN_RECEIVE_AMOUNT,
  minReceiveForRelayBridge,
} from './wallet-send-limits'

describe('wallet-send-limits', () => {
  it('detects wallet recipients by wallet_network', () => {
    expect(isWalletSendRecipient({ wallet_network: 'Solana' })).toBe(true)
    expect(isWalletSendRecipient({ wallet_network: '' })).toBe(false)
    expect(isWalletSendRecipient({})).toBe(false)
  })

  it('requires at least one receive unit on direct Turnkey corridors', () => {
    expect(WALLET_SEND_MIN_RECEIVE_AMOUNT).toBe(1)
    expect(isDirectTurnkeyWalletCorridor('USDC', 'Solana')).toBe(true)
    expect(isDirectTurnkeyWalletCorridor('EURC', 'Solana')).toBe(true)
    expect(isDirectTurnkeyWalletCorridor('USDT', 'Tron')).toBe(false)
    expect(validateWalletSendReceiveAmount(1, 'USDC')).toEqual({ ok: true })
    expect(validateWalletSendReceiveAmount(0.5, 'USDC').ok).toBe(false)
    expect(validateWalletSendReceiveAmount(0.5, 'USDC').message).toContain('USDC')
  })

  it('returns business mins for stablecoin wallet assets', () => {
    expect(getBusinessWalletSendMin('USDT')).toBe(10)
    expect(getBusinessWalletSendMin('USDC')).toBe(10)
    expect(getBusinessWalletSendMin('EURC')).toBe(10)
  })

  it('uses the higher of Relay and business minimums for bridge corridors', () => {
    expect(minReceiveForRelayBridge(1)).toBe(7)
    expect(
      resolveEffectiveWalletSendMin({
        receiveCurrency: 'USDT',
        receiveNetwork: 'Tron',
        customerRate: 1,
      }),
    ).toBe(10)
    expect(
      resolveEffectiveWalletSendMin({
        receiveCurrency: 'USDC',
        receiveNetwork: 'Solana',
        customerRate: 1,
      }),
    ).toBe(1)
    expect(
      resolveEffectiveWalletSendMin({
        receiveCurrency: 'USDT',
        receiveNetwork: 'Tron',
        customerRate: 0.5,
      }),
    ).toBe(14)
  })

  it('enforces effective minimum on validation', () => {
    const min = resolveEffectiveWalletSendMin({
      receiveCurrency: 'USDT',
      receiveNetwork: 'Tron',
      customerRate: 1,
    })
    expect(validateWalletSendReceiveAmount(9, 'USDT', { minReceive: min }).ok).toBe(false)
    expect(validateWalletSendReceiveAmount(10, 'USDT', { minReceive: min }).ok).toBe(true)
  })
})
