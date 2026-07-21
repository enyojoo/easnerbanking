import type { SupabaseClient } from "@supabase/supabase-js"
import {
  checkYcFundBalanceOmnibusSufficient,
  computeEasnerRevenueFeeWalletSweepAmount,
  EASNER_REVENUE_FEE_WALLET_SWEEP_MIN,
  YC_FUND_BALANCE_OMNIBUS_TOLERANCE_USDC,
} from "@easner/shared"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  readPriorSweepFromMetadata,
  sweepEasnerRevenueFromDepositOmnibus,
} from "@/lib/processing-fee/fee-wallet-sweep"
import { sendStablecoinFromDepositOmnibus } from "@/lib/turnkey/send-from-omnibus"
import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import { getTurnkeyOrganizationId } from "@/lib/turnkey/config"
import {
  interpretTurnkeyGetSendTransactionStatus,
  pollUntilTurnkeySendTerminal,
} from "@/lib/turnkey/send"
import { resolveActiveUsdcSolanaAddress } from "@/lib/wallet/resolve-active-usdc-solana-address"
import { notifyYcFundBalanceSettledPush } from "@/lib/notifications/bank-deposit-settled-notify"
import {
  buildYcFundBalanceReceiveMetadata,
  findPendingYcFundBalanceVaultInbound,
  mergeYcFundBalanceLifecycle,
} from "@/lib/yellowcard/yc-ledger"
import { resolveLedgerOccurredAt } from "@/lib/ledger/ledger-occurred-at"
import { buildWalletReportingSnapshot } from "@/lib/transactions/reporting-snapshot"

export type YcFundBalanceSplitStatus = "pending" | "send_submitted" | "completed" | "failed"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

export function buildYcFundBalanceCreditKey(transferId: string): string {
  return `yc_fund_balance:${String(transferId || "").trim()}`
}

/** Resolve omnibus→vault send signature when Turnkey poll timed out before hash was stored. */
export async function resolveYcFundBalanceVaultTxHashFromSendId(
  sendStatusId: string,
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  const sendId = String(sendStatusId || "").trim()
  if (!sendId) return null
  const orgId = getTurnkeyOrganizationId()
  const client = getTurnkeyApiClient() as Record<string, (...args: unknown[]) => Promise<unknown>> | null
  if (!orgId || !client) return null

  const terminal = await pollUntilTurnkeySendTerminal(client, orgId, sendId, {
    timeoutMs: opts?.timeoutMs ?? 8_000,
    intervalMs: 500,
  }).catch(() => null)
  if (!terminal) return null
  return interpretTurnkeyGetSendTransactionStatus(terminal).txHash ?? null
}

