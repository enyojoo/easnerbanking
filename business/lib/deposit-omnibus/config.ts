function envFlag(name: string): boolean {
  return String(process.env[name] || "").trim().toLowerCase() === "true"
}

export function isDepositOmnibusEnabled(): boolean {
  return envFlag("DEPOSIT_OMNIBUS_ENABLED")
}

export function isDepositFeePricingEnabled(): boolean {
  return envFlag("DEPOSIT_FEE_PRICING_ENABLED")
}

export function isDepositSplitEnabled(): boolean {
  return envFlag("DEPOSIT_SPLIT_ENABLED")
}

export function isDepositSplitDryRun(): boolean {
  return envFlag("DEPOSIT_SPLIT_DRY_RUN")
}

export function depositOmnibusAllowlistCustomerIds(): string[] {
  const raw = String(process.env.DEPOSIT_OMNIBUS_ALLOWLIST_CUSTOMER_IDS || "").trim()
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isDepositOmnibusCustomerAllowed(noahCustomerId: string | null | undefined): boolean {
  const id = String(noahCustomerId ?? "").trim()
  if (!id) return false
  const allowlist = depositOmnibusAllowlistCustomerIds()
  if (!allowlist.length) return true
  return allowlist.includes(id)
}

export function depositOmnibusSolanaAddressUsd(): string | null {
  const v = String(process.env.DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD || "").trim()
  return v || null
}

export function depositOmnibusSolanaAddressEur(): string | null {
  const v = String(process.env.DEPOSIT_OMNIBUS_SOLANA_ADDRESS_EUR || "").trim()
  return v || null
}

export function resolveDepositOmnibusAddressForLedgerCurrency(
  ledgerCurrency: "USD" | "EUR",
): string | null {
  return ledgerCurrency === "EUR"
    ? depositOmnibusSolanaAddressEur()
    : depositOmnibusSolanaAddressUsd()
}

export function isDepositOmnibusAddress(address: string | null | undefined): boolean {
  const a = String(address ?? "").trim()
  if (!a) return false
  const usd = depositOmnibusSolanaAddressUsd()
  const eur = depositOmnibusSolanaAddressEur()
  return (usd != null && a === usd) || (eur != null && a === eur)
}

/** When split is on, omnibus must also be enabled. */
export function isDepositSplitConfigValid(): boolean {
  if (!isDepositSplitEnabled()) return true
  return isDepositOmnibusEnabled()
}
