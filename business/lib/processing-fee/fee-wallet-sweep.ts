import type { SupabaseClient } from "@supabase/supabase-js"
import { EASNER_REVENUE_FEE_WALLET_SWEEP_MIN } from "@easner/shared"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveTurnkeySendStatusClient } from "@/lib/turnkey/resolve-send-client"
import {
  createTurnkeySend,
  resolveTurnkeySenderForAccountContext,
} from "@/lib/turnkey/send"
import {
  interpretTurnkeyGetSendTransactionStatus,
  normalizeTurnkeyGetSendTransactionStatusPayload,
  type TurnkeyClientLike,
} from "@/lib/turnkey/sol-send-polling"
import { sendStablecoinFromDepositOmnibus } from "@/lib/turnkey/send-from-omnibus"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"
import { ensureFeeWalletRevenueDeposit } from "@/lib/processing-fee/fee-wallet-inbound-deposit"
import { findFeeWalletSweepSignatureOnChain } from "@/lib/processing-fee/fee-wallet-chain-match"
import { resolveDepositOmnibusAddressForLedgerCurrency } from "@/lib/deposit-omnibus/config"

export {
  FEE_SWEEP_MIN,
  FEE_SWEEP_STALE_MS,
  buildEasnerRevenueSweepMetadataPatch,
  computeSweepAmountFromMetadata,
  isEasnerRevenueAlreadySwept,
  isPayoutPrincipalOnChain,
  isSubmittedFeeSweepStale,
  isTurnkeyFeeSweepOnChain,
  readFeeTurnkeySendId,
  readPriorSweepFromMetadata,
  type EasnerRevenueSweepMetadataPatch,
} from "@/lib/processing-fee/fee-wallet-sweep-meta"

export async function pollTurnkeySendById(
  admin: SupabaseClient,
  input: {
    ctx: NoahAccountContext
    sendId: string
    asset?: "USDC" | "EURC"
  },
): Promise<{ status: "pending" | "settled" | "failed"; txHash: string | null }> {
  const sendId = String(input.sendId || "").trim()
  if (!sendId) return { status: "pending", txHash: null }

  const asset = input.asset ?? "USDC"
  const sender = await resolveTurnkeySenderForAccountContext(admin, input.ctx, asset)
  if (!sender) return { status: "pending", txHash: null }

  const resolved = await resolveTurnkeySendStatusClient({
    subOrganizationId: sender.subOrgId,
    admin,
  })
  if (!resolved.ok) return { status: "pending", txHash: null }
  const client = resolved.client as TurnkeyClientLike
  if (typeof client.getSendTransactionStatus !== "function") {
    return { status: "pending", txHash: null }
  }

  try {
    const raw = await client.getSendTransactionStatus({
      organizationId: sender.subOrgId,
      sendTransactionStatusId: sendId,
    })
    return interpretTurnkeyGetSendTransactionStatus(
      normalizeTurnkeyGetSendTransactionStatusPayload(raw),
    )
  } catch (e) {
    console.warn("[easner-revenue-sweep] poll fee/principal send failed:", e)
    return { status: "pending", txHash: null }
  }
}

function assetForCryptoSymbol(crypto: string): "USDC" | "EURC" {
  return String(crypto || "").toUpperCase().includes("EUR") ? "EURC" : "USDC"
}

export async function sweepEasnerRevenueFromDepositOmnibus(input: {
  ledgerCurrency: "USD" | "EUR"
  amount: number
  logTag?: string
  admin?: SupabaseClient
}): Promise<{
  feeWalletSweepTxHash: string | null
  captured: boolean
  turnkeySendId: string | null
}> {
  const sweepAmt = Number(input.amount)
  if (!Number.isFinite(sweepAmt) || sweepAmt < EASNER_REVENUE_FEE_WALLET_SWEEP_MIN) {
    return { feeWalletSweepTxHash: null, captured: true, turnkeySendId: null }
  }

  const feeAddr = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: input.ledgerCurrency })
  if (!feeAddr) {
    return { feeWalletSweepTxHash: null, captured: false, turnkeySendId: null }
  }

  const asset = input.ledgerCurrency === "EUR" ? "EURC" : "USDC"
  const sweep = await sendStablecoinFromDepositOmnibus({
    ledgerCurrency: input.ledgerCurrency,
    asset,
    destinationAddress: feeAddr,
    amount: sweepAmt,
    pollForSettlement: true,
    settlementPollTimeoutMs: 45_000,
    returnOnSignature: true,
  }).catch((e) => {
    console.warn(`[${input.logTag ?? "easner-revenue-sweep"}] omnibus fee sweep failed (non-fatal):`, e)
    return null
  })

  let feeWalletSweepTxHash = sweep?.txHash ?? null
  if (!feeWalletSweepTxHash && input.admin) {
    feeWalletSweepTxHash = await findFeeWalletSweepSignatureOnChain(input.admin, {
      amount: sweepAmt,
      asset,
      ledgerCurrency: input.ledgerCurrency,
      fromAddress: resolveDepositOmnibusAddressForLedgerCurrency(input.ledgerCurrency),
    }).catch(() => null)
  }
  const captured = sweep?.status === "skipped" || Boolean(feeWalletSweepTxHash)

  if (input.admin && feeWalletSweepTxHash) {
    await ensureFeeWalletRevenueDeposit(input.admin, {
      txHash: feeWalletSweepTxHash,
      amount: sweepAmt,
      asset,
      fromAddress: resolveDepositOmnibusAddressForLedgerCurrency(input.ledgerCurrency),
      orgTreasuryKind: "pay_in_fee",
    }).catch((e) => {
      console.warn(`[${input.logTag ?? "easner-revenue-sweep"}] fee wallet deposit book failed:`, e)
    })
  }

  return {
    feeWalletSweepTxHash,
    captured,
    turnkeySendId: sweep?.providerTransactionId ?? null,
  }
}

