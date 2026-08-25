/**
 * Verify Grizzly Turnkey + Grid integration (no fund sweep).
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx scripts/verify-grizzly-grid-turnkey.ts
 */
import { createClient } from "@supabase/supabase-js"
import { noahCustomerIdFromBusinessId } from "@/lib/noah/customer-id"
import { ensureTurnkeySubOrgForEasnerOwner } from "@/lib/wallet/ensure-turnkey-sub-org"
import { trySyncTurnkeyDepositVaultsIfNeeded } from "@/lib/wallet/sync-deposit-vaults"
import { getTurnkeyDepositAddressesForBusiness } from "@/lib/wallet/turnkey-deposit-addresses"
import { registerTurnkeyUsdcExternalAccount } from "@/lib/grid/turnkey-external-account"
import { refreshGridBusinessReceiveRails } from "@/lib/grid/provision-after-approval"
import { processNextWalletProvisioningJob } from "@/lib/wallet/turnkey-provisioning"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"

const BUSINESS_ID = "53798479-3d39-428a-bd22-0b48fc3792a2"
const OWNER_USER_ID = "eb0315b0-479c-4d7d-b312-88dd3cb49fc2"
const CUSTOMER_ID = "Customer:01a031e2-d6c5-938e-0000-cc621987c99e"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const report: Record<string, unknown> = {}

  const subOrg = await ensureTurnkeySubOrgForEasnerOwner({
    admin,
    scope: "business",
    subjectUserId: OWNER_USER_ID,
    subjectBusinessId: BUSINESS_ID,
    noahCustomerId: noahCustomerIdFromBusinessId(BUSINESS_ID),
    userEmail: "company@grizzlyconstruction.buzz",
    displayName: "Grizzly Construction Inc",
  })
  report.subOrg = subOrg
  if (!subOrg.ok) throw new Error(`sub_org_failed:${subOrg.reason}`)

  const { data: wo } = await admin
    .from("wallet_owners")
    .select("id,turnkey_sub_organization_id,turnkey_da_user_id")
    .eq("owner_type", "business")
    .eq("owner_ref", BUSINESS_ID)
    .maybeSingle()
  report.walletOwner = wo
  const walletOwnerId = String(wo?.id ?? "")
  if (!walletOwnerId) throw new Error("wallet_owner_missing")

  await admin
    .from("wallet_provisioning_jobs")
    .update({
      state: "pending",
      error: null,
      next_retry_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("wallet_owner_id", walletOwnerId)
    .in("state", ["pending", "retry", "awaiting_sub_org"])

  const accountCtx: NoahAccountContext = {
    scope: "business",
    customerType: "Business",
    noahCustomerId: "",
    subjectBusinessId: BUSINESS_ID,
    subjectUserId: OWNER_USER_ID,
  }
  await trySyncTurnkeyDepositVaultsIfNeeded(admin, accountCtx)

  const jobResults = []
  for (let i = 0; i < 5; i++) {
    const r = await processNextWalletProvisioningJob({ walletOwnerId })
    jobResults.push(r)
    if (!r.processed || r.detail === "no_jobs") break
  }
  report.vaultJobs = jobResults

  const { data: accounts } = await admin
    .from("wallet_accounts")
    .select("chain,asset,ledger_currency,address,associated_token_account_address,status")
    .eq("wallet_owner_id", walletOwnerId)
  report.walletAccounts = accounts

  const { data: jobs } = await admin
    .from("wallet_provisioning_jobs")
    .select("ledger_currency,chain,asset,state,error")
    .eq("wallet_owner_id", walletOwnerId)
  report.provisioningJobs = jobs

  const deposits = await getTurnkeyDepositAddressesForBusiness(admin, BUSINESS_ID, { mode: "ensure" })
  report.deposits = {
    usd: deposits.USD,
    eurOwner: deposits.EUR?.ownerAddress ?? null,
  }

  const rails = await refreshGridBusinessReceiveRails({
    admin,
    businessId: BUSINESS_ID,
    userId: OWNER_USER_ID,
    gridCustomerId: CUSTOMER_ID,
  })
  report.rails = rails

  const eaId = await registerTurnkeyUsdcExternalAccount({
    admin,
    businessId: BUSINESS_ID,
    userId: OWNER_USER_ID,
    gridCustomerId: CUSTOMER_ID,
  })
  report.gridExternalAccountId = eaId

  const { data: vas } = await admin
    .from("virtual_accounts")
    .select("currency,status,provider,account_number,routing_number,settlement_target")
    .eq("business_id", BUSINESS_ID)
    .eq("provider", "grid")
  report.virtualAccounts = vas

  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
