import { randomUUID } from "crypto"
import {
  checkYcSendLegDestinationAmountSufficient,
  readYcSendLockedLocalAmount,
  readYcSendSettlementLocalRate,
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
 * POST /send with directSettlement locks crypto; validate YC gross−fee meets quoted receive.
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

  const sizedInitial = resolveYcSendLegRequiredSettlementCrypto({
    quotedReceive: input.receiveAmount,
    destinationRate: input.destinationRate,
    ycSellRate: input.ycSellRate,
    preferCeil: true,
  })
  let settlementCryptoUsd =
    sizedInitial > 0
      ? sizedInitial
      : roundYcSettlementCryptoUp(input.initialSettlementCryptoUsd)

  let sequenceId = `${prefix}_${randomUUID()}`
  let lastLockedLocal = 0

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

    const settlementLocalRate = readYcSendSettlementLocalRate(sendRes as Record<string, unknown>)
    const echoedCrypto = roundUsdc(Number(sendRes.settlementInfo?.cryptoAmount ?? 0))
    const rateCrypto = echoedCrypto > 0 ? echoedCrypto : submittedCrypto
    const observedRate =
      settlementLocalRate ??
      (lastLockedLocal > 0 && rateCrypto > 0
        ? lastLockedLocal / rateCrypto
        : input.ycSellRate ?? input.destinationRate)
    const feeFraction =
      sendLegFeeLocal > 0 && lastLockedLocal > 0
        ? sendLegFeeLocal / lastLockedLocal
        : YC_SEND_LEG_SERVICE_FEE_FRACTION

    settlementCryptoUsd = retargetYcSendLegSettlementCryptoForQuotedReceive({
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
        destinationRate: input.destinationRate,
        ycSellRate: input.ycSellRate,
        observedLocalRate: observedRate,
        feeFraction,
        preferCeil: true,
      })
      settlementCryptoUsd = roundYcSettlementCryptoUp(
        Math.max(settlementCryptoUsd, requiredCrypto),
      )
    }
  }

  throw new Error(
    `Yellowcard send lock failed for ${input.receiveAmount} ${input.receiveCurrency}.`,
  )
}
