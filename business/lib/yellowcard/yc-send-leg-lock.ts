import { randomUUID } from "crypto"
import {
  checkYcSendLegDestinationAmountSufficient,
  readYcSendLockedLocalAmount,
  resolveYcSendLegDestinationExcessTolerance,
  resolveYcSendLegFeeLocalForLock,
  resolveYcSendLegRequiredSettlementCrypto,
  retargetYcSendLegSettlementCryptoForQuotedReceive,
  roundYcSettlementCryptoUp,
  YC_SEND_LEG_DESTINATION_MAX_ATTEMPTS,
  YC_SEND_LEG_DESTINATION_TOLERANCE,
  YC_SEND_LEG_SERVICE_FEE_FRACTION,
} from "@easner/shared"
import type { YcSendSubmitResult } from "@/lib/yellowcard/send-submit"
import { hydrateYcSendSubmitResult } from "@/lib/yellowcard/send-submit"

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

export type YcSendLegLockResult = {
  sendRes: YcSendSubmitResult
  finalSettlementCryptoUsd: number
  lockedLocalAmount: number
  sequenceId: string
}

/**
 * POST /send with directSettlement locks crypto; validate YC echo localAmount meets quoted destination fiat.
 * Bump settlement crypto and retry when YC would pay out less than quoted receive.
 */
