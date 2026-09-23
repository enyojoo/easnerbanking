import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveTurnkeySendClient, resolveTurnkeySendStatusClient } from "@/lib/turnkey/resolve-send-client"
import {
  getTurnkeySolanaBroadcastCaip2,
  isTurnkeySolSponsorshipEnabled,
} from "@/lib/turnkey/config"
import { buildStablecoinSplTransferUnsignedTxPayloadForTurnkey, getSolanaRpcUrl } from "@/lib/turnkey/sol-spl-transfer-unsigned-tx"
import { Connection } from "@solana/web3.js"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import {
  findEasetagSettlementForChainSuppression,
  patchEasetagP2pChainSettlement,
  updateEasetagSettlementSettled,
  updateEasetagSettlementSubmitted,
} from "@/lib/ledger/easetag-settlement"
import {
  applyGlobalPayoutWalletDebitForEasnerPayoutId,
  findGlobalPayoutNoahRowByTurnkeySendId,
  patchGlobalPayoutNoahTurnkeySettlement,
} from "@/lib/noah/global-payout-ledger"
import {
  ensureFeeWalletRevenueDeposit,
  findTransactionByFeeTurnkeySendId,
  isFeeWalletDestinationAddress,
  stampFeeWalletSweepHashOnTransaction,
} from "@/lib/processing-fee/fee-wallet-inbound-deposit"

import {
  asRecord,
  extractTurnkeySendFailureSummary,
  interpretTurnkeyGetSendTransactionStatus,
  normalizeTurnkeyGetSendTransactionStatusPayload,
  pollUntilTurnkeySendTerminal,
  resolveSolSendParsedIds,
  type TurnkeyClientLike,
} from "@/lib/turnkey/sol-send-polling"

export {
  extractTurnkeySolSendTransactionStatusId,
  extractTxHashFromTurnkeySendStatusResponse,
  interpretTurnkeyGetSendTransactionStatus,
  normalizeTurnkeyGetSendTransactionStatusPayload,
  pollUntilTurnkeySendTerminal,
  resolveSolSendParsedIds,
} from "@/lib/turnkey/sol-send-polling"


export type TurnkeySendInput = {
  ctx: NoahAccountContext
  asset: "USDC" | "EURC"
  chain: "solana"
  destinationAddress: string
  amount: number
  /**
   * When false (default), `destinationAddress` is the token owner wallet and we derive the SPL ATA.
   * When true, `destinationAddress` is already the recipient token account (Easetag settlement).
   */
  destinationIsTokenAccount?: boolean
  /** Payee vault pubkey when `destinationIsTokenAccount` is true (for ATA creation if missing on-chain). */
  destinationTokenAccountOwner?: string
  /** Tags turnkey ledger rows for Easetag chain settlement (hidden from activity feed). */
  easetagSettlement?: { transferGroupId: string }
  /** Standard Model global fiat off-ramp chain leg (hidden from activity feed). */
  globalPayout?: {
    easnerPayoutId: string
    noahWorkflowId?: string | null
    formSessionId?: string
    /** Wallet balance delta on settle (may exceed chain send amount in split_debit). */
    walletDebitAmount?: number
    marginLeg?: boolean
  }
  /** Direct Turnkey wallet send chain leg (ledger row owned by executeWalletSend). */
  walletSend?: {
    formSessionId: string
    marginLeg?: boolean
  }
  /**
   * Max ms to poll Turnkey for on-chain terminal status.
   * `0` returns `pending` immediately after broadcast submit (global payout execute path).
   */
  settlementPollTimeoutMs?: number
  /** Fee sweeps: stop as soon as Solana signature is known so the deposit can be booked in this call. */
  returnOnSignature?: boolean
}

function mapAssetToCurrency(asset: "USDC" | "EURC"): "USD" | "EUR" {
  return asset === "EURC" ? "EUR" : "USD"
}

