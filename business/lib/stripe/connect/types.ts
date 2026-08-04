export type ConnectOnboardingStatus = "pending" | "active" | "restricted" | "disabled"

export type BusinessStripeConnectAccountRow = {
  business_id: string
  stripe_account_id: string
  onboarding_status: ConnectOnboardingStatus
  charges_enabled: boolean
  payouts_enabled: boolean
  transfers_enabled: boolean
  details_submitted: boolean
  default_settlement_rail: "grid_va" | "turnkey_stablecoin" | null
  stripe_external_account_id: string | null
  stripe_payout_schedule: Record<string, unknown> | null
  requirements_currently_due: unknown
  capabilities: Record<string, unknown> | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export type ConnectReadyStatus = {
  ready: boolean
  reason?: string
  stripeAccountId: string | null
  onboardingStatus: ConnectOnboardingStatus | null
  transfersEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  externalAccountLinked: boolean
  hasGridVa: boolean
  requirementsCurrentlyDue: string[]
}
