/**
 * Retarget Bridge USD/EUR virtual accounts to this subject's Turnkey USDC/EURC vaults.
 * Usage: npx tsx --env-file=.env.local scripts/retarget-bridge-user-vas.ts <userId|bridgeCustomerId> [virtualAccountOrRouteId]
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getBridgeCustomer } from "@/lib/bridge/kyc-links"
import { bridgeFetch } from "@/lib/bridge/http"
import {
  bridgeVaSourceCurrency,
  isBridgeVaLinkedToTurnkeyVault,
  listBridgeVirtualAccounts,
  updateBridgeVirtualAccountDestination,
  type BridgeVirtualAccount,
} from "@/lib/bridge/virtual-accounts"
import { provisionBridgeVirtualAccounts } from "@/lib/bridge/provision-after-approval"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"

const subjectId = String(process.argv[2] ?? "").trim()
const routeId = String(process.argv[3] ?? "").trim()
if (!subjectId) {
  console.error("Usage: tsx scripts/retarget-bridge-user-vas.ts <userId|bridgeCustomerId> [vaOrRouteId]")
  process.exit(1)
}

function prefix(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim()
  return s ? `${s.slice(0, 6)}…` : null
}

async function resolveSubject() {
  const admin = createSupabaseAdmin()
  const { data: byUser } = await admin
    .from("users")
    .select("id,bridge_customer_id,easner_business_id")
    .eq("id", subjectId)
    .maybeSingle()
  if (byUser?.id) {
    return {
      admin,
      userId: byUser.id,
      businessId: String(byUser.easner_business_id ?? "").trim() || null,
      customerId: String(byUser.bridge_customer_id ?? "").trim(),
    }
  }
  const { data: byBridgeUser } = await admin
    .from("users")
    .select("id,bridge_customer_id,easner_business_id")
    .eq("bridge_customer_id", subjectId)
    .maybeSingle()
  if (byBridgeUser?.id) {
    return {
      admin,
      userId: byBridgeUser.id,
      businessId: String(byBridgeUser.easner_business_id ?? "").trim() || null,
      customerId: String(byBridgeUser.bridge_customer_id ?? "").trim(),
    }
  }
  const { data: byBridgeBiz } = await admin
    .from("businesses")
    .select("id,bridge_customer_id")
    .eq("bridge_customer_id", subjectId)
    .maybeSingle()
  if (byBridgeBiz?.id) {
    const { data: owner } = await admin
      .from("users")
      .select("id")
      .eq("easner_business_id", byBridgeBiz.id)
      .maybeSingle()
    return {
      admin,
      userId: String(owner?.id ?? "").trim(),
      businessId: byBridgeBiz.id,
      customerId: String(byBridgeBiz.bridge_customer_id ?? "").trim(),
    }
  }
  const remote = await getBridgeCustomer(subjectId).catch(() => null)
  return {
    admin,
    userId: "",
    businessId: null as string | null,
    customerId: String(remote?.id ?? "").trim(),
  }
}

async function loadVault(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  businessId: string | null,
  asset: "USDC" | "EURC",
): Promise<string> {
  if (!userId) return ""
  const ownerType = businessId ? "business" : "individual"
  const ownerRef = businessId ?? userId
  const walletOwnerId = await getWalletOwnerId(admin, ownerType, ownerRef)
  if (!walletOwnerId) return ""
  const ledger = asset === "EURC" ? "EUR" : "USD"
  const { data } = await admin
    .from("wallet_accounts")
    .select("address")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("ledger_currency", ledger)
    .eq("asset", asset)
    .eq("status", "active")
    .maybeSingle()
  return String(data?.address ?? "").trim()
}

async function maybeLoadRoute(customerId: string): Promise<Record<string, unknown> | null> {
  if (!routeId) return null
  const asVa = await bridgeFetch<BridgeVirtualAccount>({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}/virtual_accounts/${encodeURIComponent(routeId)}`,
  }).catch(() => null)
  if (asVa?.id) return { kind: "virtual_account", id: asVa.id, dest: asVa.destination }
  const asTransfer = await bridgeFetch<Record<string, unknown>>({
    method: "GET",
    path: `/transfers/${encodeURIComponent(routeId)}`,
  }).catch(() => null)
  if (asTransfer?.id) {
    return {
      kind: "transfer",
      id: asTransfer.id,
      static_template: Boolean((asTransfer.features as { static_template?: boolean } | undefined)?.static_template),
      dest: asTransfer.destination ?? null,
    }
  }
  return { kind: "unknown", id: routeId }
}

async function main() {
  const subject = await resolveSubject()
  console.log(
    JSON.stringify({
      user_found: Boolean(subject.userId),
      org_found: Boolean(subject.businessId),
      has_bridge_customer: Boolean(subject.customerId),
    }),
  )
  if (!subject.customerId) {
    console.error("No Bridge customer for this id in local DB or Bridge API")
    process.exit(2)
  }

  const usdc = await loadVault(subject.admin, subject.userId, subject.businessId, "USDC")
  const eurc = await loadVault(subject.admin, subject.userId, subject.businessId, "EURC")
  const listed = await listBridgeVirtualAccounts(subject.customerId)
  const route = await maybeLoadRoute(subject.customerId)
  console.log(
    JSON.stringify({
      va_count: listed.length,
      vas: listed.map((va) => ({
        source: bridgeVaSourceCurrency(va),
        dest_currency: va.destination?.currency ?? null,
        dest_rail: va.destination?.payment_rail ?? null,
        dest_prefix: prefix(va.destination?.address),
        matches_usdc: Boolean(usdc) && va.destination?.address === usdc,
        matches_eurc: Boolean(eurc) && va.destination?.address === eurc,
      })),
      turnkey: { usdc: Boolean(usdc), eurc: Boolean(eurc) },
      route,
    }),
  )

  if (!subject.userId) {
    console.error("Bridge customer found but no local user/org — cannot read Turnkey vaults")
    process.exit(3)
  }

  const vas = await provisionBridgeVirtualAccounts({
    admin: subject.admin,
    userId: subject.userId,
    businessId: subject.businessId,
    customerId: subject.customerId,
  })

  if (route?.kind === "virtual_account" && route.id) {
    const source = listed.find((va) => va.id === route.id)
    const currency = source ? bridgeVaSourceCurrency(source) : null
    const destCurrency = currency === "eur" ? "eurc" : "usdc"
    const vaultAddress = destCurrency === "eurc" ? eurc : usdc
    if (vaultAddress && destCurrency === "eurc") {
      const updated = await updateBridgeVirtualAccountDestination({
        customerId: subject.customerId,
        virtualAccountId: String(route.id),
        destCurrency,
        vaultAddress,
      })
      console.log(
        JSON.stringify({
          route_retargeted: isBridgeVaLinkedToTurnkeyVault(updated, { vaultAddress, destCurrency }),
          dest_currency: destCurrency,
        }),
      )
    }
  }

  console.log(JSON.stringify({ provisioned: vas }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