function mapTurnkeySponsoredSendError(message: string): string | null {
  const m = String(message || "").toLowerCase()
  if (!m) return null

  // Keep these intentionally broad; Turnkey error strings can change.
  if (m.includes("gas sponsorship") && (m.includes("limit") || m.includes("exceed"))) {
    return "gas_sponsorship_limit_exceeded"
  }
  if (m.includes("sponsor solana rent") || (m.includes("rent") && m.includes("sponsor"))) {
    return "solana_rent_sponsorship_required"
  }
  if (m.includes("gas sponsorship") && (m.includes("not enabled") || m.includes("disabled"))) {
    return "gas_sponsorship_not_enabled"
  }
  return null
}

async function resolveScopeOwner(admin: SupabaseClient, ctx: NoahAccountContext): Promise<{ userId: string; businessId: string | null }> {
  if (ctx.scope === "business" && ctx.subjectBusinessId) {
    const { data } = await admin
      .from("users")
      .select("id")
      .eq("easner_business_id", ctx.subjectBusinessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    return { userId: String(data?.id || ctx.subjectUserId), businessId: ctx.subjectBusinessId }
  }
  return { userId: ctx.subjectUserId, businessId: null }
}

export async function resolveTurnkeySenderForAccountContext(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
  asset: "USDC" | "EURC",
): Promise<{ subOrgId: string; sourceAddress: string } | null> {
  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, ctx)
  if (!ownerId) return null

  const { data: owner } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", ownerId)
    .maybeSingle()
  const subOrgId = String(owner?.turnkey_sub_organization_id || "").trim()
  if (!subOrgId) return null

  const { data: wallet } = await admin
    .from("wallet_accounts")
    .select("address")
    .eq("wallet_owner_id", ownerId)
    .eq("status", "active")
    .eq("chain", "solana")
    .eq("asset", asset)
    .limit(1)
    .maybeSingle()
  const sourceAddress = String(wallet?.address || "").trim()
  if (!sourceAddress) return null

  return { subOrgId, sourceAddress }
}

