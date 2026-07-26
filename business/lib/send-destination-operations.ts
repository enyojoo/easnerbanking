import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import type { GlobalPayoutReviewSnapshot } from "@/lib/noah/build-payout-execute-snapshot"
import type { SellPrepareOverrides } from "@/lib/terminal/recipient-sell-prepare"
import {
  cryptoCurrencyForBalanceCurrency,
  executeTurnkeyOfframpPayout,
} from "@/lib/noah/turnkey-offramp-orchestration"
import { buildPayoutQuote } from "@/lib/noah/payout-quote"
import { confirmPayoutOrder } from "@/lib/payout/confirm-payout-order"
import { executeGridBalancePayout } from "@/lib/grid/balance-payout-execute"
import { executeYcBalancePayout } from "@/lib/yellowcard/balance-payout-execute"
import { buildWalletSendQuote } from "@/lib/wallet-send/wallet-send-quote"
import { confirmWalletSendOrder } from "@/lib/wallet-send/confirm-wallet-send-order"
import { executeWalletSend } from "@/lib/wallet-send/wallet-send-orchestration"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import { settlementAssetForBalance } from "@/lib/wallet-send/routing"
import {
  walletDestinationFromSendDestination,
  type SendDestinationRow,
} from "@/lib/send-destination"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"

export interface SendOperationContext {
  admin: SupabaseClient
  accountContext: NoahAccountContext
  userId: string
  businessId: string | null
  sourceAccountId?: string | null
  sourceCurrency: string
  noahCustomerId: string
}

export interface SendOperationInput {
  destination: SendDestinationRow
  amount: number
  amountEntryMode: "send" | "receive"
  sendAmount?: number
  purpose?: string
  note?: string
  idempotencyKey: string
  prepareOverrides?: SellPrepareOverrides
}

export type SendExecutionResult =
  | { state: "settled"; transactionId: string }
  | { state: "submitted"; transactionId: string }
  | { state: "failed"; code: string; message: string }

export type LockedSendDestination = {
  lockId: string | null
  sourceAmount: number
  payload: Record<string, unknown>
  rawQuote?: Awaited<ReturnType<typeof confirmPayoutOrder>>
}

async function walletQuote(
  context: SendOperationContext,
  input: SendOperationInput,
) {
  const settlement = settlementAssetForBalance(context.sourceCurrency)
  const probeFromAddress = await resolveTurnkeyAddressForNoahPair(
    context.admin,
    context.accountContext,
    settlement,
    "Solana",
  )
  return buildWalletSendQuote({
    admin: context.admin,
    recipient: walletDestinationFromSendDestination(input.destination, context.userId),
    sourceBalanceCurrency: context.sourceCurrency,
    amountEntryMode: input.amountEntryMode,
    receiveAmount: input.amount,
    sendAmount: input.sendAmount,
    probeFromAddress: probeFromAddress ?? undefined,
    destinationRef: input.destination.destinationRef,
    sessionUserId: context.userId,
  })
}

