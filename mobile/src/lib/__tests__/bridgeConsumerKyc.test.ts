import { describe, expect, it } from '@jest/globals'
import {
  consumerBankKycStatus,
  isBridgeConsumerCutoverPending,
  receiveDepositKycStatus,
  shouldUseBridgeConsumerKyc,
} from '../bridgeConsumerKyc'

describe('bridgeConsumerKyc', () => {
  it('uses Bridge for onboardable states and Noah for New York', () => {
    expect(
      shouldUseBridgeConsumerKyc({
        kyc_address_country: 'US',
        kyc_address_state: 'CA',
      }),
    ).toBe(true)
    expect(
      shouldUseBridgeConsumerKyc({
        kyc_address_country: 'US',
        kyc_address_state: 'NY',
      }),
    ).toBe(false)
  })

  it('does not treat Noah approval as Bridge bank KYC', () => {
    const profile = {
      verification_provider: 'noah',
      verification_status: 'approved',
      noah_kyc_status: 'approved',
      bridge_kyc_status: 'not_started',
      kyc_address_country: 'US',
      kyc_address_state: 'CA',
      bridge_cutover_required_at: '2026-09-14T00:00:00.000Z',
    }
    expect(consumerBankKycStatus(profile)).toBe('not_started')
    expect(isBridgeConsumerCutoverPending(profile)).toBe(true)
  })

  it('clears cutover after Bridge approval', () => {
    const profile = {
      verification_provider: 'bridge',
      verification_status: 'approved',
      bridge_kyc_status: 'approved',
      kyc_address_country: 'GB',
      bridge_cutover_required_at: '2026-09-14T00:00:00.000Z',
    }
    expect(consumerBankKycStatus(profile)).toBe('approved')
    expect(isBridgeConsumerCutoverPending(profile)).toBe(false)
  })

  it('treats Bridge approval as receive-ready even when Noah KYC was never started', () => {
    const profile = {
      verification_provider: 'bridge',
      bridge_kyc_status: 'approved',
      noah_kyc_status: 'not_started',
      kyc_address_country: 'GB',
    }
    expect(receiveDepositKycStatus(profile)).toBe('approved')
  })

  it('keeps the receive verification prompt until Bridge KYC starts', () => {
    expect(
      receiveDepositKycStatus({
        verification_provider: 'bridge',
        bridge_kyc_status: 'not_started',
        noah_kyc_status: null,
        residence_country: 'GB',
      }),
    ).toBe(null)
    expect(
      receiveDepositKycStatus({
        bridge_kyc_status: 'under_review',
        kyc_address_country: 'GB',
      }),
    ).toBe('in_review')
  })
})