export async function createTurnkeySend(
  admin: SupabaseClient,
  input: TurnkeySendInput,
): Promise<{
  providerTransactionId: string
  ledgerId: string
  status: "pending" | "settled" | "failed"
  txHash: string | null
  subOrgId: string
  /** Populated when Turnkey broadcast/simulation ends in FAILED (for Easetag rollback / ops). */
  chainFailureDetail: string | null
}> {
  const destinationAddress = String(input.destinationAddress || "").trim()
  if (!destinationAddress) throw new Error("destinationAddress is required")
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("amount must be positive")

  const scopeOwner = await resolveScopeOwner(admin, input.ctx)
  const sender = await resolveTurnkeySenderForAccountContext(admin, input.ctx, input.asset)
  if (!sender) throw new Error("No managed wallet found for requested asset")

  const resolved = await resolveTurnkeySendClient({
    scope: { kind: "sub_org", subOrganizationId: sender.subOrgId },
    admin,
  })
  if (!resolved.ok) throw new Error(resolved.error)
  const client = resolved.client as TurnkeyClientLike
  if (typeof client.solSendTransaction !== "function") {
    throw new Error("Turnkey SDK does not expose solSendTransaction")
  }

  const sponsor = isTurnkeySolSponsorshipEnabled()
  const caip2 = getTurnkeySolanaBroadcastCaip2()
  const destinationIsTokenAccount = Boolean(input.destinationIsTokenAccount)

  const connection = new Connection(getSolanaRpcUrl(), "confirmed")
  const { blockhash } = await connection.getLatestBlockhash("finalized")

  const unsignedTransaction = await buildStablecoinSplTransferUnsignedTxPayloadForTurnkey({
    asset: input.asset,
    ownerAddress: sender.sourceAddress,
    destinationAddress,
    destinationIsTokenAccount,
    destinationTokenAccountOwner: input.destinationTokenAccountOwner,
    amountHuman: input.amount,
    sponsoredFlow: sponsor,
    recentBlockhash: blockhash,
  })

  let sendRes: unknown
  try {
    console.info("turnkey_sol_send_transaction", {
      sponsor,
      caip2,
      asset: input.asset,
      chain: input.chain,
      subOrgId: sender.subOrgId,
    })
    sendRes = await client.solSendTransaction({
      organizationId: sender.subOrgId,
      unsignedTransaction,
      signWith: sender.sourceAddress,
      caip2,
      ...(sponsor ? { sponsor: true, recentBlockhash: blockhash } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("turnkey_sol_send_transaction_failed", {
      sponsor,
      caip2,
      asset: input.asset,
      chain: input.chain,
      subOrgId: sender.subOrgId,
      detail: msg.slice(0, 500),
    })
    const mapped = sponsor ? mapTurnkeySponsoredSendError(msg) : null
    if (mapped) throw new Error(mapped)
    throw e
  }
  const rawSend = (sendRes || {}) as Record<string, unknown>
  const act0 = asRecord(rawSend.activity)
  const activityId = String(act0?.id ?? "").trim()
  if (activityId && !activityId.startsWith("sha256:")) {
    console.info("turnkey_sol_send_resolve_ids", {
      subOrgId: sender.subOrgId,
      activityId: activityId.slice(0, 12),
    })
  }
  const parsed = await resolveSolSendParsedIds(client, sender.subOrgId, rawSend)

  const easetagMeta =
    input.easetagSettlement?.transferGroupId != null && String(input.easetagSettlement.transferGroupId).trim()
      ? {
          easetag_settlement_leg: true,
          suppress_in_feed: true,
          transfer_group_id: String(input.easetagSettlement.transferGroupId).trim(),
        }
      : {}

  const globalPayoutMeta =
    input.globalPayout?.easnerPayoutId != null && String(input.globalPayout.easnerPayoutId).trim()
      ? {
          global_payout_settlement_leg: true,
          suppress_in_feed: true,
          easner_payout_id: String(input.globalPayout.easnerPayoutId).trim(),
          ...(input.globalPayout.marginLeg ? { global_payout_margin_leg: true } : {}),
          ...(input.globalPayout.noahWorkflowId
            ? { noah_workflow_id: String(input.globalPayout.noahWorkflowId).trim() }
            : {}),
          ...(input.globalPayout.formSessionId
            ? { form_session_id: String(input.globalPayout.formSessionId).trim() }
            : {}),
          ...(input.globalPayout.walletDebitAmount != null &&
          Number.isFinite(input.globalPayout.walletDebitAmount) &&
          input.globalPayout.walletDebitAmount > 0
            ? { wallet_debit_amount: input.globalPayout.walletDebitAmount }
            : {}),
        }
      : {}

  const walletSendFormSessionId =
    input.walletSend?.formSessionId != null && String(input.walletSend.formSessionId).trim()
      ? String(input.walletSend.formSessionId).trim()
      : null
  const walletSendMeta = walletSendFormSessionId
    ? {
        wallet_send_settlement_leg: true,
        suppress_in_feed: true,
        form_session_id: walletSendFormSessionId,
        ...(input.walletSend?.marginLeg ? { wallet_send_margin_leg: true } : {}),
      }
    : {}

  const globalPayoutEasnerPayoutId =
    input.globalPayout?.easnerPayoutId != null && String(input.globalPayout.easnerPayoutId).trim()
      ? String(input.globalPayout.easnerPayoutId).trim()
      : null
  const easetagTransferGroupId =
    input.easetagSettlement?.transferGroupId != null && String(input.easetagSettlement.transferGroupId).trim()
      ? String(input.easetagSettlement.transferGroupId).trim()
      : null
  const skipTurnkeyLedgerRow = Boolean(
    globalPayoutEasnerPayoutId || easetagTransferGroupId || walletSendFormSessionId,
  )

  if (!skipTurnkeyLedgerRow) {
  await upsertLedgerTransaction(admin, {
    userId: scopeOwner.userId,
    businessId: scopeOwner.businessId,
    provider: "turnkey",
    providerTransactionId: parsed.providerTransactionId,
    providerEventId: parsed.providerEventId,
    status: "pending",
    amount: input.amount,
    currency: mapAssetToCurrency(input.asset),
    direction: "out",
    payload: (sendRes || {}) as Record<string, unknown>,
    metadata: {
      source: "turnkey_send",
      turnkey_sub_org_id: sender.subOrgId,
      turnkey_sponsor_requested: sponsor ? "true" : "false",
      turnkey_solana_caip2: caip2,
      ...easetagMeta,
      ...globalPayoutMeta,
      ...walletSendMeta,
    },
    txHash: parsed.txHash,
    walletAddress: sender.sourceAddress,
    counterpartyAddress: destinationAddress,
    asset: input.asset,
    chain: input.chain,
    occurredAt: new Date().toISOString(),
    baseCurrency: mapAssetToCurrency(input.asset),
  })
  } else if (globalPayoutEasnerPayoutId) {
    await patchGlobalPayoutNoahTurnkeySettlement(admin, {
      easnerPayoutId: globalPayoutEasnerPayoutId,
      turnkeySendId: parsed.providerTransactionId,
      txHash: parsed.txHash,
      turnkeySendStatus: "pending",
      marginLeg: input.globalPayout?.marginLeg === true,
    })
  } else if (easetagTransferGroupId) {
    await patchEasetagP2pChainSettlement(admin, {
      transferGroupId: easetagTransferGroupId,
      turnkeySendId: parsed.providerTransactionId,
      txHash: parsed.txHash,
      turnkeySendStatus: "pending",
    })
    await updateEasetagSettlementSubmitted(
      admin,
      easetagTransferGroupId,
      parsed.providerTransactionId,
      parsed.txHash,
    ).catch(() => {})
  }

  let reconciled: { status: "pending" | "settled" | "failed"; txHash: string | null } = {
    status: "pending",
    txHash: parsed.txHash,
  }
  let polledSnapshot: { status: "pending" | "settled" | "failed"; txHash: string | null } = {
    status: "pending",
    txHash: parsed.txHash,
  }
  let lastPollPayload: unknown = null

  if (input.settlementPollTimeoutMs === 0) {
    return {
      providerTransactionId: parsed.providerTransactionId,
      ledgerId: parsed.providerTransactionId,
      status: "pending",
      txHash: parsed.txHash,
      subOrgId: sender.subOrgId,
      chainFailureDetail: null,
    }
  }

  try {
    const pollMs =
      input.settlementPollTimeoutMs ??
      Number(process.env.TURNKEY_SOL_SEND_POLL_TIMEOUT_MS)
    const pollTimeoutMs =
      Number.isFinite(pollMs) && pollMs >= 5_000 ? Math.min(pollMs, 180_000) : 90_000
    const intervalMsRaw = Number(process.env.TURNKEY_SOL_SEND_POLL_INTERVAL_MS)
    const pollIntervalMs =
      Number.isFinite(intervalMsRaw) && intervalMsRaw >= 200 ? Math.min(intervalMsRaw, 5_000) : 500

    lastPollPayload = await pollUntilTurnkeySendTerminal(
      client,
      sender.subOrgId,
      parsed.providerTransactionId,
      {
        timeoutMs: pollTimeoutMs,
        intervalMs: pollIntervalMs,
        returnOnSignature: input.returnOnSignature === true,
      },
    )
    const polled = interpretTurnkeyGetSendTransactionStatus(lastPollPayload)
    polledSnapshot = {
      status: polled.status,
      txHash: polled.txHash ?? parsed.txHash,
    }
    console.info("turnkey_sol_send_poll_done", {
      subOrgId: sender.subOrgId,
      terminal: polled.status,
      hasSig: Boolean(polled.txHash),
    })
    if (polled.status === "pending" && lastPollPayload != null) {
      const stall = normalizeTurnkeyGetSendTransactionStatusPayload(lastPollPayload)
      console.warn("turnkey_sol_send_still_pending", {
        subOrgId: sender.subOrgId,
        txStatus: stall.txStatus ?? null,
        txError: stall.txError ?? null,
      })
    }

    reconciled = await reconcileTurnkeySendStatus(admin, {
      subOrgId: sender.subOrgId,
      providerTransactionId: parsed.providerTransactionId,
      ...(lastPollPayload != null ? { statusResponse: lastPollPayload } : {}),
    })
    if (!reconciled.txHash && polledSnapshot.txHash) {
      reconciled = { ...reconciled, txHash: polledSnapshot.txHash }
    }
    if (reconciled.status === "settled" && globalPayoutEasnerPayoutId) {
      await patchGlobalPayoutNoahTurnkeySettlement(admin, {
        easnerPayoutId: globalPayoutEasnerPayoutId,
        turnkeySendId: parsed.providerTransactionId,
        txHash: reconciled.txHash ?? parsed.txHash,
        turnkeySendStatus: reconciled.status,
        marginLeg: input.globalPayout?.marginLeg === true,
      }).catch(() => {})
      await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
        easnerPayoutId: globalPayoutEasnerPayoutId,
        marginLeg: input.globalPayout?.marginLeg === true,
        markTurnkeySettled: true,
      }).catch((e) => console.warn("global_payout_turnkey_settle_debit:", e))
    } else if (reconciled.status === "settled" && easetagTransferGroupId) {
      const txHash = reconciled.txHash ?? parsed.txHash
      await patchEasetagP2pChainSettlement(admin, {
        transferGroupId: easetagTransferGroupId,
        turnkeySendId: parsed.providerTransactionId,
        txHash,
        turnkeySendStatus: reconciled.status,
      }).catch(() => {})
      await updateEasetagSettlementSettled(admin, easetagTransferGroupId, txHash).catch(() => {})
    }
  } catch {
    if (!reconciled.txHash && polledSnapshot.txHash) {
      reconciled = { status: polledSnapshot.status, txHash: polledSnapshot.txHash }
    }
  }

  const chainFailureDetail =
    reconciled.status === "failed" ? extractTurnkeySendFailureSummary(lastPollPayload) : null

  return {
    providerTransactionId: parsed.providerTransactionId,
    ledgerId: parsed.providerTransactionId,
    status: reconciled.status,
    txHash: reconciled.txHash ?? parsed.txHash,
    subOrgId: sender.subOrgId,
    chainFailureDetail,
  }
}

async function applyGlobalPayoutTurnkeySettleDebit(
  admin: SupabaseClient,
  params: { providerTransactionId: string; easnerPayoutId?: string },
): Promise<void> {
  if (params.easnerPayoutId) {
    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
      easnerPayoutId: params.easnerPayoutId,
      markTurnkeySettled: true,
    })
    return
  }

  const noahRow = await findGlobalPayoutNoahRowByTurnkeySendId(admin, params.providerTransactionId)
  if (noahRow?.easnerPayoutId) {
    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
      easnerPayoutId: noahRow.easnerPayoutId,
      markTurnkeySettled: true,
    })
    return
  }

  const { data: existing } = await admin
    .from("transactions")
    .select("id, user_id, business_id, amount, currency, metadata")
    .eq("provider", "turnkey")
    .eq("provider_transaction_id", params.providerTransactionId)
    .maybeSingle()
  if (!existing?.id) return

  const meta = (existing.metadata || {}) as Record<string, unknown>
  if (meta.global_payout_margin_leg === true) return
  if (meta.global_payout_settlement_leg !== true) return
  if (meta.balance_delta_applied === true) return

  let debitAmt = Number(existing.amount ?? 0)
  const walletDebitOverride = Number(meta.wallet_debit_amount ?? 0)
  if (Number.isFinite(walletDebitOverride) && walletDebitOverride > 0) {
    debitAmt = walletDebitOverride
  }

  const easnerPayoutId = String(meta.easner_payout_id || "").trim()
  if (easnerPayoutId) {
    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
      easnerPayoutId,
      markTurnkeySettled: true,
    })
    return
  }

  if (!Number.isFinite(debitAmt) || debitAmt <= 0) return

  const currency = String(existing.currency || "USD").toUpperCase() as "USD" | "EUR"
  const businessId = existing.business_id ? String(existing.business_id) : null
  const userId = String(existing.user_id || "")

  await applyWalletBalanceDelta(admin, {
    businessId,
    userId: businessId ? null : userId,
    currency,
    delta: -debitAmt,
  })

  await admin
    .from("transactions")
    .update({
      metadata: { ...meta, balance_delta_applied: true },
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
}

export async function reconcileTurnkeySendStatus(
  admin: SupabaseClient,
  params: { subOrgId: string; providerTransactionId: string; statusResponse?: unknown },
): Promise<{ status: "pending" | "settled" | "failed"; txHash: string | null }> {
  const resolved = await resolveTurnkeySendStatusClient({
    subOrganizationId: params.subOrgId,
    admin,
  })
  if (!resolved.ok) throw new Error(resolved.error)
  const client = resolved.client as TurnkeyClientLike
  if (typeof client.getSendTransactionStatus !== "function") {
    return { status: "pending", txHash: null }
  }
  const res =
    params.statusResponse !== undefined
      ? normalizeTurnkeyGetSendTransactionStatusPayload(params.statusResponse)
      : normalizeTurnkeyGetSendTransactionStatusPayload(
          await client.getSendTransactionStatus({
            organizationId: params.subOrgId,
            sendTransactionStatusId: params.providerTransactionId,
          }),
        )
  const { status, txHash } = interpretTurnkeyGetSendTransactionStatus(res)

  const { data: existing } = await admin
    .from("transactions")
    .select("id, user_id, business_id, amount, currency, direction, wallet_address, counterparty_address, asset, chain, metadata")
    .eq("provider", "turnkey")
    .eq("provider_transaction_id", params.providerTransactionId)
    .maybeSingle()
  if (existing?.id) {
    await upsertLedgerTransaction(admin, {
      userId: String(existing.user_id),
      businessId: existing.business_id ? String(existing.business_id) : null,
      provider: "turnkey",
      providerTransactionId: params.providerTransactionId,
      status,
      amount: Number(existing.amount ?? 0),
      currency: String(existing.currency ?? "USD"),
      direction: (String(existing.direction ?? "out").toLowerCase() === "in" ? "in" : "out"),
      txHash,
      walletAddress: existing.wallet_address ? String(existing.wallet_address) : null,
      counterpartyAddress: existing.counterparty_address ? String(existing.counterparty_address) : null,
      asset: existing.asset ? String(existing.asset) : null,
      chain: existing.chain ? String(existing.chain) : null,
      settledAt: status === "settled" ? new Date().toISOString() : null,
      payload: (res || {}) as Record<string, unknown>,
      metadata: (existing.metadata as Record<string, unknown> | null) ?? { source: "turnkey_send_status" },
      baseCurrency: String(existing.currency ?? "USD"),
    })

    if (txHash && isFeeWalletDestinationAddress(String(existing.counterparty_address || ""))) {
      await ensureFeeWalletRevenueDeposit(admin, {
        txHash,
        amount: Number(existing.amount ?? 0),
        asset: String(existing.asset || "").toUpperCase() === "EURC" ? "EURC" : "USDC",
        fromAddress: existing.wallet_address ? String(existing.wallet_address) : null,
        senderUserId: String(existing.user_id),
        senderBusinessId: existing.business_id ? String(existing.business_id) : null,
      }).catch((e) => console.warn("fee_wallet_send_reconcile_book:", e))
      const parent = await findTransactionByFeeTurnkeySendId(admin, params.providerTransactionId)
      if (parent?.id) {
        await stampFeeWalletSweepHashOnTransaction(admin, {
          transactionId: parent.id,
          meta: parent.metadata,
          txHash,
          userId: parent.user_id,
          businessId: parent.business_id,
          relatedEasnerTransactionId: parent.easner_transaction_id,
          sendStatus: status,
          fromAddress: existing.wallet_address ? String(existing.wallet_address) : null,
        }).catch((e) => console.warn("fee_wallet_send_reconcile_stamp:", e))
      }
    }

    if (status === "settled") {
      const meta = (existing.metadata || {}) as Record<string, unknown>
      const easnerPayoutId =
        typeof meta.easner_payout_id === "string" ? meta.easner_payout_id.trim() : undefined
      await applyGlobalPayoutTurnkeySettleDebit(admin, {
        providerTransactionId: params.providerTransactionId,
        easnerPayoutId,
      }).catch((e) => console.warn("global_payout_turnkey_settle_debit:", e))

      if (String(meta.activity_type ?? "") === "wallet_send") {
        const { captureWalletSendFeeLegIfPending } = await import(
          "@/lib/processing-fee/capture-pending-processing-fee"
        )
        await captureWalletSendFeeLegIfPending(admin, {
          transactionId: String(existing.id),
          userId: String(existing.user_id),
          businessId: existing.business_id ? String(existing.business_id) : null,
        }).catch((e) => console.warn("wallet_send_fee_capture:", e))
      }
    }
  } else {
    const easetagSettlement = await findEasetagSettlementForChainSuppression(admin, {
      turnkeySendStatusId: params.providerTransactionId,
      txHash,
    })
    if (easetagSettlement) {
      await patchEasetagP2pChainSettlement(admin, {
        transferGroupId: easetagSettlement.transfer_group_id,
        turnkeySendId: params.providerTransactionId,
        txHash,
        turnkeySendStatus: status,
      }).catch(() => {})
      if (status === "settled" && txHash) {
        await updateEasetagSettlementSettled(admin, easetagSettlement.transfer_group_id, txHash).catch(() => {})
      }
    } else {
      const noahRow = await findGlobalPayoutNoahRowByTurnkeySendId(admin, params.providerTransactionId)
      if (noahRow?.id) {
        const prior = { ...noahRow.metadata }
        const isMarginLeg =
          String(prior.margin_turnkey_send_id ?? prior.processing_fee_turnkey_send_id ?? "").trim() ===
            params.providerTransactionId &&
          String(prior.turnkey_send_id ?? "").trim() !== params.providerTransactionId
        const meta: Record<string, unknown> = { ...prior }
        if (isMarginLeg) {
          meta.processing_fee_turnkey_send_status = status
          if (txHash) {
            await stampFeeWalletSweepHashOnTransaction(admin, {
              transactionId: noahRow.id,
              meta,
              txHash,
              userId: noahRow.user_id,
              businessId: noahRow.business_id,
              relatedEasnerTransactionId: noahRow.easnerTransactionId,
              sendStatus: status,
            }).catch((e) => console.warn("fee_wallet_margin_reconcile_book:", e))
          } else if (status === "failed") {
            meta.processing_fee_pending = true
            await admin
              .from("transactions")
              .update({ metadata: meta, updated_at: new Date().toISOString() })
              .eq("id", noahRow.id)
          } else {
            await admin
              .from("transactions")
              .update({ metadata: meta, updated_at: new Date().toISOString() })
              .eq("id", noahRow.id)
          }
        } else {
          meta.turnkey_send_status = status
          if (txHash) {
            meta.turnkey_tx_hash = txHash
            meta.yc_crypto_deposit_tx_hash = String(meta.yc_crypto_deposit_tx_hash ?? txHash)
            meta.yc_crypto_deposit_status = status
          }
          await admin
            .from("transactions")
            .update({
              metadata: meta,
              ...(txHash ? { tx_hash: txHash } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", noahRow.id)

          if (status === "settled" && noahRow.easnerPayoutId) {
            await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
              easnerPayoutId: noahRow.easnerPayoutId,
              markTurnkeySettled: true,
            }).catch((e) => console.warn("global_payout_turnkey_settle_debit:", e))
          }
        }
      } else if (txHash) {
        const feePayout = await findTransactionByFeeTurnkeySendId(admin, params.providerTransactionId)
        if (feePayout?.id) {
          await stampFeeWalletSweepHashOnTransaction(admin, {
            transactionId: feePayout.id,
            meta: feePayout.metadata,
            txHash,
            userId: feePayout.user_id,
            businessId: feePayout.business_id,
            relatedEasnerTransactionId: feePayout.easner_transaction_id,
            sendStatus: status,
          }).catch((e) => console.warn("fee_wallet_generic_reconcile_book:", e))
        }
      }
    }
  }

  return { status, txHash }
}
