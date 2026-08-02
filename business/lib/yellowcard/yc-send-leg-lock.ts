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
 * POST /send with directSettlement locks crypto; validate YC gross−fee ≈ quoted receive.
 * Target exact net (dust ≤ 0.01). Overshoot (e.g. 2011.72 for 2000) is rejected and trimmed
 * so excess USDC stays as fee-wallet surplus instead of paying the recipient.
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
  const sizingRate = Number(input.ycSellRate ?? 0) > 0 ? Number(input.ycSellRate) : input.destinationRate
  const excessTolerance = resolveYcSendLegDestinationExcessTolerance(
    input.receiveAmount,
    sizingRate,
  )
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
      destinationRate: sizingRate,
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
        destinationRate: sizingRate,
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
        destinationRate: sizingRate,
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
    // Prefer effective conversion from this lock when it disagrees with cryptoLocalRate.
    const effectiveRate =
      lastLockedLocal > 0 && rateCrypto > 0 ? lastLockedLocal / rateCrypto : 0
    const rateDelta =
      settlementLocalRate && effectiveRate > 0
        ? Math.abs(effectiveRate - settlementLocalRate) / settlementLocalRate
        : 0
    const observedRate =
      effectiveRate > 0 && (rateDelta > 0.001 || !settlementLocalRate)
        ? effectiveRate
        : (settlementLocalRate ?? effectiveRate ?? input.ycSellRate ?? input.destinationRate)
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
        observedLocalRate: observedRate,
        feeFraction,
        preferCeil: true,
      })
      nextCrypto = roundYcSettlementCryptoUp(Math.max(nextCrypto, requiredCrypto))
      if (nextCrypto <= submittedCrypto) {
        nextCrypto = roundYcSettlementCryptoUp(submittedCrypto + 0.000001)
      }
    }

    settlementCryptoUsd = nextCrypto
  }

  throw new Error(
    `Yellowcard send lock failed for ${input.receiveAmount} ${input.receiveCurrency}.`,
  )
}
