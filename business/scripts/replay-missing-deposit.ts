import { createClient } from "@supabase/supabase-js"
import { parseTurnkeyBalanceWebhookPayload } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { turnkeyBalanceDepositProviderTransactionId } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"
import { inboundHashHasVisibleLedgerCredit } from "@/lib/turnkey/inbound-hash-visible-ledger"
import { withOrganicStablecoinDepositMetadata } from "@/lib/turnkey/organic-stablecoin-deposit-metadata"
import { generateTransactionId } from "@/lib/transaction-id"
import { buildWalletReportingSnapshot } from "@/lib/transactions/reporting-snapshot"

const APPLY = process.argv.includes("--apply")
const REPAIR = process.argv.includes("--repair")
const SKIP_BALANCE = process.argv.includes("--skip-balance")
const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"))
const HASH =
  positional[0] ??
  "2mLaZ6X9GsXUiRRA9MyJMVDwEDZGkWwVmRkkvv4nXZkyUZLuR6jGPyaKhf27NB9Mdz9EZ4FwL5uasbGFqepmxtqB"

function ledgerAmountFields(amount: number, currency: string) {
  const normalized = currency.trim().toUpperCase() || "USD"
  const baseCurrency = normalized
  const abs = Math.abs(amount)
  const baseAmount = normalized === baseCurrency ? abs : abs
  return { baseCurrency, baseAmount }
}

function completeLedgerMetadata(
  amount: number,
  currency: string,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const easnerTransactionId = generateTransactionId()
  return withOrganicStablecoinDepositMetadata({
    ...base,
    easner_transaction_id: easnerTransactionId,
    ...buildWalletReportingSnapshot({ amount, currency, fxRates: [] }),
  })
}

async function repairIncompleteTurnkeyRow(
  admin: ReturnType<typeof createClient>,
  txHash: string,
): Promise<void> {
  let q = admin
    .from("transactions")
    .select("id,amount,currency,metadata,base_amount,easner_transaction_id")
    .eq("provider", "turnkey")
    .eq("tx_hash", txHash)
    .eq("direction", "in")
  const { data: rows, error } = await q.limit(8)
  if (error) throw error
  if (!rows?.length) throw new Error(`no turnkey inbound row for tx_hash ${txHash}`)

  for (const row of rows) {
    const amount = Number(row.amount ?? 0)
    const currency = String(row.currency ?? "USD").toUpperCase()
    const { baseCurrency, baseAmount } = ledgerAmountFields(amount, currency)
    const priorMeta =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {}
    const easnerTransactionId =
      String(row.easner_transaction_id ?? priorMeta.easner_transaction_id ?? "").trim() ||
      generateTransactionId()
    const metadata = withOrganicStablecoinDepositMetadata({
      ...priorMeta,
      easner_transaction_id: easnerTransactionId,
      manual_repair: true,
      ...buildWalletReportingSnapshot({ amount, currency, fxRates: [] }),
    })

    console.log("REPAIR", {
      id: row.id,
      baseAmount,
      easnerTransactionId,
      hadBaseAmount: row.base_amount != null,
      hadEasnerTransactionId: Boolean(row.easner_transaction_id ?? priorMeta.easner_transaction_id),
    })

    if (!APPLY) continue

    const { error: updateErr } = await admin
      .from("transactions")
      .update({
        base_currency: baseCurrency,
        base_amount: baseAmount,
        easner_transaction_id: easnerTransactionId,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
    if (updateErr) throw updateErr
  }
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  if (REPAIR) {
    await repairIncompleteTurnkeyRow(admin, HASH)
    if (!APPLY) console.log("dry-run repair only; pass --apply --repair to write")
    return
  }

  const { data: inbox } = await admin
    .from("event_inbox")
    .select("payload,event_id")
    .eq("provider", "turnkey")
    .order("received_at", { ascending: false })
    .limit(30)

  const row = (inbox ?? []).find((r) => {
    const h = String(r.payload?.msg?.txHash ?? "")
    return h === HASH || h.startsWith(HASH.slice(0, 16))
  })
  if (!row) throw new Error("inbox row not found")

  const parsed = parseTurnkeyBalanceWebhookPayload(row.payload)
  if (parsed.kind !== "deposit") throw new Error(`not deposit: ${parsed.kind}`)

  const scope = await resolveTurnkeyWalletScopeFromEvent(admin, {
    ...parsed.data.raw,
    address: parsed.data.address,
    txHash: parsed.data.txHash,
    asset: parsed.data.asset,
    msg: parsed.data.raw.msg as Record<string, unknown>,
  })
  if (!scope) throw new Error("no wallet scope")

  const addressForId = scope.tokenAccountAddress || scope.walletAddress
  const providerTransactionId = turnkeyBalanceDepositProviderTransactionId(parsed.data, addressForId)
  const currency = parsed.data.asset === "EURC" ? "EUR" : "USD"
  const { baseCurrency, baseAmount } = ledgerAmountFields(parsed.data.amount, currency)
  const metadata = completeLedgerMetadata(parsed.data.amount, currency, {
    source: "turnkey_balance_webhook",
    operation: "deposit",
    source_payment_rail: "solana",
    source_currency: parsed.data.asset,
    organic_deposit_fallback: true,
    manual_replay: true,
    balance_delta_applied: SKIP_BALANCE,
  })
  const easnerTransactionId = String(metadata.easner_transaction_id)

  const visible = await inboundHashHasVisibleLedgerCredit(admin, {
    txHash: HASH,
    userId: scope.userId,
    businessId: scope.businessId,
  })
  console.log("VISIBLE", visible, "scope", {
    userId: scope.userId,
    businessId: scope.businessId,
    wallet: scope.walletAddress,
    amount: parsed.data.amount,
    providerTransactionId,
    easnerTransactionId,
    baseAmount,
  })

  if (!APPLY) {
    console.log("dry-run only; pass --apply to create ledger row (--skip-balance if wallet already credited)")
    return
  }

  if (visible) {
    console.log("already visible; run with --repair --apply to patch incomplete columns")
    await repairIncompleteTurnkeyRow(admin, HASH)
    return
  }

  const occurredAt = parsed.data.occurredAt
  const { data: inserted, error } = await admin
    .from("transactions")
    .insert({
      user_id: scope.userId,
      business_id: scope.businessId,
      provider: "turnkey",
      provider_transaction_id: providerTransactionId,
      provider_event_id: "replay-missing-deposit",
      status: "settled",
      amount: parsed.data.amount,
      currency,
      direction: "in",
      payload: parsed.data.raw,
      metadata,
      tx_hash: HASH,
      wallet_address: scope.walletAddress,
      asset: parsed.data.asset,
      chain: "solana",
      occurred_at: occurredAt,
      settled_at: parsed.data.settledAt ?? occurredAt,
      base_currency: baseCurrency,
      base_amount: baseAmount,
      easner_transaction_id: easnerTransactionId,
      hidden_from_feed: false,
    })
    .select("id,easner_transaction_id,base_amount")
    .single()
  if (error) throw error
  console.log("INSERTED", inserted)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
