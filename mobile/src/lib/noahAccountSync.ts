/**
 * When Tier 1 is approved but fiat virtual account ids are missing, mobile should call
 * POST /api/noah/sync-status to pull payment methods from Noah into Supabase.
 */
export function needsNoahVirtualAccountProvision(
  profile:
    | {
        noah_kyc_status?: string | null
        noah_usd_virtual_account_id?: string | null
        noah_eur_virtual_account_id?: string | null
        profile?: {
          noah_kyc_status?: string | null
          noah_usd_virtual_account_id?: string | null
          noah_eur_virtual_account_id?: string | null
        }
      }
    | null
    | undefined,
): boolean {
  const status = String(
    profile?.noah_kyc_status ?? profile?.profile?.noah_kyc_status ?? "",
  )
    .trim()
    .toLowerCase()
  if (status !== "approved") return false

  const usd =
    profile?.noah_usd_virtual_account_id ?? profile?.profile?.noah_usd_virtual_account_id
  const eur =
    profile?.noah_eur_virtual_account_id ?? profile?.profile?.noah_eur_virtual_account_id
  return !usd || !eur
}
