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

const memorySessions = new Map<string, WalletSendSessionRow & { created_at: string }>()

export async function createWalletSendSession(
  _admin: SupabaseClient,
  input: Omit<WalletSendSessionRow, "status">,
): Promise<void> {
  memorySessions.set(input.form_session_id, {
    ...input,
    status: "quoted",
    created_at: new Date().toISOString(),
  })
}

export async function getWalletSendSession(
  _admin: SupabaseClient,
  formSessionId: string,
  userId: string,
): Promise<WalletSendSessionRow | null> {
  const row = memorySessions.get(formSessionId)
  if (!row || row.user_id !== userId) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) return null
  return row
}

export async function markWalletSendSessionExecuted(formSessionId: string): Promise<void> {
  const row = memorySessions.get(formSessionId)
  if (row) row.status = "executed"
}
