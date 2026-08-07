import type { SupabaseClient } from "@supabase/supabase-js"
import { isRelayTronInboundEnabled } from "@/lib/relay/config"
import { relayDepositLedgerCreditExists } from "./settle-relay-deposit"

export type RelayDepositSuppression = {
  relayDepositId?: string
  tronAddress?: string
  recipientVaultAta?: string
  reason: "fill_hash" | "relay_ledger" | "relay_vault_inbound" | "pending_deposit"
}

function applyOwnerScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  scope: { userId: string; businessId: string | null },
): T {
  if (scope.businessId) return query.eq("business_id", scope.businessId)
  return query.eq("user_id", scope.userId).is("business_id", null)
}

async function ownerMatches(
  admin: SupabaseClient,
  walletOwnerId: string,
  input: { userId: string; businessId: string | null },
): Promise<boolean> {
  const { data: owner } = await admin
    .from("wallet_owners")
    .select("owner_type, owner_ref")
    .eq("id", walletOwnerId)
    .maybeSingle()
  if (!owner) return false
  if (input.businessId) {
    return owner.owner_type === "business" && String(owner.owner_ref) === input.businessId
  }
  return owner.owner_type === "individual" && String(owner.owner_ref) === input.userId
}

/** Suppress duplicate Turnkey inbound credit for Relay Tron settlement fills. */
export async function findRelayDepositChainSettlementForSuppression(
  admin: SupabaseClient,
  input: {
    txHash: string
    userId: string
    businessId: string | null
    inboundAmount?: number
    recipientVaultAta?: string | null
    asset?: string
    chain?: string
  },
): Promise<RelayDepositSuppression | null> {
  if (!isRelayTronInboundEnabled()) return null

  const txHash = String(input.txHash || "").trim()
  if (!txHash) return null

  if (await relayDepositLedgerCreditExists(admin, input)) {
    return { reason: "relay_ledger" }
  }

  const { data: byHash } = await admin
    .from("relay_deposits")
    .select("id, wallet_owner_id, status, turnkey_tx_hash")
    .eq("turnkey_tx_hash", txHash)
    .in("status", ["pending", "awaiting_turnkey", "settled"])
    .limit(1)
    .maybeSingle()

  if (byHash?.id && (await ownerMatches(admin, String(byHash.wallet_owner_id), input))) {
    return {
      relayDepositId: String(byHash.id),
      reason: "fill_hash",
    }
  }

  let ledgerQ = admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "relay")
    .eq("direction", "in")
    .eq("tx_hash", txHash)
  ledgerQ = applyOwnerScope(ledgerQ, input)
  const { data: relayLedger } = await ledgerQ.maybeSingle()
  if (relayLedger?.id) {
    return { reason: "relay_ledger" }
  }

  const ata = String(input.recipientVaultAta || "").trim()
  const asset = String(input.asset || "").toUpperCase()
  const chain = String(input.chain || "").toLowerCase()

  if (ata && asset === "USDC" && chain.includes("sol")) {
    const { data: addrRow } = await admin
      .from("relay_deposit_addresses")
      .select("wallet_owner_id, tron_address, recipient_vault_ata")
      .eq("recipient_vault_ata", ata)
      .eq("status", "active")
      .maybeSingle()

    if (
      addrRow?.wallet_owner_id &&
      (await ownerMatches(admin, String(addrRow.wallet_owner_id), input))
    ) {
      return {
        tronAddress: String(addrRow.tron_address),
        recipientVaultAta: ata,
        reason: "relay_vault_inbound",
      }
    }
  }

  const inboundAmount = Number(input.inboundAmount ?? NaN)
  if (Number.isFinite(inboundAmount) && inboundAmount > 0) {
    const { data: pending } = await admin
      .from("relay_deposits")
      .select("id, wallet_owner_id, on_chain_usdc, posted_amount")
      .in("status", ["pending", "awaiting_turnkey"])
      .is("ledger_tx_id", null)
      .order("updated_at", { ascending: false })
      .limit(20)

    for (const row of pending ?? []) {
      if (!(await ownerMatches(admin, String(row.wallet_owner_id), input))) continue
      const expected = Number(row.on_chain_usdc ?? row.posted_amount ?? NaN)
      if (!Number.isFinite(expected)) continue
      if (Math.abs(expected - inboundAmount) <= 0.02) {
        return {
          relayDepositId: String(row.id),
          reason: "pending_deposit",
        }
      }
    }
  }

  return null
}
