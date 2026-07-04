import type { SupabaseClient } from "@supabase/supabase-js"

export type DepositSplitJobStatus =
  | "pending"
  | "send_submitted"
  | "completed"
  | "failed"
  | "dry_run"

export type DepositSplitJobRow = {
  id: string
  rule_execution_id: string
  user_id: string
  business_id: string | null
  pay_in_transaction_id: string | null
  fiat_amount: number
  fiat_currency: string
  noah_channel_fee: number | null
  customer_fee: number
  easner_margin: number | null
  user_net: number
  omnibus_received: number | null
  ledger_currency: string
  status: DepositSplitJobStatus
  omnibus_inbound_tx_hash: string | null
  user_vault_send_id: string | null
  margin_send_id: string | null
  user_vault_tx_hash: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type EnqueueDepositSplitJobInput = {
  ruleExecutionId: string
  userId: string
  businessId: string | null
  payInTransactionId?: string | null
  fiatAmount: number
  fiatCurrency: string
  noahChannelFee: number | null
  customerFee: number
  easnerMargin: number | null
  userNet: number
  omnibusReceived: number | null
  ledgerCurrency: "USD" | "EUR"
  omnibusInboundTxHash?: string | null
  status?: DepositSplitJobStatus
}

export async function enqueueDepositSplitJob(
  admin: SupabaseClient,
  input: EnqueueDepositSplitJobInput,
): Promise<{ job: DepositSplitJobRow | null; inserted: boolean }> {
  const ruleExecutionId = String(input.ruleExecutionId || "").trim()
  if (!ruleExecutionId) return { job: null, inserted: false }

  const row = {
    rule_execution_id: ruleExecutionId,
    user_id: input.userId,
    business_id: input.businessId,
    pay_in_transaction_id: input.payInTransactionId ?? null,
    fiat_amount: input.fiatAmount,
    fiat_currency: input.fiatCurrency,
    noah_channel_fee: input.noahChannelFee,
    customer_fee: input.customerFee,
    easner_margin: input.easnerMargin,
    user_net: input.userNet,
    omnibus_received: input.omnibusReceived,
    ledger_currency: input.ledgerCurrency,
    status: input.status ?? "pending",
    omnibus_inbound_tx_hash: input.omnibusInboundTxHash ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data: inserted, error: insertError } = await admin
    .from("deposit_split_jobs")
    .insert(row)
    .select("*")
    .maybeSingle()

  if (!insertError && inserted) {
    return { job: inserted as DepositSplitJobRow, inserted: true }
  }

  const { data: existing } = await admin
    .from("deposit_split_jobs")
    .select("*")
    .eq("rule_execution_id", ruleExecutionId)
    .maybeSingle()

  return { job: (existing as DepositSplitJobRow | null) ?? null, inserted: false }
}

export async function updateDepositSplitJob(
  admin: SupabaseClient,
  id: string,
  patch: Partial<{
    status: DepositSplitJobStatus
    user_vault_send_id: string | null
    margin_send_id: string | null
    user_vault_tx_hash: string | null
    omnibus_inbound_tx_hash: string | null
    error_message: string | null
    easner_margin: number | null
    omnibus_received: number | null
  }>,
): Promise<void> {
  await admin
    .from("deposit_split_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
}

export async function findDepositSplitJobByRuleExecutionId(
  admin: SupabaseClient,
  ruleExecutionId: string,
): Promise<DepositSplitJobRow | null> {
  const id = String(ruleExecutionId || "").trim()
  if (!id) return null
  const { data } = await admin
    .from("deposit_split_jobs")
    .select("*")
    .eq("rule_execution_id", id)
    .maybeSingle()
  return (data as DepositSplitJobRow | null) ?? null
}

export async function listStuckDepositSplitJobs(
  admin: SupabaseClient,
  opts: { limit?: number; olderThanMs?: number } = {},
): Promise<DepositSplitJobRow[]> {
  const limit = opts.limit ?? 25
  const olderThanMs = opts.olderThanMs ?? 90_000
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()
  const { data } = await admin
    .from("deposit_split_jobs")
    .select("*")
    .in("status", ["pending", "send_submitted"])
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit)
  return (data as DepositSplitJobRow[]) ?? []
}
