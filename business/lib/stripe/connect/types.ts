export type ConnectOnboardingStatus = "pending" | "active" | "restricted" | "disabled"

export type ConnectEmailNotifications = {
  setupStartedAt?: string
  actionRequiredAt?: string
  actionRequiredFingerprint?: string
  readyAt?: string
}

export type BusinessStripeConnectAccountRow = {
  business_id: string
  stripe_account_id: string
  onboarding_status: ConnectOnboardingStatus
  charges_enabled: boolean
  payouts_enabled: boolean
  transfers_enabled: boolean
  details_submitted: boolean
  default_settlement_rail: "grid_va" | "bridge_va" | "turnkey_stablecoin" | null
  stripe_external_account_id: string | null
  stripe_test_account_id?: string | null
  stripe_payout_schedule: Record<string, unknown> | null
  requirements_currently_due: unknown
  requirements_snapshot: Record<string, unknown> | null
  business_profile_snapshot: Record<string, unknown> | null
  payout_destination_snapshot: Record<string, unknown> | null
  capabilities: Record<string, unknown> | null
  email_notifications?: ConnectEmailNotifications | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export type ConnectReadyStatus = {
  ready: boolean
  reason?: string
  tier1Complete: boolean
  stripeAccountId: string | null
  onboardingStatus: ConnectOnboardingStatus | null
  transfersEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  externalAccountLinked: boolean
  hasGridVa: boolean
  requirementsCurrentlyDue: string[]
}
