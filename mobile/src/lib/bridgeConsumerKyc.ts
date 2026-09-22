import {
  isBridgeNewYorkResidence,
  isBridgeOnboardableResidence,
} from '@easner/shared'

export type BridgeConsumerKycProfile = {
  verification_status?: string | null
  verification_provider?: string | null
  bridge_kyc_status?: string | null
  bridge_customer_id?: string | null
  bridge_cutover_required_at?: string | null
  bridge_cutover_deadline_at?: string | null
  noah_kyc_status?: string | null
  residence_country?: string | null
  kyc_address_country?: string | null
  kyc_address_state?: string | null
  profile?: BridgeConsumerKycProfile | null
}

function read(profile: BridgeConsumerKycProfile | null | undefined, key: keyof BridgeConsumerKycProfile): string {
  const direct = profile?.[key]
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const nested = profile?.profile?.[key]
  return typeof nested === 'string' ? nested.trim() : ''
}

export function consumerResidenceForBridge(profile: BridgeConsumerKycProfile | null | undefined): {
  countryCode: string
  state: string
} {
  const countryCode =
    read(profile, 'kyc_address_country') || read(profile, 'residence_country')
  const state = read(profile, 'kyc_address_state')
  return { countryCode, state }
}

/** NY and prohibited geos stay on Noah. Everyone else uses Bridge for bank KYC. */
export function shouldUseBridgeConsumerKyc(
  profile: BridgeConsumerKycProfile | null | undefined,
  residenceOverride?: string | null,
): boolean {
  const geo = consumerResidenceForBridge(profile)
  const countryCode = String(residenceOverride ?? geo.countryCode).trim().toUpperCase() || geo.countryCode
  if (isBridgeNewYorkResidence({ countryCode, state: geo.state })) return false
  if (read(profile, 'verification_provider').toLowerCase() === 'bridge') return true
  if (read(profile, 'bridge_customer_id')) return true
  return isBridgeOnboardableResidence({ countryCode, state: geo.state })
}

function bridgeBankKycApproved(profile: BridgeConsumerKycProfile | null | undefined): boolean {
  if (read(profile, 'bridge_kyc_status').toLowerCase() === 'approved') return true
  return (
    read(profile, 'verification_provider').toLowerCase() === 'bridge' &&
    read(profile, 'verification_status').toLowerCase() === 'approved'
  )
}

export function consumerBankKycStatus(profile: BridgeConsumerKycProfile | null | undefined): string {
  if (shouldUseBridgeConsumerKyc(profile)) {
    if (bridgeBankKycApproved(profile)) return 'approved'
    return read(profile, 'bridge_kyc_status') || 'not_started'
  }
  return read(profile, 'noah_kyc_status') || read(profile, 'verification_status') || 'not_started'
}

export type ReceiveDepositKycStatus = 'approved' | 'in_review' | 'rejected' | null

/**
 * Gate for receive / deposit details.
 * Bridge customers stay on `bridge_kyc_status` after approval; `noah_kyc_status` can remain unset.
 */
export function receiveDepositKycStatus(
  profile: BridgeConsumerKycProfile | null | undefined,
): ReceiveDepositKycStatus {
  const raw = consumerBankKycStatus(profile).trim().toLowerCase()
  switch (raw) {
    case 'approved':
      return 'approved'
    case 'rejected':
      return 'rejected'
    case 'under_review':
    case 'in_review':
    case 'pending':
    case 'in_progress':
      return 'in_review'
    default:
      return null
  }
}

export function isBridgeConsumerCutoverPending(
  profile: BridgeConsumerKycProfile | null | undefined,
): boolean {
  if (!shouldUseBridgeConsumerKyc(profile)) return false
  if (!read(profile, 'bridge_cutover_required_at')) return false
  return !bridgeBankKycApproved(profile)
}

export function bridgeCutoverDeadlineLabel(
  profile: BridgeConsumerKycProfile | null | undefined,
): string | null {
  const raw = read(profile, 'bridge_cutover_deadline_at')
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
