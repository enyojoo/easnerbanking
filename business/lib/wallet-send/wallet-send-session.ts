import type { SupabaseClient } from "@supabase/supabase-js"
import type { WalletSendExecutionModel } from "./routing"

export const WALLET_SEND_QUOTE_TTL_MS = 15 * 60 * 1000

export type WalletSendSessionRow = {
  form_session_id: string
  user_id: string
  recipient_id: string | null
  destination_ref: string
  source_balance_currency: string
  receive_asset: string
  receive_network: string
  destination_address: string
  receive_amount: number
  customer_rate: number
  relay_mid: number
  relay_floor: number
  total_debited: number
  margin_amount: number
  execution_model: WalletSendExecutionModel
  relay_quote_id?: string | null
  relay_from_amount_raw?: string | null
  status: string
  expires_at: string
}

function rowFromDb(data: Record<string, unknown>): WalletSendSessionRow {
  return {
    form_session_id: String(data.form_session_id),
    user_id: String(data.user_id),
    recipient_id: data.recipient_id == null ? null : String(data.recipient_id),
    destination_ref:
      String(data.destination_ref || "").trim() ||
      (data.recipient_id == null ? "" : `recipient:${String(data.recipient_id)}`),
    source_balance_currency: String(data.source_balance_currency),
    receive_asset: String(data.receive_asset),
    receive_network: String(data.receive_network),
    destination_address: String(data.destination_address),
    receive_amount: Number(data.receive_amount),
    customer_rate: Number(data.customer_rate),
    relay_mid: Number(data.relay_mid ?? 1),
    relay_floor: Number(data.relay_floor ?? 0),
    total_debited: Number(data.total_debited),
    margin_amount: Number(data.margin_amount),
    execution_model: data.execution_model as WalletSendExecutionModel,
    relay_quote_id: data.relay_quote_id == null ? null : String(data.relay_quote_id),
    relay_from_amount_raw:
      data.relay_from_amount_raw == null ? null : String(data.relay_from_amount_raw),
    status: String(data.status),
    expires_at: String(data.expires_at),
  }
}

export async function createWalletSendSession(
  admin: SupabaseClient,
  input: Omit<WalletSendSessionRow, "status">,
): Promise<void> {
  const { error } = await admin.from("wallet_send_sessions").upsert({
    form_session_id: input.form_session_id,
    user_id: input.user_id,
    recipient_id: input.recipient_id,
    destination_ref: input.destination_ref,
    source_balance_currency: input.source_balance_currency,
    receive_asset: input.receive_asset,
    receive_network: input.receive_network,
    destination_address: input.destination_address,
    receive_amount: input.receive_amount,
    customer_rate: input.customer_rate,
    relay_mid: input.relay_mid,
    relay_floor: input.relay_floor,
    total_debited: input.total_debited,
    margin_amount: input.margin_amount,
    execution_model: input.execution_model,
    relay_quote_id: input.relay_quote_id ?? null,
    relay_from_amount_raw: input.relay_from_amount_raw ?? null,
    status: "quoted",
    expires_at: input.expires_at,
  })
  if (error) {
    throw new Error(`wallet_send_session_create_failed: ${error.message}`)
  }
}

export async function lockWalletSendSession(
  admin: SupabaseClient,
  formSessionId: string,
  userId: string,
): Promise<WalletSendSessionRow | null> {
  const row = await getWalletSendSession(admin, formSessionId, userId, { allowQuoted: true })
  if (!row) return null
  if (row.status === "locked") return row
  const { error } = await admin
    .from("wallet_send_sessions")
    .update({ status: "locked" })
    .eq("form_session_id", formSessionId)
    .eq("user_id", userId)
    .eq("status", "quoted")
  if (error) return null
  return { ...row, status: "locked" }
}

export async function getWalletSendSession(
  admin: SupabaseClient,
  formSessionId: string,
  userId: string,
  opts?: { allowQuoted?: boolean; allowExecuted?: boolean },
): Promise<WalletSendSessionRow | null> {
  const { data, error } = await admin
    .from("wallet_send_sessions")
    .select("*")
    .eq("form_session_id", formSessionId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[wallet_send_session] lookup failed", {
      formSessionId,
      userId,
      error: error.message,
    })
    return null
  }
  if (!data) return null

  const row = rowFromDb(data as Record<string, unknown>)
  const allowed =
    row.status === "locked" ||
    (opts?.allowQuoted && row.status === "quoted") ||
    ((opts as { allowExecuted?: boolean } | undefined)?.allowExecuted && row.status === "executed")
  if (!allowed) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) return null
  return row
}

export async function markWalletSendSessionExecuted(
  admin: SupabaseClient,
  formSessionId: string,
): Promise<void> {
  const { error } = await admin
    .from("wallet_send_sessions")
    .update({ status: "executed" })
    .eq("form_session_id", formSessionId)
  if (error) {
    console.error("[wallet_send_session] mark executed failed", {
      formSessionId,
      error: error.message,
    })
  }
}
