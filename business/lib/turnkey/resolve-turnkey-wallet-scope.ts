import type { SupabaseClient } from "@supabase/supabase-js"

export type ResolvedTurnkeyWalletScope = {
  userId: string
  businessId: string | null
  walletAccount: {
    id: string
    wallet_owner_id: string
    address: string
    asset: string
    chain: string
    associated_token_account_address: string | null
  }
  walletAddress: string
  tokenAccountAddress: string
}

function collectAddressCandidates(event: Record<string, unknown>): {
  toCandidates: Set<string>
  fromCandidates: Set<string>
  all: string[]
} {
  const collect = (keys: string[]) => {
    const out = new Set<string>()
    const walk = (value: unknown) => {
      if (!value || typeof value !== "object") return
      if (Array.isArray(value)) {
        for (const item of value) walk(item)
        return
      }
      const obj = value as Record<string, unknown>
      for (const key of keys) {
        const v = obj[key]
        if (v != null && String(v).trim()) out.add(String(v).trim())
      }
      for (const v of Object.values(obj)) walk(v)
    }
    walk(event)
    return out
  }

  const toCandidates = collect(["toAddress", "destinationAddress", "recipientAddress", "accountAddress"])
  const fromCandidates = collect(["fromAddress", "sourceAddress", "senderAddress"])
  const generic = collect(["walletAddress", "address"])
  const all = [...new Set([...toCandidates, ...fromCandidates, ...generic])]
  return { toCandidates, fromCandidates, all }
}

/** Match Turnkey webhook / balance payload addresses to an active wallet account + ledger owner. */
export async function resolveTurnkeyWalletScopeFromEvent(
  admin: SupabaseClient,
  event: Record<string, unknown>,
): Promise<ResolvedTurnkeyWalletScope | null> {
  const { toCandidates, fromCandidates, all: addressCandidates } = collectAddressCandidates(event)
  if (!addressCandidates.length) return null

  const select =
    "id, wallet_owner_id, address, asset, chain, associated_token_account_address" as const
  type Row = {
    id: string
    wallet_owner_id: string
    address: string
    asset: string
    chain: string
    associated_token_account_address: string | null
  }

  const [{ data: byOwner }, { data: byAta }] = await Promise.all([
    admin.from("wallet_accounts").select(select).eq("status", "active").in("address", addressCandidates).limit(10),
    admin
      .from("wallet_accounts")
      .select(select)
      .eq("status", "active")
      .in("associated_token_account_address", addressCandidates)
      .limit(10),
  ])

  const merged = new Map<string, Row>()
  for (const row of [...(byOwner ?? []), ...(byAta ?? [])]) {
    const r = row as Row
    merged.set(`${r.wallet_owner_id}:${r.id}`, r)
  }
  const walletAccounts = [...merged.values()]
  if (!walletAccounts.length) return null

  const walletAccount =
    walletAccounts.find((row) => {
      const o = String(row.address || "").trim()
      const a = String(row.associated_token_account_address || "").trim()
      return toCandidates.has(o) || (a && toCandidates.has(a))
    }) ||
    walletAccounts.find((row) => {
      const o = String(row.address || "").trim()
      const a = String(row.associated_token_account_address || "").trim()
      return fromCandidates.has(o) || (a && fromCandidates.has(a))
    }) ||
    walletAccounts[0]

  if (!walletAccount?.wallet_owner_id) return null
  const walletAddress = String(walletAccount.address || "").trim()
  if (!walletAddress) return null
  const tokenAccountAddress = String(walletAccount.associated_token_account_address || "").trim()

  const { data: owner } = await admin
    .from("wallet_owners")
    .select("owner_type, owner_ref")
    .eq("id", walletAccount.wallet_owner_id)
    .maybeSingle()
  if (!owner?.owner_ref || !owner?.owner_type) return null

  let userId: string | null = null
  let businessId: string | null = null
  if (owner.owner_type === "business") {
    businessId = String(owner.owner_ref)
    const { data: orgOwner } = await admin
      .from("users")
      .select("id")
      .eq("easner_business_id", businessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    userId = orgOwner?.id ? String(orgOwner.id) : null
  } else {
    userId = String(owner.owner_ref)
  }
  if (!userId) return null

  return {
    userId,
    businessId,
    walletAccount,
    walletAddress,
    tokenAccountAddress,
  }
}
