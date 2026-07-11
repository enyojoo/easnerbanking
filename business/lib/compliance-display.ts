/**
 * Display vs action entitlements for Noah Tier 1.
 *
 * - **Display:** show balances and cached financial artifacts when KYC/KYB is `approved`,
 *   or when provisioned artifacts already exist.
 * - **Deposit rails / money movement:** bank & stablecoin deposit instructions, send,
 *   offramp, open new currency, and Noah provisioning require `approved`.
 */

export function canDisplayProvisionedFinancialData(
  tier1Complete: boolean,
  hasProvisionedArtifacts: boolean,
): boolean {
  return tier1Complete || hasProvisionedArtifacts
}

export function canPerformNoahMoneyMovement(tier1Complete: boolean): boolean {
  return tier1Complete
}