export async function quoteSendDestination(
  context: SendOperationContext,
  input: SendOperationInput,
) {
  if (input.destination.type === "wallet") {
    return walletQuote(context, input)
  }
  return buildPayoutQuote({
    userId: context.userId,
    noahCustomerId: context.noahCustomerId,
    recipientId: input.destination.id,
    recipient: input.destination,
    receiveFiatAmount: input.amount,
    sourceBalanceCurrency: context.sourceCurrency,
    amountEntryMode: input.amountEntryMode,
    sendBudget: input.sendAmount,
    prepareOverrides: {
      ...(input.prepareOverrides ?? {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.purpose ? { paymentPurpose: input.purpose } : {}),
    },
  })
}

export async function lockSendDestination(
  context: SendOperationContext,
  input: SendOperationInput,
): Promise<LockedSendDestination> {
  if (input.destination.type === "wallet") {
    const preview = await walletQuote(context, input)
    const { quote } = await confirmWalletSendOrder({
      admin: context.admin,
      ctx: context.accountContext,
      userId: context.userId,
      formSessionId: preview.formSessionId,
    })
    return {
      lockId: quote.formSessionId,
      sourceAmount: quote.totalDebited,
      payload: {
        kind: "wallet_send",
        destinationRef: input.destination.destinationRef,
        formSessionId: quote.formSessionId,
        executionModel: quote.executionModel,
        totalDebited: quote.totalDebited,
        receiveAmount: quote.receiveAmount,
        receiveCurrency: quote.receiveCurrency,
        receiveNetwork: quote.receiveNetwork,
      },
    }
  }

  const quote = await confirmPayoutOrder({
    ctx: context.accountContext,
    userId: context.userId,
    businessId: context.businessId,
    noahCustomerId: context.noahCustomerId,
    recipientId: input.destination.id,
    destinationRef: input.destination.destinationRef,
    receiveAmount: input.amount,
    sourceBalanceCurrency: context.sourceCurrency,
    amountEntryMode: input.amountEntryMode,
    sendAmount: input.sendAmount,
    note: input.note,
    paymentPurpose: input.purpose,
    recipient: input.destination,
  })
  return {
    lockId: quote.lockId ?? null,
    sourceAmount: quote.totalDebited ?? quote.sendAmount ?? input.amount,
    rawQuote: quote,
    payload: {
      kind: "fiat_payout",
      destinationRef: input.destination.destinationRef,
      receiveAmount: input.amount,
      receiveCurrency: quote.receiveCurrency,
      channelId: quote.channelId,
      payoutProvider: quote.provider ?? "noah",
      lockId: quote.lockId ?? null,
      formSessionId: quote.noah?.formSessionId ?? quote.grid?.sequenceId,
      cryptoAuthorizedAmount:
        quote.noah?.cryptoAuthorizedAmount ?? String(quote.grid?.cryptoAmount ?? ""),
      totalDebited: quote.totalDebited,
      marginAmount: quote.marginAmount,
      processingFee: quote.processingFee,
      channelCost: quote.channelCost,
      customerPrincipal: quote.customerPrincipal,
      customerRate: quote.noah?.effectiveRate ?? quote.easner?.effectiveRate,
      ycSequenceId: quote.yc?.sequenceId,
      ycSendId: quote.yc?.sendId,
      ycWalletAddress: quote.yc?.walletAddress,
      ycCryptoAmount: quote.yc?.cryptoAmount,
      gridQuoteId: quote.grid?.quoteId,
      gridFundingAddress: quote.grid?.fundingAddress,
      gridCryptoAmount: quote.grid?.cryptoAmount,
      gridCustomerId: quote.grid?.customerId,
      gridExternalAccountId: quote.grid?.externalAccountId,
      noahFloor: quote.noah?.noahFloor,
      noahSendAmount: quote.noah?.noahSendAmount,
      marginCaptureMode: quote.noah?.marginCaptureMode,
      noahMid: quote.noah?.noahMid,
    },
  }
}

export async function executeSendDestination(
  context: SendOperationContext,
  input: SendOperationInput & {
    locked: LockedSendDestination
    reviewSnapshot?: GlobalPayoutReviewSnapshot | null
  },
): Promise<SendExecutionResult> {
  const payload = input.locked.payload
  if (input.destination.type === "wallet" || payload.kind === "wallet_send") {
    const formSessionId = String(payload.formSessionId || input.locked.lockId || "")
    if (!formSessionId) {
      return { state: "failed", code: "wallet_quote_missing", message: "Wallet quote is missing." }
    }
    const result = await executeWalletSend({
      admin: context.admin,
      ctx: context.accountContext,
      userId: context.userId,
      businessId: context.businessId,
      recipient: walletDestinationFromSendDestination(input.destination, context.userId),
      formSessionId,
      destinationRef: input.destination.destinationRef,
      reviewSnapshot: input.reviewSnapshot ?? undefined,
    })
    if (!result.ok) {
      return { state: "failed", code: "wallet_send_failed", message: result.error }
    }
    return {
      state: result.status === "settled" ? "settled" : "submitted",
      transactionId: result.easnerTransactionId,
    }
  }

  const fiatAmount = Number(payload.receiveAmount ?? input.amount)
  const fiatCurrency = String(payload.receiveCurrency || input.destination.currency).toUpperCase()
  const countryCode = String(
    payload.countryCode || resolveRecipientPayoutCountry(input.destination) || "",
  ).toUpperCase()
  const lockId = String(input.locked.lockId || payload.lockId || "").trim() || undefined
  const provider = String(payload.payoutProvider || "noah").toLowerCase()

  if (provider === "grid") {
    const result = await executeGridBalancePayout({
      admin: context.admin,
      userId: context.userId,
      businessId: context.businessId,
      recipientRow: input.destination,
      recipientId: input.destination.id,
      destinationRef: input.destination.destinationRef,
      fiatAmount,
      fiatCurrency,
      countryCode,
      reviewSnapshot: input.reviewSnapshot ?? undefined,
      sendNote: input.note,
      idempotencyKey: input.idempotencyKey,
      lockId,
      grid: {
        quoteId: String(payload.gridQuoteId || payload.formSessionId || ""),
        sequenceId: String(payload.formSessionId || payload.gridQuoteId || ""),
        customerId: payload.gridCustomerId as string | undefined,
        externalAccountId: payload.gridExternalAccountId as string | undefined,
        cryptoAmount: Number(payload.gridCryptoAmount ?? 0),
        fundingAddress: String(payload.gridFundingAddress || ""),
      },
      pricing: {
        totalDebited: Number(payload.totalDebited ?? 0),
        customerPrincipal: Number(payload.customerPrincipal ?? payload.totalDebited ?? 0),
        marginAmount: Number(payload.marginAmount ?? 0),
        processingFee: Number(payload.processingFee ?? 0),
        channelCost: Number(payload.channelCost ?? 0),
        customerRate: payload.customerRate == null ? undefined : Number(payload.customerRate),
      },
    })
    if (!result.ok || result.status === "failed") {
      return { state: "failed", code: "grid_payout_failed", message: result.ok ? "Grid payout failed." : result.error }
    }
    return { state: "submitted", transactionId: result.easnerTransactionId }
  }

  if (provider === "yellowcard") {
    const result = await executeYcBalancePayout({
      admin: context.admin,
      userId: context.userId,
      businessId: context.businessId,
      recipientRow: input.destination,
      recipientId: input.destination.id,
      destinationRef: input.destination.destinationRef,
      fiatAmount,
      fiatCurrency,
      countryCode,
      channelId: String(payload.channelId || "") || undefined,
      reviewSnapshot: input.reviewSnapshot ?? undefined,
      sendNote: input.note,
      idempotencyKey: input.idempotencyKey,
      lockId,
      yc: {
        sequenceId: String(payload.ycSequenceId || payload.formSessionId || "") || undefined,
        sendId: (payload.ycSendId as string | null) ?? null,
        cryptoAmount: Number(payload.ycCryptoAmount ?? 0),
        walletAddress: String(payload.ycWalletAddress || "") || undefined,
        channelId: String(payload.channelId || ""),
      },
      pricing: {
        totalDebited: Number(payload.totalDebited ?? 0),
        customerPrincipal: Number(payload.customerPrincipal ?? payload.totalDebited ?? 0),
        marginAmount: Number(payload.marginAmount ?? 0),
        processingFee: Number(payload.processingFee ?? 0),
        channelCost: Number(payload.channelCost ?? 0),
        customerRate: payload.customerRate == null ? undefined : Number(payload.customerRate),
      },
    })
    if (!result.ok || result.status === "failed") {
      return {
        state: "failed",
        code: "yellowcard_payout_failed",
        message: result.ok ? "Yellowcard payout failed." : result.error,
      }
    }
    return { state: "submitted", transactionId: result.easnerTransactionId }
  }

  const result = await executeTurnkeyOfframpPayout({
    admin: context.admin,
    ctx: context.accountContext,
    userId: context.userId,
    businessId: context.businessId,
    recipientRow: input.destination,
    recipientId: input.destination.id,
    destinationRef: input.destination.destinationRef,
    fiatAmount,
    fiatCurrency,
    cryptoCurrency: cryptoCurrencyForBalanceCurrency(context.sourceCurrency),
    countryCode,
    channelId: String(payload.channelId || "") || undefined,
    reviewSnapshot: input.reviewSnapshot ?? undefined,
    sendNote: input.note,
    idempotencyKey: input.idempotencyKey,
    lockId,
    ...(payload.formSessionId && payload.cryptoAuthorizedAmount
      ? {
          quotedSession: {
            formSessionId: String(payload.formSessionId),
            cryptoAuthorizedAmount: String(payload.cryptoAuthorizedAmount),
            ...(payload.channelId ? { channelId: String(payload.channelId) } : {}),
            ...(payload.noahFloor ? { noahFloor: String(payload.noahFloor) } : {}),
            ...(payload.noahSendAmount ? { noahSendAmount: String(payload.noahSendAmount) } : {}),
            ...(payload.totalDebited ? { totalDebited: String(payload.totalDebited) } : {}),
            ...(payload.marginAmount ? { marginAmount: String(payload.marginAmount) } : {}),
            ...(payload.marginCaptureMode
              ? { marginCaptureMode: payload.marginCaptureMode as "surplus_send" | "split_debit" }
              : {}),
            ...(payload.customerRate == null ? {} : { customerRate: Number(payload.customerRate) }),
            ...(payload.noahMid == null ? {} : { noahMid: Number(payload.noahMid) }),
          },
        }
      : {}),
  })
  if (!result.ok || result.status === "failed") {
    return {
      state: "failed",
      code: "noah_payout_failed",
      message: result.ok ? "Payout failed." : result.error,
    }
  }
  return { state: "submitted", transactionId: result.easnerTransactionId }
}