export async function submitYcSendWithDestinationAmountLock(input: {
  receiveAmount: number
  initialSettlementCryptoUsd: number
  destinationRate: number
  ycSellRate?: number
  receiveCurrency: string
  maxAttempts?: number
  tolerance?: number
  sequenceIdPrefix?: string
  buildSubmit: (args: {
    settlementCryptoUsd: number
    sequenceId: string
    attempt: number
  }) => Promise<YcSendSubmitResult>
}): Promise<YcSendLegLockResult> {
  const maxAttempts = input.maxAttempts ?? YC_SEND_LEG_DESTINATION_MAX_ATTEMPTS
  const tolerance = input.tolerance ?? YC_SEND_LEG_DESTINATION_TOLERANCE
  const excessTolerance =
    resolveYcSendLegDestinationExcessTolerance(input.receiveAmount)
  const prefix = String(input.sequenceIdPrefix ?? "yc_send").trim() || "yc_send"
  let settlementCryptoUsd = roundYcSettlementCryptoUp(
    Math.max(
      input.initialSettlementCryptoUsd,
      resolveYcSendLegRequiredSettlementCrypto({
        quotedReceive: input.receiveAmount,
        destinationRate: input.destinationRate,
        ycSellRate: input.ycSellRate,
        preferCeil: true,
      }),
    ),
  )
  let sequenceId = `${prefix}_${randomUUID()}`
  let lastLockedLocal = 0
  let prevLockedLocal = 0
  let prevSubmittedCrypto = 0

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      sequenceId = `${prefix}_${randomUUID()}`
    }

    const submittedCrypto = settlementCryptoUsd
    const sendResRaw = await input.buildSubmit({
      settlementCryptoUsd: submittedCrypto,
      sequenceId,
      attempt,
    })
    // Prefer POST body; hydrate only when fee/local fields are incomplete for the check.
    let sendRes = sendResRaw
    lastLockedLocal = readYcSendLockedLocalAmount(sendRes as Record<string, unknown>) ?? 0
    let sendLegFeeLocal = resolveYcSendLegFeeLocalForLock({
      sendRes: sendRes as Record<string, unknown>,
      lockedLocalAmount: lastLockedLocal,
      quotedReceive: input.receiveAmount,
    })
    let check = checkYcSendLegDestinationAmountSufficient({
      quotedReceive: input.receiveAmount,
      lockedLocalAmount: lastLockedLocal,
      sendLegFeeLocal,
      tolerance,
      excessTolerance,
    })

    const needsHydrateForFees =
      !check.ok &&
      lastLockedLocal > 0 &&
      sendLegFeeLocal <= 0 &&
      Boolean(String(sendRes.id ?? "").trim())

    if (needsHydrateForFees) {
      sendRes = await hydrateYcSendSubmitResult(sendResRaw)
      lastLockedLocal = readYcSendLockedLocalAmount(sendRes as Record<string, unknown>) ?? 0
      sendLegFeeLocal = resolveYcSendLegFeeLocalForLock({
        sendRes: sendRes as Record<string, unknown>,
        lockedLocalAmount: lastLockedLocal,
        quotedReceive: input.receiveAmount,
      })
      check = checkYcSendLegDestinationAmountSufficient({
        quotedReceive: input.receiveAmount,
        lockedLocalAmount: lastLockedLocal,
        sendLegFeeLocal,
        tolerance,
        excessTolerance,
      })
    } else if (!check.ok && lastLockedLocal <= 0 && Boolean(String(sendRes.id ?? "").trim())) {
      // Missing locked local on POST — one short hydrate before deciding retry.
      sendRes = await hydrateYcSendSubmitResult(sendResRaw, { maxAttempts: 1, delayMs: 0 })
      lastLockedLocal = readYcSendLockedLocalAmount(sendRes as Record<string, unknown>) ?? 0
      sendLegFeeLocal = resolveYcSendLegFeeLocalForLock({
        sendRes: sendRes as Record<string, unknown>,
        lockedLocalAmount: lastLockedLocal,
        quotedReceive: input.receiveAmount,
      })
      check = checkYcSendLegDestinationAmountSufficient({
        quotedReceive: input.receiveAmount,
        lockedLocalAmount: lastLockedLocal,
        sendLegFeeLocal,
        tolerance,
        excessTolerance,
      })
    }

    if (check.ok) {
      return {
        sendRes,
        finalSettlementCryptoUsd: submittedCrypto,
        lockedLocalAmount: lastLockedLocal,
        sequenceId,
      }
    }

    if (attempt >= maxAttempts - 1) {
      const detail =
        check.excess > 0
          ? `exceeds quoted by ${check.excess}`
          : `net ${check.netLocalAmount} (gross ${lastLockedLocal}, fee ${sendLegFeeLocal}, crypto ${submittedCrypto})`
      throw new Error(
        `Yellowcard could not lock ${input.receiveAmount} ${input.receiveCurrency}: ${detail} after ${maxAttempts} attempts.`,
      )
    }

    const echoedCrypto = roundUsdc(Number(sendRes.settlementInfo?.cryptoAmount ?? 0))
    const rateCrypto = echoedCrypto > 0 ? echoedCrypto : submittedCrypto
    const observedRate =
      lastLockedLocal > 0 && rateCrypto > 0 ? lastLockedLocal / rateCrypto : input.destinationRate
    const feeFraction =
      sendLegFeeLocal > 0 && lastLockedLocal > 0
        ? sendLegFeeLocal / lastLockedLocal
        : YC_SEND_LEG_SERVICE_FEE_FRACTION

    let nextCrypto = retargetYcSendLegSettlementCryptoForQuotedReceive({
      settlementCryptoUsd: submittedCrypto,
      lockedLocalAmount: lastLockedLocal,
      sendLegFeeLocal,
      quotedReceive: input.receiveAmount,
      destinationRate: observedRate,
      preferCeil: check.shortfall > 0,
    })

    if (check.shortfall > 0) {
      const requiredCrypto = resolveYcSendLegRequiredSettlementCrypto({
        quotedReceive: input.receiveAmount,
        destinationRate: observedRate,
        ycSellRate: input.ycSellRate,
        feeFraction,
        preferCeil: true,
      })
      nextCrypto = roundYcSettlementCryptoUp(Math.max(nextCrypto, requiredCrypto))
      const grossStuck =
        lastLockedLocal > 0 &&
        prevLockedLocal > 0 &&
        lastLockedLocal <= prevLockedLocal &&
        submittedCrypto > prevSubmittedCrypto
      if (grossStuck) {
        nextCrypto = roundYcSettlementCryptoUp(
          Math.max(nextCrypto, submittedCrypto + 0.003),
        )
      }
    }

    prevLockedLocal = lastLockedLocal
    prevSubmittedCrypto = submittedCrypto
    settlementCryptoUsd = nextCrypto
  }

  throw new Error(
    `Yellowcard send lock failed for ${input.receiveAmount} ${input.receiveCurrency}.`,
  )
}
