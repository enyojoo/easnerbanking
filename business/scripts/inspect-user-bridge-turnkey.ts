/**
 * Read-only: KYC + Turnkey vaults + Bridge virtual accounts for one user.
 *
 *   cd business
 *   node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx \
 *     scripts/inspect-user-bridge-turnkey.ts <userId>
 */
import { createClient } from "@supabase/supabase-js"
import {
  bridgeVaSourceCurrency,
  isBridgeVaLinkedToTurnkeyVault,
  listBridgeVirtualAccounts,
} from "@/lib/bridge/virtual-accounts"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"

const userId = String(process.argv[2] ?? "").trim()
if (!userId) {
  console.error("Usage: tsx scripts/inspect-user-bridge-turnkey.ts <userId>")
  process.exit(1)
}

function prefix(value: string | null | undefined, n = 8): string | null {
  const s = String(value ?? "").trim()
  if (!s) return null
  return s.length <= n ? s : `${s.slice(0, n)}…`
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const hits: Record<string, unknown> = {}
  const { data: byId, error: userError } = await admin
    .from("users")
    .select(
      "id,email,full_name,verification_status,verification_provider,noah_kyc_status,noah_customer_id,bridge_customer_id,bridge_kyc_status,grid_customer_id,easner_business_id,kyc_verified_at,created_at,updated_at",
    )
    .eq("id", userId)
    .maybeSingle()
  if (userError) throw new Error(userError.message)
  hits.users_by_id = byId?.id ?? null

  const { data: byBridge } = await admin
    .from("users")
    .select("id,email,bridge_customer_id")
    .eq("bridge_customer_id", userId)
    .maybeSingle()
  hits.users_by_bridge_customer_id = byBridge?.id ?? null

  const { data: byNoah } = await admin
    .from("users")
    .select("id,email,noah_customer_id")
    .eq("noah_customer_id", userId)
    .maybeSingle()
  hits.users_by_noah_customer_id = byNoah?.id ?? null

  const { data: ownerById } = await admin
    .from("wallet_owners")
    .select("id,owner_type,owner_ref,turnkey_sub_organization_id")
    .eq("id", userId)
    .maybeSingle()
  hits.wallet_owners_by_id = ownerById ?? null

  const { data: ownerByRef } = await admin
    .from("wallet_owners")
    .select("id,owner_type,owner_ref")
    .eq("owner_ref", userId)
  hits.wallet_owners_by_owner_ref = ownerByRef ?? []

  const { data: ownerBySub } = await admin
    .from("wallet_owners")
    .select("id,owner_type,owner_ref")
    .eq("turnkey_sub_organization_id", userId)
    .maybeSingle()
  hits.wallet_owners_by_sub_org = ownerBySub ?? null

  const { data: biz } = await admin.from("businesses").select("id,name").eq("id", userId).maybeSingle()
  hits.businesses_by_id = biz ?? null

  const { data: vaByUser } = await admin
    .from("virtual_accounts")
    .select("id,provider,currency,user_id,business_id")
    .eq("user_id", userId)
  hits.virtual_accounts_by_user_id = vaByUser ?? []

  const { data: vaByProvider } = await admin
    .from("virtual_accounts")
    .select("id,provider,currency,user_id,business_id")
    .eq("provider_virtual_account_id", userId)
  hits.virtual_accounts_by_provider_va_id = vaByProvider ?? []

  const { data: kyc } = await admin.from("kyc_submissions").select("id,user_id").eq("id", userId).maybeSingle()
  hits.kyc_submissions_by_id = kyc ?? null

  let authUser: { id: string; email?: string } | null = null
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    authUser = data.user ? { id: data.user.id, email: data.user.email } : null
  } catch (e) {
    hits.auth_lookup_error = e instanceof Error ? e.message : String(e)
  }
  hits.auth_user = authUser

  const user = byId ?? (byBridge?.id
    ? (await admin.from("users").select(
        "id,email,full_name,verification_status,verification_provider,noah_kyc_status,noah_customer_id,bridge_customer_id,bridge_kyc_status,grid_customer_id,easner_business_id,kyc_verified_at,created_at,updated_at",
      ).eq("id", byBridge.id).maybeSingle()).data
    : null)

  if (!user) {
    console.log(JSON.stringify({ ok: false, error: "user_not_found", userId, hits }, null, 2))
    process.exit(1)
  }

  const easnerUserId = user.id
  const { data: owners } = await admin
    .from("wallet_owners")
    .select(
      "id,owner_type,owner_ref,kyc_status,noah_customer_id,turnkey_sub_organization_id,turnkey_da_user_id,created_at,updated_at",
    )
    .or(`owner_ref.eq.${easnerUserId},owner_ref.eq.${String(user.easner_business_id ?? "")}`)

  const individualOwnerId = await getWalletOwnerId(admin, "individual", easnerUserId)
  const businessId = String(user.easner_business_id ?? "").trim() || null
  const businessOwnerId = businessId ? await getWalletOwnerId(admin, "business", businessId) : null
  const walletOwnerId = individualOwnerId ?? businessOwnerId

  const { data: accounts } = walletOwnerId
    ? await admin
        .from("wallet_accounts")
        .select(
          "id,chain,asset,ledger_currency,address,associated_token_account_address,status,turnkey_wallet_id,turnkey_sub_organization_id,created_at,updated_at",
        )
        .eq("wallet_owner_id", walletOwnerId)
        .order("ledger_currency")
    : { data: null }

  const { data: jobs } = walletOwnerId
    ? await admin
        .from("wallet_provisioning_jobs")
        .select("id,ledger_currency,chain,asset,state,error,attempts,next_retry_at,created_at,updated_at")
        .eq("wallet_owner_id", walletOwnerId)
        .order("created_at")
    : { data: null }

  const { data: vas } = await admin
    .from("virtual_accounts")
    .select(
      "id,provider,currency,status,settlement_target,provider_virtual_account_id,provider_customer_id,account_number,iban,business_id,created_at,updated_at",
    )
    .eq("user_id", user.id)
    .order("currency")

  const usdc = (accounts ?? []).find(
    (a) => a.ledger_currency === "USD" && a.asset === "USDC" && a.status === "active",
  )
  const eurc = (accounts ?? []).find(
    (a) => a.ledger_currency === "EUR" && a.asset === "EURC" && a.status === "active",
  )

  const customerId = String(user.bridge_customer_id ?? "").trim()
  let bridgeVas: Awaited<ReturnType<typeof listBridgeVirtualAccounts>> = []
  let bridgeListError: string | null = null
  if (customerId) {
    try {
      bridgeVas = await listBridgeVirtualAccounts(customerId)
    } catch (e) {
      bridgeListError = e instanceof Error ? e.message : String(e)
    }
  }

  const destAddresses = bridgeVas
    .map((va) => String(va.destination?.address ?? "").trim())
    .filter(Boolean)

  const { data: destMatches } = destAddresses.length
    ? await admin
        .from("wallet_accounts")
        .select(
          "id,wallet_owner_id,chain,asset,ledger_currency,address,status,turnkey_wallet_id,turnkey_sub_organization_id",
        )
        .in("address", destAddresses)
    : { data: [] }

  const ownerIds = [...new Set((destMatches ?? []).map((r) => String(r.wallet_owner_id)))]
  const { data: destOwners } = ownerIds.length
    ? await admin
        .from("wallet_owners")
        .select("id,owner_type,owner_ref,turnkey_sub_organization_id")
        .in("id", ownerIds)
    : { data: [] }

  const { data: noahOwner } = await admin
    .from("wallet_owners")
    .select("id,owner_type,owner_ref,kyc_status,noah_customer_id,turnkey_sub_organization_id")
    .eq("noah_customer_id", String(user.noah_customer_id ?? "").trim())

  const { data: inbox } = await admin
    .from("event_inbox")
    .select("id,provider,event_id,event_type,status,error,created_at,processed_at")
    .eq("provider", "bridge")
    .or(`event_id.eq.${customerId},payload.cs.${JSON.stringify({ customer_id: customerId })}`)
    .order("created_at", { ascending: false })
    .limit(20)

  const { data: inboxText } = await admin
    .from("event_inbox")
    .select("id,provider,event_id,event_type,status,error,created_at")
    .eq("provider", "bridge")
    .ilike("event_id", `%${customerId}%`)
    .order("created_at", { ascending: false })
    .limit(20)

  const { data: inboxRecent } = await admin
    .from("event_inbox")
    .select("id,event_id,event_type,status,error,created_at,payload")
    .eq("provider", "bridge")
    .gte("created_at", "2026-09-15T00:00:00.000Z")
    .order("created_at", { ascending: false })
    .limit(50)

  const matchingInbox = (inboxRecent ?? []).filter((row) => {
    const s = JSON.stringify(row.payload ?? "")
    return s.includes(customerId) || s.includes(user.id)
  }).map((row) => ({
    id: row.id,
    event_id: row.event_id,
    event_type: row.event_type,
    status: row.status,
    error: row.error,
    created_at: row.created_at,
  }))

  const { data: noahVas } = await admin
    .from("virtual_accounts")
    .select("id,provider,currency,status,settlement_target,user_id")
    .eq("user_id", user.id)

  const usdcAddr = String(usdc?.address ?? "").trim()
  const eurcAddr = String(eurc?.address ?? "").trim()

  console.log(
    JSON.stringify(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name,
          verification_status: user.verification_status,
          verification_provider: user.verification_provider,
          noah_kyc_status: user.noah_kyc_status,
          noah_customer_id: prefix(user.noah_customer_id, 12),
          bridge_customer_id: prefix(user.bridge_customer_id, 12),
          bridge_kyc_status: user.bridge_kyc_status,
          grid_customer_id: prefix(user.grid_customer_id, 12),
          easner_business_id: user.easner_business_id,
          kyc_verified_at: user.kyc_verified_at,
          created_at: user.created_at,
        },
        wallet_owners: (owners ?? []).map((o) => ({
          id: o.id,
          owner_type: o.owner_type,
          owner_ref: o.owner_ref,
          kyc_status: o.kyc_status,
          has_sub_org: Boolean(String(o.turnkey_sub_organization_id ?? "").trim()),
          sub_org_prefix: prefix(o.turnkey_sub_organization_id, 10),
          has_da_user: Boolean(String(o.turnkey_da_user_id ?? "").trim()),
        })),
        resolved_wallet_owner_id: walletOwnerId,
        wallet_accounts: (accounts ?? []).map((a) => ({
          ledger: a.ledger_currency,
          asset: a.asset,
          chain: a.chain,
          status: a.status,
          address_prefix: prefix(a.address, 8),
          ata_prefix: prefix(a.associated_token_account_address, 8),
          has_turnkey_wallet_id: Boolean(String(a.turnkey_wallet_id ?? "").trim()),
          wallet_id_prefix: prefix(a.turnkey_wallet_id, 10),
          created_at: a.created_at,
        })),
        turnkey_ready: { usd: Boolean(usdcAddr), eur: Boolean(eurcAddr) },
        provisioning_jobs: jobs ?? [],
        local_virtual_accounts: (vas ?? []).map((v) => ({
          provider: v.provider,
          currency: v.currency,
          status: v.status,
          settlement_target: v.settlement_target,
          has_account_number: Boolean(v.account_number),
          has_iban: Boolean(v.iban),
          va_id_prefix: prefix(v.provider_virtual_account_id, 10),
          business_id: v.business_id,
        })),
        bridge: {
          listed: Boolean(customerId),
          list_error: bridgeListError,
          va_count: bridgeVas.length,
          vas: bridgeVas.map((va) => {
            const source = bridgeVaSourceCurrency(va)
            const destAddr = String(va.destination?.address ?? "").trim()
            const destCurrency = String(va.destination?.currency ?? "").trim().toLowerCase()
            return {
              id_prefix: prefix(va.id, 10),
              status: va.status ?? null,
              source,
              dest_currency: destCurrency || null,
              dest_rail: va.destination?.payment_rail ?? null,
              dest_prefix: prefix(destAddr, 8),
              instruction_keys: Object.keys(va.source_deposit_instructions ?? {}),
              has_account_number: Boolean(
                String(va.source_deposit_instructions?.account_number ?? "").trim(),
              ),
              has_bank_account_number: Boolean(
                String(va.source_deposit_instructions?.bank_account_number ?? "").trim(),
              ),
              has_iban: Boolean(String(va.source_deposit_instructions?.iban ?? "").trim()),
              linked_to_user_usdc:
                Boolean(usdcAddr) &&
                isBridgeVaLinkedToTurnkeyVault(va, { vaultAddress: usdcAddr, destCurrency: "usdc" }),
              linked_to_user_eurc:
                Boolean(eurcAddr) &&
                isBridgeVaLinkedToTurnkeyVault(va, { vaultAddress: eurcAddr, destCurrency: "eurc" }),
              dest_equals_usdc: Boolean(usdcAddr) && destAddr === usdcAddr,
              dest_equals_eurc: Boolean(eurcAddr) && destAddr === eurcAddr,
              dest_address: destAddr,
            }
          }),
        },
        dest_in_wallet_accounts: (destMatches ?? []).map((a) => ({
          ledger: a.ledger_currency,
          asset: a.asset,
          status: a.status,
          address_prefix: prefix(a.address, 8),
          wallet_owner_id: a.wallet_owner_id,
          sub_org_prefix: prefix(a.turnkey_sub_organization_id, 10),
        })),
        dest_wallet_owners: destOwners ?? [],
        wallet_owners_by_noah_customer_id: noahOwner ?? [],
        event_inbox_or: inbox ?? [],
        event_inbox_ilike: inboxText ?? [],
        event_inbox_today_matching: matchingInbox,
        all_local_vas: noahVas ?? [],
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