export async function sweepEasnerRevenueFromUserTurnkeyWallet(
  admin: SupabaseClient,
  input: {
    ctx: NoahAccountContext
    ledgerCurrency: "USD" | "EUR"
    amount: number
    asset?: "USDC" | "EURC"
    cryptoAssetHint?: string
    globalPayout?: {
      easnerPayoutId: string
      noahWorkflowId?: string | null
      formSessionId?: string
    }
    walletSend?: { formSessionId: string }
    logTag?: string
  },
): Promise<{
  feeWalletSweepTxHash: string | null
  captured: boolean
  turnkeySendId: string | null
}> {
  const sweepAmt = Number(input.amount)
  if (!Number.isFinite(sweepAmt) || sweepAmt < EASNER_REVENUE_FEE_WALLET_SWEEP_MIN) {
    return { feeWalletSweepTxHash: null, captured: true, turnkeySendId: null }
  }

  const feeAddress = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: input.ledgerCurrency })
  if (!feeAddress) {
    return { feeWalletSweepTxHash: null, captured: false, turnkeySendId: null }
  }

  const asset =
    input.asset ??
    assetForCryptoSymbol(input.cryptoAssetHint ?? (input.ledgerCurrency === "EUR" ? "EURC" : "USDC"))

  try {
    const feeSend = await createTurnkeySend(admin, {
      ctx: input.ctx,
      asset,
      chain: "solana",
      destinationAddress: feeAddress,
      amount: sweepAmt,
      settlementPollTimeoutMs: 45_000,
      returnOnSignature: true,
      ...(input.globalPayout
        ? {
            globalPayout: {
              easnerPayoutId: input.globalPayout.easnerPayoutId,
              noahWorkflowId: input.globalPayout.noahWorkflowId,
              formSessionId: input.globalPayout.formSessionId,
              walletDebitAmount: 0,
              marginLeg: true,
            },
          }
        : {}),
      ...(input.walletSend ? { walletSend: { formSessionId: input.walletSend.formSessionId, marginLeg: true } } : {}),
    })

    let feeHash = String(feeSend.txHash || "").trim()
    if (!feeHash) {
      feeHash =
        (await findFeeWalletSweepSignatureOnChain(admin, {
          amount: sweepAmt,
          asset,
          ledgerCurrency: input.ledgerCurrency,
          senderUserId: input.ctx.subjectUserId,
          senderBusinessId: input.ctx.subjectBusinessId,
        }).catch(() => null)) || ""
    }
    const captured = Boolean(feeHash)
    if (feeHash) {
      await ensureFeeWalletRevenueDeposit(admin, {
        txHash: feeHash,
        amount: sweepAmt,
        asset,
        senderUserId: input.ctx.subjectUserId,
        senderBusinessId: input.ctx.subjectBusinessId,
        orgTreasuryKind: "payout_fee",
      }).catch((e) => {
        console.warn(`[${input.logTag ?? "easner-revenue-sweep"}] fee wallet deposit book failed:`, e)
      })
    }
    return {
      feeWalletSweepTxHash: feeHash || null,
      captured,
      turnkeySendId: feeSend.providerTransactionId,
    }
  } catch (e) {
    console.warn(`[${input.logTag ?? "easner-revenue-sweep"}] user wallet fee sweep failed:`, e)
    return { feeWalletSweepTxHash: null, captured: false, turnkeySendId: null }
  }
}
