/**
 * Read-only check: Turnkey + Grid linkage for a Grid customer id.
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx scripts/check-grid-customer-turnkey.ts Customer:01a03d09-1e6f-938e-0000-125caf8f6dde
 */
import { createClient } from "@supabase/supabase-js"
import { gridFetch, gridFetchAllPages } from "@/lib/grid/http"
import { normalizeGridCustomerId } from "@/lib/grid/quote-request"
import { getTurnkeyDepositAddressesForBusiness } from "@/lib/wallet/turnkey-deposit-addresses"

const customerIdArg = process.argv[2] || "Customer:01a03d09-1e6f-938e-0000-125caf8f6dde"
const customerId = normalizeGridCustomerId(customerIdArg)

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const rawId = customerId.replace(/^Customer:/i, "")
  let business: {
    id: string
    name: string | null
    verification_status: string | null
    verification_provider: string | null
    grid_customer_id: string | null
    support_email: string | null
    kyb_verified_at: string | null
    created_at: string | null
  } | null = null

  {
    const { data, error } = await admin
      .from("businesses")
      .select(
        "id,name,verification_status,verification_provider,grid_customer_id,support_email,kyb_verified_at,created_at",
      )
      .or(
        `grid_customer_id.eq.${customerId},grid_customer_id.eq.${rawId},grid_customer_id.eq.Customer:${rawId}`,
      )
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    business = data
  }

  if (!business?.id) {
    console.log(JSON.stringify({ ok: false, error: "business_not_found", customerId }, null, 2))
    process.exit(1)
  }
  const businessId = String(business.id)

  const { data: members } = await admin
    .from("business_members")
    .select("user_id,role")
    .eq("business_id", businessId)
    .limit(10)

  const { data: owner } = await admin
    .from("wallet_owners")
    .select("id,turnkey_sub_organization_id,turnkey_da_user_id,noah_customer_id,created_at,updated_at")
    .eq("owner_type", "business")
    .eq("owner_ref", businessId)
    .maybeSingle()

  const walletOwnerId = owner?.id ? String(owner.id) : null

  const { data: accounts } = walletOwnerId
    ? await admin
        .from("wallet_accounts")
        .select("chain,asset,ledger_currency,address,associated_token_account_address,status")
        .eq("wallet_owner_id", walletOwnerId)
    : { data: null }

  const { data: jobs } = walletOwnerId
    ? await admin
        .from("wallet_provisioning_jobs")
        .select("ledger_currency,chain,asset,state,error,updated_at")
        .eq("wallet_owner_id", walletOwnerId)
    : { data: null }

  const { data: vas } = await admin
    .from("virtual_accounts")
    .select(
      "currency,status,provider,account_number,routing_number,settlement_target,provider_virtual_account_id",
    )
    .eq("business_id", businessId)
    .eq("provider", "grid")

  let deposits: unknown = null
  let depositError: string | null = null
  try {
    deposits = await getTurnkeyDepositAddressesForBusiness(admin, businessId, { mode: "fast" })
  } catch (e) {
    depositError = e instanceof Error ? e.message : String(e)
  }

  let gridCustomer: unknown = null
  let gridExternalAccounts: unknown[] = []
  let gridInternalAccounts: unknown[] = []
  let gridError: string | null = null
  try {
    gridCustomer = await gridFetch({
      method: "GET",
      path: `/customers/${encodeURIComponent(customerId)}`,
    })
    const ext = await gridFetch<{ data?: Array<Record<string, unknown>> }>({
      method: "GET",
      path: `/customers/external-accounts?customerId=${encodeURIComponent(customerId)}&limit=100`,
    })
    gridExternalAccounts = ext.data ?? []
    gridInternalAccounts = await gridFetchAllPages<Record<string, unknown>>({
      path: "/customers/internal-accounts",
      query: { customerId, type: "INTERNAL_FIAT" },
      mapPage: (page) => page.data ?? [],
    })
  } catch (e) {
    gridError = e instanceof Error ? e.message : String(e)
  }

  const usdVault = (deposits as { USD?: { ownerAddress?: string; address?: string } } | null)?.USD
  const vaultAddrs = new Set(
    [usdVault?.ownerAddress, usdVault?.address].map((s) => String(s ?? "").trim()).filter(Boolean),
  )

  const matchingExternal = gridExternalAccounts.filter((row) => {
    const r = row as Record<string, unknown>
    const info = (r.accountInfo ?? {}) as Record<string, unknown>
    const addr = String(info.address ?? "").trim()
    const platform = String(r.platformAccountId ?? "")
    return (
      vaultAddrs.has(addr) ||
      platform === `turnkey_sol_usdc_${businessId}` ||
      platform.includes(businessId)
    )
  })

  const subOrgId = String(owner?.turnkey_sub_organization_id ?? "").trim()
  const report = {
    ok: Boolean(subOrgId) && matchingExternal.length > 0,
    customerId,
    business: {
      id: businessId,
      name: business.name,
      verification_status: business.verification_status,
      verification_provider: business.verification_provider,
      grid_customer_id: business.grid_customer_id,
      kyb_verified_at: business.kyb_verified_at,
    },
    members,
    turnkey: {
      provisioned: Boolean(subOrgId),
      subOrganizationId: subOrgId || null,
      daUserId: owner?.turnkey_da_user_id ?? null,
      walletOwnerId,
      walletAccounts: accounts,
      provisioningJobs: jobs,
      deposits,
      depositError,
    },
    grid: {
      error: gridError,
      customer: gridCustomer,
      internalAccounts: gridInternalAccounts.map((a) => {
        const row = a as Record<string, unknown>
        const balance = row.balance as Record<string, unknown> | undefined
        const currency = (balance?.currency as Record<string, unknown> | undefined)?.code
        return {
          id: row.id,
          status: row.status,
          currency,
          instructionCount: Array.isArray(row.fundingPaymentInstructions)
            ? row.fundingPaymentInstructions.length
            : 0,
        }
      }),
      externalAccounts: gridExternalAccounts.map((a) => {
        const row = a as Record<string, unknown>
        const info = (row.accountInfo ?? {}) as Record<string, unknown>
        return {
          id: row.id,
          currency: row.currency,
          status: row.status,
          platformAccountId: row.platformAccountId,
          ownershipType: row.ownershipType,
          accountType: info.accountType,
          assetType: info.assetType,
          address: info.address,
        }
      }),
      turnkeyExternalAccountLinked: matchingExternal.length > 0,
      matchingExternalAccounts: matchingExternal.map((a) => {
        const row = a as Record<string, unknown>
        const info = (row.accountInfo ?? {}) as Record<string, unknown>
        return {
          id: row.id,
          platformAccountId: row.platformAccountId,
          address: info.address,
          currency: row.currency,
          status: row.status,
        }
      }),
    },
    virtualAccounts: vas,
  }

  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