async function loadYcFundBalanceTransferByVaultTxHash(
  admin: SupabaseClient,
  opts: { txHash: string; userId: string; businessId: string | null },
): Promise<Record<string, unknown> | null> {
  const txHash = String(opts.txHash || "").trim()
  if (!txHash) return null

  let q = admin
    .from("yc_transfers")
    .select("*")
    .eq("mode", "fund_balance")
    .filter("metadata->>user_vault_tx_hash", "eq", txHash)
  if (opts.businessId) {
    q = q.eq("business_id", opts.businessId)
  } else {
    q = q.eq("user_id", opts.userId).is("business_id", null)
  }
  const { data } = await q.maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

/** Hide duplicate Turnkey stablecoin deposit; return whether wallet delta was already applied. */
async function reconcileYcFundBalanceTurnkeyMirror(
  admin: SupabaseClient,
  input: {
    txHash: string
    userId: string
    businessId: string | null
    ycTransactionId: string
  },
): Promise<boolean> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash) return false

  let q = admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .eq("tx_hash", txHash)
  if (input.businessId) {
    q = q.eq("business_id", input.businessId)
  } else {
    q = q.eq("user_id", input.userId).is("business_id", null)
  }
  const { data: mirror } = await q.maybeSingle()
  if (!mirror?.id) return false

  const prior = asMeta(mirror.metadata)
  await admin
    .from("transactions")
    .update({
      hidden_from_feed: true,
      metadata: {
        ...prior,
        suppress_in_feed: true,
        yc_fund_balance_chain_mirror: true,
        yc_fund_balance_transaction_id: input.ycTransactionId,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", mirror.id)

  return prior.balance_delta_applied === true
}

export type YcFundBalanceEconomics = {
  cryptoAmount: number
  creditAmt: number
  processingFee: number
  expectedOmnibus: number
  feeSweep: number
  omnibusCheckOk: boolean
}

export function computeYcFundBalanceEconomics(input: {
  transfer: Record<string, unknown>
  payload?: Record<string, unknown>
  omnibusAmount?: number | null
}): YcFundBalanceEconomics {
  const transferMeta = asMeta(input.transfer.metadata)
  const settlement = (input.payload?.settlementInfo ??
    input.payload?.settlement_info ??
    input.transfer.settlement_info) as Record<string, unknown> | null
  const cryptoAmount = Number(
    input.omnibusAmount ??
      settlement?.cryptoAmount ??
      input.transfer.omnibus_in_actual ??
      transferMeta.usd_credit ??
      0,
  )
  const processingFee = Number(transferMeta.processing_fee ?? 0)
  const quotedCredit = Number(transferMeta.usd_credit ?? input.transfer.quoted_receive ?? 0)
  const expectedOmnibus = Number(
    transferMeta.omnibus_in_expected ?? quotedCredit + processingFee,
  )
  const omnibusCheck = checkYcFundBalanceOmnibusSufficient({
    cryptoAmount,
    usdCredit: quotedCredit,
    processingFee,
    tolerance: YC_FUND_BALANCE_OMNIBUS_TOLERANCE_USDC,
  })
  const creditAmt =
    quotedCredit > 0 ? quotedCredit : Math.max(0, cryptoAmount - processingFee)
  const quotedSweep = computeEasnerRevenueFeeWalletSweepAmount({
    processingFee,
    ledgerSurplus: cryptoAmount - creditAmt,
  })
  const availableSweep = Math.max(0, cryptoAmount - creditAmt)
  const feeSweep = Math.min(quotedSweep, availableSweep)

  return {
    cryptoAmount,
    creditAmt,
    processingFee,
    expectedOmnibus,
    feeSweep,
    omnibusCheckOk: omnibusCheck.ok,
  }
}

export type TriggerYcFundBalanceOmnibusSplitInput = {
  transferId: string
  transactionId?: string | null
  payload?: Record<string, unknown>
  omnibusTxHash?: string | null
  omnibusAmount?: number | null
}

export type TriggerYcFundBalanceOmnibusSplitResult = {
  ok: boolean
  reason?: string
  creditAmt?: number
  finalized?: boolean
}

/**
 * Omnibus → user vault + fee wallet; ledger credit deferred until vault settles.
 */
export async function triggerYcFundBalanceOmnibusSplit(
  admin: SupabaseClient,
  input: TriggerYcFundBalanceOmnibusSplitInput,
): Promise<TriggerYcFundBalanceOmnibusSplitResult> {
  const transferId = String(input.transferId || "").trim()
  if (!transferId) return { ok: false, reason: "missing_transfer_id" }

  const { data: transfer } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("id", transferId)
    .maybeSingle()
  if (!transfer || transfer.mode !== "fund_balance") {
    return { ok: false, reason: "not_fund_balance" }
  }

  const transferMeta = asMeta(transfer.metadata)
  const splitStatus = String(transferMeta.fund_balance_split_status ?? "")
  if (splitStatus === "completed" || String(transfer.status) === "completed") {
    return { ok: true, reason: "already_completed", creditAmt: Number(transferMeta.usd_credit_applied ?? 0) }
  }

  const creditKey = buildYcFundBalanceCreditKey(transferId)
  const transactionId =
    input.transactionId ?? (transfer.transaction_id != null ? String(transfer.transaction_id) : null)

  if (transactionId) {
    const { data: txRow } = await admin
      .from("transactions")
      .select("id, metadata")
      .eq("id", transactionId)
      .maybeSingle()
    const prior = asMeta(txRow?.metadata)
    if (prior.wallet_balance_credit_key === creditKey || prior.balance_delta_applied === true) {
      return { ok: true, reason: "already_credited", creditAmt: Number(prior.posted_amount ?? transferMeta.usd_credit ?? 0) }
    }
  }

  const payload = input.payload ?? {}
  const economics = computeYcFundBalanceEconomics({
    transfer,
    payload,
    omnibusAmount: input.omnibusAmount,
  })
  const { cryptoAmount, creditAmt, processingFee, expectedOmnibus, feeSweep } = economics
  const now = new Date().toISOString()
  const omnibusTxHash = String(
    input.omnibusTxHash ?? transferMeta.leg1_omnibus_tx_hash ?? "",
  ).trim()

  if (!economics.omnibusCheckOk) {
    await admin
      .from("yc_transfers")
      .update({
        status: "processing",
        leg1_status: "complete",
        omnibus_in_actual: cryptoAmount,
        metadata: {
          ...transferMeta,
          ops_alert: "yc_omnibus_underfunded",
          omnibus_in_expected: expectedOmnibus,
          omnibus_in_actual: cryptoAmount,
          ...(omnibusTxHash ? { leg1_omnibus_tx_hash: omnibusTxHash } : {}),
        },
        updated_at: now,
      })
      .eq("id", transferId)
    return { ok: false, reason: "omnibus_underfunded", creditAmt: 0 }
  }

  if (!Number.isFinite(creditAmt) || creditAmt <= 0) {
    return { ok: false, reason: "credit_amount_invalid" }
  }

  if (!omnibusTxHash) {
    return { ok: false, reason: "omnibus_tx_hash_required" }
  }

  const userId = String(transfer.user_id)
  const businessId = transfer.business_id != null ? String(transfer.business_id) : null
  const userVault = await resolveActiveUsdcSolanaAddress(admin, { userId, businessId })
  if (!userVault) {
    await admin
      .from("yc_transfers")
      .update({
        status: "processing",
        leg1_status: "complete",
        omnibus_in_actual: cryptoAmount,
        metadata: {
          ...transferMeta,
          ops_alert: "user_vault_missing",
          omnibus_in_expected: expectedOmnibus,
          omnibus_in_actual: cryptoAmount,
          leg1_omnibus_tx_hash: omnibusTxHash,
          fund_balance_split_status: "failed",
        },
        updated_at: now,
      })
      .eq("id", transferId)
    return { ok: false, reason: "user_vault_missing" }
  }

  // Idempotent re-entry when send already submitted.
  if (splitStatus === "send_submitted" && transferMeta.user_vault_tx_hash) {
    if (transactionId) {
      const finalized = await tryCompleteYcFundBalanceFromUserVaultInbound(admin, {
        txHash: String(transferMeta.user_vault_tx_hash),
        userId,
        businessId,
        amount: creditAmt,
      })
      return {
        ok: true,
        reason: finalized ? undefined : "awaiting_vault_settlement",
        creditAmt,
        finalized,
      }
    }
    return { ok: true, reason: "awaiting_vault_settlement", creditAmt }
  }

  const userSend = await sendStablecoinFromDepositOmnibus({
    ledgerCurrency: "USD",
    asset: "USDC",
    destinationAddress: userVault,
    amount: creditAmt,
    pollForSettlement: true,
    settlementPollTimeoutMs: 45_000,
  })

  if (userSend.status === "failed") {
    await admin
      .from("yc_transfers")
      .update({
        status: "processing",
        leg1_status: "complete",
        omnibus_in_actual: cryptoAmount,
        metadata: {
          ...transferMeta,
          fund_balance_split_status: "failed",
          user_vault_send_id: userSend.providerTransactionId,
          user_vault_send_error: userSend.errorMessage ?? "user_vault_send_failed",
          leg1_omnibus_tx_hash: omnibusTxHash,
          omnibus_in_actual: cryptoAmount,
        },
        updated_at: now,
      })
      .eq("id", transferId)
    return { ok: false, reason: "user_vault_send_failed", creditAmt }
  }

  let feeWalletSweepTxHash: string | null =
    typeof transferMeta.fee_wallet_sweep_tx_hash === "string"
      ? transferMeta.fee_wallet_sweep_tx_hash
      : null
  if (
    !readPriorSweepFromMetadata(transferMeta).captured &&
    feeSweep >= EASNER_REVENUE_FEE_WALLET_SWEEP_MIN
  ) {
    const sweep = await sweepEasnerRevenueFromDepositOmnibus({
      ledgerCurrency: "USD",
      amount: feeSweep,
      logTag: "yc-fund-balance",
    })
    feeWalletSweepTxHash = sweep.feeWalletSweepTxHash
  }

  const nextSplitStatus: YcFundBalanceSplitStatus =
    userSend.status === "settled" ? "completed" : "send_submitted"

  const nextMeta = {
    ...transferMeta,
    omnibus_in_expected: expectedOmnibus,
    omnibus_in_actual: cryptoAmount,
    processing_fee: processingFee,
    margin_capture_mode: "fee_wallet_omnibus",
    leg1_omnibus_tx_hash: omnibusTxHash,
    fund_balance_split_status: nextSplitStatus,
    user_vault_send_id: userSend.providerTransactionId,
    user_vault_tx_hash: userSend.txHash,
    ...(feeWalletSweepTxHash ? { fee_wallet_sweep_tx_hash: feeWalletSweepTxHash } : {}),
    usd_credit_applied: creditAmt,
  }

  await admin
    .from("yc_transfers")
    .update({
      status: "processing",
      leg1_status: "complete",
      omnibus_in_actual: cryptoAmount,
      fee_wallet_sweep: feeSweep >= EASNER_REVENUE_FEE_WALLET_SWEEP_MIN ? feeSweep : null,
      settlement_info: payload.settlementInfo ?? payload.settlement_info ?? transfer.settlement_info,
      metadata: nextMeta,
      updated_at: now,
    })
    .eq("id", transferId)

  if (userSend.status === "settled" && userSend.txHash && transactionId) {
    await finalizeYcFundBalanceCredit(admin, {
      transferId,
      transactionId,
      creditAmt,
      processingFee,
      payload,
      userVaultTxHash: userSend.txHash,
      omnibusTxHash,
      feeSweep,
    })
    return { ok: true, creditAmt, finalized: true }
  }

  return {
    ok: userSend.status !== "failed",
    reason: userSend.status === "settled" ? undefined : "awaiting_vault_settlement",
    creditAmt,
    finalized: false,
  }
}

export type FinalizeYcFundBalanceCreditInput = {
  transferId: string
  transactionId: string
  creditAmt: number
  processingFee: number
  payload: Record<string, unknown>
  userVaultTxHash: string
  omnibusTxHash?: string | null
  feeSweep?: number | null
}

export async function finalizeYcFundBalanceCredit(
  admin: SupabaseClient,
  input: FinalizeYcFundBalanceCreditInput,
): Promise<void> {
  const transferId = String(input.transferId || "").trim()
  const transactionId = String(input.transactionId || "").trim()
  if (!transferId || !transactionId) return

  const creditKey = buildYcFundBalanceCreditKey(transferId)
  const now = new Date().toISOString()

  const { data: transfer } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("id", transferId)
    .maybeSingle()
  if (!transfer) return

  const { data: txRow } = await admin
    .from("transactions")
    .select("metadata, occurred_at, created_at, provider_transaction_id, amount")
    .eq("id", transactionId)
    .maybeSingle()
  const prior = asMeta(txRow?.metadata)
  if (prior.wallet_balance_credit_key === creditKey) return

  const creditAmt = Number(input.creditAmt)
  const mirrorAlreadyCredited = input.userVaultTxHash
    ? await reconcileYcFundBalanceTurnkeyMirror(admin, {
        txHash: input.userVaultTxHash,
        userId: String(transfer.user_id),
        businessId: transfer.business_id ? String(transfer.business_id) : null,
        ycTransactionId: transactionId,
      })
    : false

  if (!mirrorAlreadyCredited && !prior.balance_delta_applied) {
    await applyWalletBalanceDelta(admin, {
      userId: transfer.business_id ? null : String(transfer.user_id),
      businessId: transfer.business_id ? String(transfer.business_id) : null,
      currency: "USD",
      delta: creditAmt,
    })
  }

  const sequenceId = String(transfer.leg1_sequence_id ?? "")
  const baseMeta = buildYcFundBalanceReceiveMetadata({
    sequenceId,
    transferId,
    payload: input.payload,
    localPayIn: transfer.quoted_pay_in != null ? Number(transfer.quoted_pay_in) : null,
    localCurrency: transfer.pay_in_currency ? String(transfer.pay_in_currency) : null,
    usdCredit: creditAmt,
    processingFee: input.processingFee,
  })
  const lifecycleMeta = mergeYcFundBalanceLifecycle(baseMeta, {
    completed_at: now,
    processing_at: prior.processing_at != null ? String(prior.processing_at) : now,
  })
  lifecycleMeta.on_chain_settled_at = now

  const occurredAt = resolveLedgerOccurredAt({
    occurredAt: txRow?.occurred_at != null ? String(txRow.occurred_at) : null,
    createdAt: txRow?.created_at != null ? String(txRow.created_at) : null,
    fallback: now,
  })

  await upsertLedgerTransaction(admin, {
    userId: String(transfer.user_id),
    businessId: transfer.business_id ? String(transfer.business_id) : null,
    provider: "yellowcard",
    providerTransactionId: String(
      transfer.leg1_sequence_id ?? txRow?.provider_transaction_id ?? sequenceId,
    ),
    status: "settled",
    amount: creditAmt,
    currency: "USD",
    direction: "in",
    payload: input.payload,
    metadata: {
      ...prior,
      ...lifecycleMeta,
      ...buildWalletReportingSnapshot({
        amount: creditAmt,
        currency: "USD",
        fxRates: [],
      }),
      wallet_balance_credit_key: creditKey,
      balance_delta_applied: true,
      fund_balance_split_status: "completed",
      user_vault_tx_hash: input.userVaultTxHash,
      posted_amount: creditAmt,
      user_net_amount: creditAmt,
      ...(input.omnibusTxHash ? { yc_omnibus_tx_hash: input.omnibusTxHash } : {}),
    },
    txHash: input.userVaultTxHash,
    occurredAt,
    settledAt: now,
    baseCurrency: "USD",
  })

  const transferMeta = asMeta(transfer.metadata)
  await admin
    .from("yc_transfers")
    .update({
      status: "completed",
      metadata: {
        ...transferMeta,
        fund_balance_split_status: "completed",
        user_vault_tx_hash: input.userVaultTxHash,
        usd_credit_applied: creditAmt,
        wallet_balance_credit_key: creditKey,
      },
      updated_at: now,
    })
    .eq("id", transferId)

  await notifyYcFundBalanceSettledPush(admin, transactionId)
}

export async function tryCompleteYcFundBalanceFromUserVaultInbound(
  admin: SupabaseClient,
  opts: { txHash: string; userId: string; businessId: string | null; amount: number },
): Promise<boolean> {
  const txHash = String(opts.txHash || "").trim()
  if (!txHash) return false

  let transfer =
    (await loadYcFundBalanceTransferByVaultTxHash(admin, {
      txHash,
      userId: opts.userId,
      businessId: opts.businessId,
    })) ?? null

  if (!transfer?.id) {
    const pending = await findPendingYcFundBalanceVaultInbound(admin, {
      userId: opts.userId,
      businessId: opts.businessId,
      amount: opts.amount,
    })
    if (!pending) return false
    transfer = pending as unknown as Record<string, unknown>
    const pendingMeta = asMeta(transfer.metadata)
    await admin
      .from("yc_transfers")
      .update({
        metadata: {
          ...pendingMeta,
          user_vault_tx_hash: txHash,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", String(transfer.id))
    transfer.metadata = { ...pendingMeta, user_vault_tx_hash: txHash }
  }

  const transferMeta = asMeta(transfer.metadata)
  if (transferMeta.fund_balance_split_status === "completed") return true
  if (transferMeta.fund_balance_split_status !== "send_submitted") return false

  const transactionId =
    transfer.transaction_id != null ? String(transfer.transaction_id) : null
  if (!transactionId) return false

  const economics = computeYcFundBalanceEconomics({ transfer })
  await finalizeYcFundBalanceCredit(admin, {
    transferId: String(transfer.id),
    transactionId,
    creditAmt: economics.creditAmt,
    processingFee: economics.processingFee,
    payload: (transfer.settlement_info as Record<string, unknown>) ?? {},
    userVaultTxHash: txHash,
    omnibusTxHash:
      typeof transferMeta.leg1_omnibus_tx_hash === "string"
        ? transferMeta.leg1_omnibus_tx_hash
        : null,
    feeSweep: economics.feeSweep,
  })
  return true
}
