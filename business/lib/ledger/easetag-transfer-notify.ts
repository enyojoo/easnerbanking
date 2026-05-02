import type { SupabaseClient } from "@supabase/supabase-js"
import { buildTransactionSettledPushContent } from "@/lib/notifications/transaction-settled-content"
import { sendTransactionSettledPush } from "@/lib/notifications/expo-push"
import { normalizeDirection } from "@/lib/ledger/transactions"

/**
 * Easetag P2P rows are inserted by SQL RPC (not {@link upsertLedgerTransaction}), so settlement
 * pushes must be triggered from the API after a successful transfer.
 */
export async function notifyEasetagTransferSettled(
  admin: SupabaseClient,
  input: {
    idempotent: boolean
    debitProviderTransactionId: string
    creditProviderTransactionId: string
  },
): Promise<void> {
  if (input.idempotent) return

  const sel = "id,user_id,provider,metadata,payload,amount,currency,direction,status"
  const [debitRes, creditRes] = await Promise.all([
    admin
      .from("transactions")
      .select(sel)
      .eq("provider", "easner_internal")
      .eq("provider_transaction_id", input.debitProviderTransactionId)
      .maybeSingle(),
    admin
      .from("transactions")
      .select(sel)
      .eq("provider", "easner_internal")
      .eq("provider_transaction_id", input.creditProviderTransactionId)
      .maybeSingle(),
  ])

  if (debitRes.error) throw debitRes.error
  if (creditRes.error) throw creditRes.error

  const rows = [debitRes.data, creditRes.data].filter(Boolean) as Record<string, unknown>[]

  for (const row of rows) {
    if (String(row.status ?? "").toLowerCase() !== "settled") continue
    const dir = normalizeDirection(String(row.direction ?? ""))
    const amount = typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
    const currency = String(row.currency ?? "USD")
    const provider = String(row.provider ?? "easner_internal")
    const meta = row.metadata as Record<string, unknown> | null | undefined
    const payload = row.payload as Record<string, unknown> | null | undefined
    const { title, body } = buildTransactionSettledPushContent({
      provider,
      direction: dir,
      amount,
      currency,
      metadata: meta ?? null,
      payload: payload ?? null,
    })
    const id = String(row.id ?? "").trim()
    const uid = String(row.user_id ?? "").trim()
    if (!id || !uid) continue
    await sendTransactionSettledPush(admin, {
      userId: uid,
      transactionId: id,
      title,
      body,
      data: { type: "transaction_settled", transactionId: id },
    }).catch((e) => console.warn("easetag settled push (non-fatal):", e))
  }
}
