import type { SupabaseClient } from "@supabase/supabase-js"
import type { WalletSendExecutionModel } from "./routing"

export const WALLET_SEND_QUOTE_TTL_MS = 15 * 60 * 1000

export type WalletSendSessionRow = {
  form_session_id: string
  user_id: string
  recipient_id: string
  source_balance_currency: string
  receive_asset: string
  receive_network: string
  destination_address: string
  receive_amount: number
  customer_rate: number
  lifi_mid: number
  lifi_floor: number
  total_debited: number
  margin_amount: number
  execution_model: WalletSendExecutionModel
  lifi_quote_id?: string | null
  status: string
  expires_at: string
}

function rowFromDb(data: Record<string, unknown>): WalletSendSessionRow {
  return {
    form_session_id: String(data.form_session_id),
    user_id: String(data.user_id),
    recipient_id: String(data.recipient_id),
    source_balance_currency: String(data.source_balance_currency),
    receive_asset: String(data.receive_asset),
    receive_network: String(data.receive_network),
    destination_address: String(data.destination_address),
    receive_amount: Number(data.receive_amount),
    customer_rate: Number(data.customer_rate),
    lifi_mid: Number(data.lifi_mid),
    lifi_floor: Number(data.lifi_floor),
    total_debited: Number(data.total_debited),
    margin_amount: Number(data.margin_amount),
    execution_model: data.execution_model as WalletSendExecutionModel,
    lifi_quote_id: data.lifi_quote_id == null ? null : String(data.lifi_quote_id),
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
    source_balance_currency: input.source_balance_currency,
    receive_asset: input.receive_asset,
    receive_network: input.receive_network,
    destination_address: input.destination_address,
    receive_amount: input.receive_amount,
    customer_rate: input.customer_rate,
    lifi_mid: input.lifi_mid,
    lifi_floor: input.lifi_floor,
    total_debited: input.total_debited,
    margin_amount: input.margin_amount,
    execution_model: input.execution_model,
    lifi_quote_id: input.lifi_quote_id ?? null,
    status: "quoted",
    expires_at: input.expires_at,
  })
  if (error) {
    throw new Error(`wallet_send_session_create_failed: ${error.message}`)
  }
}

export async function getWalletSendSession(
  admin: SupabaseClient,
  formSessionId: string,
  userId: string,
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
  if (row.status !== "quoted") return null
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
