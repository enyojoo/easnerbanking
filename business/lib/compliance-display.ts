/**
 * Display vs action entitlements for Noah Tier 1.
 *
 * - **Display:** show balances, deposit instructions, and cached fiat VAs when artifacts exist,
 *   even if KYC/KYB status later changes away from `approved`.
 * - **Actions:** send, offramp, open new currency, and Noah provisioning require `approved`.
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
