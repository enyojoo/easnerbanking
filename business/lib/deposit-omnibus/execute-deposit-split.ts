import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeEasnerMarginFromOmnibus,
  isDepositSplitEconomicsValid,
} from "@easner/shared"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { noahCustomerIdFromBusinessId, noahCustomerIdFromUserId } from "@/lib/noah/customer-id"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { findBankOnrampPayInTransaction } from "@/lib/noah/find-bank-onramp-pay-in-transaction"
import {
  extractNoahBankPayInEnrichment,
  mergeBankDepositLifecycleMetadata,
} from "@/lib/noah/bank-onramp-tx"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"
import { sendStablecoinFromDepositOmnibus } from "@/lib/turnkey/send-from-omnibus"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"
import {
  buildNoahBankOnrampCreditKey,
} from "@/lib/noah/credit-bank-onramp-wallet"
import { notifyBankDepositPayInSettledPush } from "@/lib/notifications/bank-deposit-settled-notify"
import {
  enqueueDepositSplitJob,
  updateDepositSplitJob,
  findDepositSplitJobByRuleExecutionId,
  listStuckDepositSplitJobs,
  type DepositSplitJobRow,
} from "@/lib/deposit-omnibus/deposit-split-jobs-db"
import { isDepositSplitDryRun, isDepositSplitEnabled } from "@/lib/deposit-omnibus/config"

const MARGIN_SEND_MIN = 0.01

async function buildNoahContextForLedgerScope(
  admin: SupabaseClient,
  userId: string,
  businessId: string | null,
): Promise<NoahAccountContext | null> {
  if (businessId) {
    const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, businessId)
    if (!ownerUserId) return null
    const { data: b } = await admin.from("businesses").select("noah_customer_id").eq("id", businessId).maybeSingle()
    const stored = (b?.noah_customer_id as string | null | undefined)?.trim() || null
    return {
      scope: "business",
      customerType: "Business",
      noahCustomerId: stored || noahCustomerIdFromBusinessId(businessId),
      subjectBusinessId: businessId,
      subjectUserId: ownerUserId,
    }
  }
  const { data: u } = await admin.from("users").select("noah_customer_id").eq("id", userId).maybeSingle()
  const stored = (u?.noah_customer_id as string | null | undefined)?.trim() || null
  return {
    scope: "individual",
    customerType: "Individual",
    noahCustomerId: stored || noahCustomerIdFromUserId(userId),
    subjectBusinessId: null,
    subjectUserId: userId,
  }
}

function assetForLedgerCurrency(lc: "USD" | "EUR"): "USDC" | "EURC" {
  return lc === "EUR" ? "EURC" : "USDC"
}

function cryptoTickerForLedgerCurrency(lc: "USD" | "EUR"): string {
  return lc === "EUR" ? getNoahEurCryptoTicker() : getNoahUsdCryptoTicker()
}

export type TriggerDepositSplitInput = {
  ruleExecutionId: string
  userId: string
  businessId: string | null
  omnibusInboundTxHash?: string | null
  omnibusReceived?: number | null
}

/**
 * Enqueue (if needed) and run deposit split synchronously for best UX.
 */
