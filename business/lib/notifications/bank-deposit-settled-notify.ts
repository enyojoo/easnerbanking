import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isBankOnrampDepositFlow,
  isVerificationDepositMetadata,
  isYcFundBalanceDepositMetadata,
} from "@easner/shared"
import { dispatchTransactionNotification } from "@/lib/notifications/dispatch"
import { normalizeDirection } from "@/lib/ledger/transactions"

/**
 * Funding bank deposits: defer settled push until funds are on-chain in the user vault.
 * Verification microdeposits settle at fiat leg only – push immediately from ledger upsert.
 */
export function shouldDeferBankDepositSettledPush(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const meta = metadata as Record<string, unknown>
  if (isYcFundBalanceDepositMetadata(meta)) return true
  if (!isBankOnrampDepositFlow(meta)) return false
  return !isVerificationDepositMetadata(meta)
}

async function dispatchFundBalanceSettledPush(
  admin: SupabaseClient,
  transactionId: string,
  provider: "noah" | "yellowcard" | "grid" | "bridge",
): Promise<void> {
  const id = String(transactionId || "").trim()
  if (!id) return

  const { data: row, error } = await admin
    .from("transactions")
    .select("id,user_id,status,amount,currency,direction,metadata,payload,provider")
    .eq("id", id)
    .maybeSingle()
  if (error || !row?.id) return

  if (String(row.status ?? "").toLowerCase() !== "settled") return
  if (String(row.provider ?? "").toLowerCase() !== provider) return

  const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
  if (!shouldDeferBankDepositSettledPush(meta)) return
  if (!meta.on_chain_settled_at) return

  const userId = String(row.user_id ?? "").trim()
  if (!userId) return

  const etid =
    typeof meta.easner_transaction_id === "string" ? meta.easner_transaction_id.trim() : undefined

  await dispatchTransactionNotification(admin, {
    userId,
    transactionId: id,
    provider,
    direction: normalizeDirection(String(row.direction ?? "")),
    amount: typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
    currency: String(row.currency ?? "USD"),
    metadata: meta,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    outcome: "success",
    easnerTransactionId: etid,
  }).catch((e) => console.warn("bank deposit settled notification (non-fatal):", e))
}

/** Send settled push + email for Noah bank pay-in after `on_chain_settled_at` is known. */
export async function notifyBankDepositPayInSettledPush(
  admin: SupabaseClient,
  transactionId: string,
): Promise<void> {
  await dispatchFundBalanceSettledPush(admin, transactionId, "noah")
}

/** Send settled push + email for YC fund balance after user vault inbound settles. */
export async function notifyYcFundBalanceSettledPush(
  admin: SupabaseClient,
  transactionId: string,
): Promise<void> {
  await dispatchFundBalanceSettledPush(admin, transactionId, "yellowcard")
}

/** Send settled push + email for Grid VA bank pay-in after on-chain settlement. */
export async function notifyGridBankDepositPayInSettledPush(
  admin: SupabaseClient,
  transactionId: string,
): Promise<void> {
  await dispatchFundBalanceSettledPush(admin, transactionId, "grid")
}
