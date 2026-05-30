import type { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { generateTransactionId } from "@/lib/transaction-id"
import { isWalletSendEnabled } from "@/lib/lifi/client"
import { resolveWalletSendExecutionModel } from "./routing"
import { getWalletSendSession, markWalletSendSessionExecuted } from "./wallet-send-session"
import { executeLifiWalletSend } from "./lifi-execute"
import type { WalletRecipientRow } from "./validate-recipient"

export type ExecuteWalletSendInput = {
  admin: SupabaseClient
  ctx: NoahAccountContext
  userId: string
  businessId: string | null
  recipient: WalletRecipientRow
  formSessionId: string
  reservedDebitEtid?: string
  reviewSnapshot?: Record<string, unknown>
}

export type ExecuteWalletSendResult =
  | {
      ok: true
      easnerTransactionId: string
      status: "pending" | "settled" | "failed"
      provider: "turnkey" | "lifi"
      providerTransactionId: string
      txHash?: string | null
    }
  | { ok: false; error: string }

async function debitWalletBalance(
  admin: SupabaseClient,
  input: { userId: string; businessId: string | null; currency: "USD" | "EUR"; amount: number },
): Promise<void> {
  await applyWalletBalanceDelta(admin, {
    userId: input.businessId ? null : input.userId,
    businessId: input.businessId,
    currency: input.currency,
    delta: -Math.abs(input.amount),
  })
}

export async function executeWalletSend(input: ExecuteWalletSendInput): Promise<ExecuteWalletSendResult> {
  if (!isWalletSendEnabled()) {
    return { ok: false, error: "wallet_send_disabled" }
  }

  const session = await getWalletSendSession(input.admin, input.formSessionId, input.userId)
  if (!session) {
    return { ok: false, error: "quote_expired" }
  }
  if (session.recipient_id !== input.recipient.id) {
    return { ok: false, error: "recipient_mismatch" }
  }

  const executionModel = resolveWalletSendExecutionModel(session.receive_asset, session.receive_network)
  const balanceCurrency = session.source_balance_currency as "USD" | "EUR"
  const easnerTransactionId = input.reservedDebitEtid?.trim() || generateTransactionId()

  if (executionModel === "direct_turnkey") {
    const asset = session.receive_asset === "EURC" ? "EURC" : "USDC"
    try {
      const send = await createTurnkeySend(input.admin, {
        ctx: input.ctx,
        asset,
        chain: "solana",
        destinationAddress: session.destination_address,
        amount: session.receive_amount,
        settlementPollTimeoutMs: 120_000,
      })

      await debitWalletBalance(input.admin, {
        userId: input.userId,
        businessId: input.businessId,
        currency: balanceCurrency,
        amount: session.total_debited,
      })

      await upsertLedgerTransaction(input.admin, {
        userId: input.userId,
        businessId: input.businessId,
        provider: "turnkey",
        providerTransactionId: send.providerTransactionId,
        status: send.status,
        amount: session.total_debited,
        currency: balanceCurrency,
        direction: "out",
        txHash: send.txHash,
        counterpartyAddress: session.destination_address,
        asset: session.receive_asset,
        chain: session.receive_network,
        metadata: {
          activity_type: "wallet_send",
          execution_model: "direct_turnkey",
          receive_asset: session.receive_asset,
          receive_network: session.receive_network,
          receive_amount: session.receive_amount,
          form_session_id: session.form_session_id,
          easner_transaction_id: easnerTransactionId,
          ...(input.reviewSnapshot ?? {}),
        },
      })

      await markWalletSendSessionExecuted(session.form_session_id)
      return {
        ok: true,
        easnerTransactionId,
        status: send.status,
        provider: "turnkey",
        providerTransactionId: send.providerTransactionId,
        txHash: send.txHash,
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "turnkey_send_failed" }
    }
  }

  const lifi = await executeLifiWalletSend({
    admin: input.admin,
    ctx: input.ctx,
    session,
    easnerTransactionId,
    reviewSnapshot: input.reviewSnapshot,
  })
  if (!lifi.ok) return lifi

  await debitWalletBalance(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    currency: balanceCurrency,
    amount: session.total_debited,
  })

  await markWalletSendSessionExecuted(session.form_session_id)
  return {
    ok: true,
    easnerTransactionId,
    status: lifi.status,
    provider: "lifi",
    providerTransactionId: lifi.providerTransactionId,
    txHash: lifi.txHash,
  }
}

export async function resolveWalletSendAccountContext(request: Request, userId: string) {
  return resolveNoahAccountContext(request, userId)
}