export async function triggerDepositSplit(
  admin: SupabaseClient,
  input: TriggerDepositSplitInput,
): Promise<{ ok: boolean; reason?: string; jobId?: string }> {
  if (!isDepositSplitEnabled()) return { ok: false, reason: "split_disabled" }

  const ruleExecutionId = String(input.ruleExecutionId || "").trim()
  if (!ruleExecutionId) return { ok: false, reason: "missing_rule_execution_id" }

  const existing = await findDepositSplitJobByRuleExecutionId(admin, ruleExecutionId)
  if (existing?.status === "completed") return { ok: true, jobId: existing.id, reason: "already_completed" }

  const payIn = await findBankOnrampPayInTransaction(admin, {
    depositId: ruleExecutionId,
    userId: input.userId,
    businessId: input.businessId,
  })
  if (!payIn?.id) return { ok: false, reason: "pay_in_not_found" }

  const { data: payInRow } = await admin
    .from("transactions")
    .select("id, payload, metadata, provider_transaction_id")
    .eq("id", payIn.id)
    .maybeSingle()
  if (!payInRow?.id) return { ok: false, reason: "pay_in_row_missing" }

  const payload = (payInRow.payload as Record<string, unknown>) ?? {}
  const meta = (payInRow.metadata as Record<string, unknown>) ?? {}
  const enrichment = extractNoahBankPayInEnrichment(payload)
  if (!enrichment) return { ok: false, reason: "not_fiat_pay_in" }

  const omnibusReceived =
    input.omnibusReceived ??
    enrichment.settledStablecoinAmount ??
    Number(meta.omnibus_received ?? 0)
  if (!Number.isFinite(omnibusReceived) || omnibusReceived <= 0) {
    return { ok: false, reason: "no_omnibus_amount" }
  }

  const channelFee =
    typeof meta.noah_channel_fee === "number"
      ? meta.noah_channel_fee
      : enrichment.feeAmount
  const economics = computeEasnerMarginFromOmnibus({
    fiatAmount: enrichment.fiatAmount,
    currency: enrichment.fiatCurrency,
    noahChannelFee: channelFee,
    omnibusRemaining: omnibusReceived,
  })
  if (!isDepositSplitEconomicsValid(economics)) {
    await admin
      .from("transactions")
      .update({
        metadata: {
          ...meta,
          deposit_split_status: "blocked_negative_margin",
          easner_margin: economics.easnerMargin,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", payIn.id)
    return { ok: false, reason: "negative_margin" }
  }

  const ledgerCurrency = (enrichment.walletLedgerCurrency ?? "USD") as "USD" | "EUR"
  const { job } = await enqueueDepositSplitJob(admin, {
    ruleExecutionId,
    userId: input.userId,
    businessId: input.businessId,
    payInTransactionId: payIn.id,
    fiatAmount: enrichment.fiatAmount,
    fiatCurrency: enrichment.fiatCurrency,
    noahChannelFee: economics.noahChannelFee,
    customerFee: economics.customerFee,
    easnerMargin: economics.easnerMargin,
    userNet: economics.userNet,
    omnibusReceived,
    ledgerCurrency,
    omnibusInboundTxHash: input.omnibusInboundTxHash ?? null,
    status: isDepositSplitDryRun() ? "dry_run" : "pending",
  })
  if (!job) return { ok: false, reason: "enqueue_failed" }

  return executeDepositSplitJob(admin, job.id)
}

export async function executeDepositSplitJob(
  admin: SupabaseClient,
  jobId: string,
): Promise<{ ok: boolean; reason?: string; jobId?: string }> {
  const { data: job } = await admin.from("deposit_split_jobs").select("*").eq("id", jobId).maybeSingle()
  if (!job?.id) return { ok: false, reason: "job_not_found" }
  const row = job as DepositSplitJobRow
  if (row.status === "completed") return { ok: true, jobId: row.id, reason: "already_completed" }

  if (row.status === "send_submitted") {
    if (row.user_vault_tx_hash) {
      const completed = await tryCompleteDepositSplitFromUserVaultInbound(admin, {
        txHash: row.user_vault_tx_hash,
        userId: row.user_id,
        businessId: row.business_id,
        amount: Number(row.user_net),
      })
      return {
        ok: completed,
        jobId: row.id,
        reason: completed ? undefined : "awaiting_vault_settlement",
      }
    }
    if (row.user_vault_send_id) {
      return { ok: true, jobId: row.id, reason: "awaiting_settlement" }
    }
  }

  if (isDepositSplitDryRun() || row.status === "dry_run") {
    await updateDepositSplitJob(admin, row.id, { status: "dry_run" })
    return { ok: true, jobId: row.id, reason: "dry_run" }
  }

  const ctx = await buildNoahContextForLedgerScope(admin, row.user_id, row.business_id)
  if (!ctx) return { ok: false, reason: "noah_context" }

  const lc = (row.ledger_currency === "EUR" ? "EUR" : "USD") as "USD" | "EUR"
  const asset = assetForLedgerCurrency(lc)
  const cryptoTicker = cryptoTickerForLedgerCurrency(lc)

  const userVault = await resolveTurnkeyAddressForNoahPair(admin, ctx, cryptoTicker, "Solana")
  if (!userVault) return { ok: false, reason: "user_vault_missing" }

  const userSend = await sendStablecoinFromDepositOmnibus({
    ledgerCurrency: lc,
    asset,
    destinationAddress: userVault,
    amount: row.user_net,
    pollForSettlement: true,
    settlementPollTimeoutMs: 45_000,
  })

  if (userSend.status === "failed") {
    await updateDepositSplitJob(admin, row.id, {
      status: "failed",
      error_message: userSend.errorMessage ?? "user_vault_send_failed",
      user_vault_send_id: userSend.providerTransactionId,
    })
    return { ok: false, reason: "user_vault_send_failed", jobId: row.id }
  }

  await updateDepositSplitJob(admin, row.id, {
    status: userSend.status === "settled" ? "completed" : "send_submitted",
    user_vault_send_id: userSend.providerTransactionId,
    user_vault_tx_hash: userSend.txHash,
  })

  let marginSendId: string | null = null
  const margin = Number(row.easner_margin ?? 0)
  if (margin >= MARGIN_SEND_MIN) {
    const feeAddr = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: lc })
    if (feeAddr) {
      const marginSend = await sendStablecoinFromDepositOmnibus({
        ledgerCurrency: lc,
        asset,
        destinationAddress: feeAddr,
        amount: margin,
        pollForSettlement: false,
      })
      if (marginSend.providerTransactionId) {
        marginSendId = marginSend.providerTransactionId
        await updateDepositSplitJob(admin, row.id, { margin_send_id: marginSendId })
      }
    }
  }

  if (userSend.status === "settled" && row.pay_in_transaction_id) {
    await finalizeDepositSplitCredit(admin, {
      payInTransactionId: row.pay_in_transaction_id,
      userId: row.user_id,
      businessId: row.business_id,
      ruleExecutionId: row.rule_execution_id,
      userNet: row.user_net,
      ledgerCurrency: lc,
      userVaultTxHash: userSend.txHash,
      customerFee: row.customer_fee,
      easnerMargin: row.easner_margin,
    })
    await updateDepositSplitJob(admin, row.id, { status: "completed" })
  }

  return {
    ok: userSend.status !== "failed",
    jobId: row.id,
    reason: userSend.status === "settled" ? undefined : "send_submitted",
  }
}

export async function finalizeDepositSplitCredit(
  admin: SupabaseClient,
  input: {
    payInTransactionId: string
    userId: string
    businessId: string | null
    ruleExecutionId: string
    userNet: number
    ledgerCurrency: "USD" | "EUR"
    userVaultTxHash: string | null
    customerFee: number
    easnerMargin: number | null
  },
): Promise<void> {
  const creditKey = buildNoahBankOnrampCreditKey(input.ruleExecutionId, input.payInTransactionId)

  const { data: payInRow } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", input.payInTransactionId)
    .maybeSingle()
  const priorMeta = (payInRow?.metadata as Record<string, unknown>) ?? {}
  if (priorMeta.wallet_balance_credit_key === creditKey) return

  await applyWalletBalanceDelta(admin, {
    businessId: input.businessId,
    userId: input.businessId ? null : input.userId,
    currency: input.ledgerCurrency,
    delta: input.userNet,
  })

  const onChainAt = new Date().toISOString()
  const merged = mergeBankDepositLifecycleMetadata(priorMeta, {
    on_chain_settled_at: onChainAt,
    completed_at: onChainAt,
  })

  await admin
    .from("transactions")
    .update({
      status: "settled",
      metadata: {
        ...merged,
        wallet_balance_credit_key: creditKey,
        customer_fee: input.customerFee,
        user_net_amount: input.userNet,
        posted_amount: input.userNet,
        easner_margin: input.easnerMargin,
        deposit_split_status: "completed",
        noah_on_chain_tx_hash: input.userVaultTxHash ?? priorMeta.noah_on_chain_tx_hash,
      },
      tx_hash: input.userVaultTxHash ?? undefined,
      settled_at: onChainAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.payInTransactionId)

  await notifyBankDepositPayInSettledPush(admin, input.payInTransactionId)
}

export async function tryCompleteDepositSplitFromUserVaultInbound(
  admin: SupabaseClient,
  opts: { txHash: string; userId: string; businessId: string | null; amount: number },
): Promise<boolean> {
  const txHash = String(opts.txHash || "").trim()
  if (!txHash) return false

  let q = admin
    .from("deposit_split_jobs")
    .select("*")
    .eq("status", "send_submitted")
    .eq("user_vault_tx_hash", txHash)
  if (opts.businessId) q = q.eq("business_id", opts.businessId)
  else q = q.eq("user_id", opts.userId).is("business_id", null)

  const { data: job } = await q.maybeSingle()
  if (!job?.id || !job.pay_in_transaction_id) return false

  await finalizeDepositSplitCredit(admin, {
    payInTransactionId: job.pay_in_transaction_id,
    userId: job.user_id,
    businessId: job.business_id,
    ruleExecutionId: job.rule_execution_id,
    userNet: Number(job.user_net),
    ledgerCurrency: job.ledger_currency === "EUR" ? "EUR" : "USD",
    userVaultTxHash: txHash,
    customerFee: Number(job.customer_fee),
    easnerMargin: job.easner_margin != null ? Number(job.easner_margin) : null,
  })
  await updateDepositSplitJob(admin, job.id, { status: "completed" })
  return true
}

/** Cron backstop: retry stuck pending jobs and reconcile send_submitted vault credits. */
export async function processStuckDepositSplitJobs(
  admin: SupabaseClient,
  opts: { limit?: number; olderThanMs?: number } = {},
): Promise<{ processed: number; completed: number; failed: number }> {
  if (!isDepositSplitEnabled()) {
    return { processed: 0, completed: 0, failed: 0 }
  }

  const jobs = await listStuckDepositSplitJobs(admin, opts)
  let processed = 0
  let completed = 0
  let failed = 0

  for (const job of jobs) {
    processed += 1
    const result = await executeDepositSplitJob(admin, job.id)
    if (result.ok && !result.reason) completed += 1
    else if (!result.ok) failed += 1
    else if (result.reason === "already_completed") completed += 1
  }

  return { processed, completed, failed }
}
