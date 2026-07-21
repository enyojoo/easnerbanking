import { randomUUID } from "crypto"
import {
  bumpYcSendLegSettlementCryptoForLocalShortfall,
  checkYcSendLegDestinationAmountSufficient,
  readYcSendLockedLocalAmount,
  YC_SEND_LEG_DESTINATION_MAX_ATTEMPTS,
  YC_SEND_LEG_DESTINATION_TOLERANCE,
} from "@easner/shared"
import type { YcSendSubmitResult } from "@/lib/yellowcard/send-submit"

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
  const prefix = String(input.sequenceIdPrefix ?? "yc_send").trim() || "yc_send"
  let settlementCryptoUsd = input.initialSettlementCryptoUsd
  let sequenceId = `${prefix}_${randomUUID()}`
  let lastSendRes: YcSendSubmitResult | null = null
  let lastLockedLocal = 0

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      sequenceId = `${prefix}_${randomUUID()}`
    }

    const sendRes = await input.buildSubmit({
      settlementCryptoUsd,
      sequenceId,
      attempt,
    })
    lastSendRes = sendRes
    lastLockedLocal = readYcSendLockedLocalAmount(sendRes as Record<string, unknown>) ?? 0

    const check = checkYcSendLegDestinationAmountSufficient({
      quotedReceive: input.receiveAmount,
      lockedLocalAmount: lastLockedLocal,
      tolerance,
    })
    if (check.ok) {
      return {
        sendRes,
        finalSettlementCryptoUsd: settlementCryptoUsd,
        lockedLocalAmount: lastLockedLocal,
        sequenceId,
      }
    }

    if (attempt >= maxAttempts - 1) {
      throw new Error(
        `Yellowcard could not lock ${input.receiveAmount} ${input.receiveCurrency}: received ${lastLockedLocal} after ${maxAttempts} attempts.`,
      )
    }

    settlementCryptoUsd = bumpYcSendLegSettlementCryptoForLocalShortfall({
      settlementCryptoUsd,
      shortfallLocal: check.shortfall,
      destinationRate: input.destinationRate,
    })
  }

  throw new Error(
    `Yellowcard send lock failed for ${input.receiveAmount} ${input.receiveCurrency}.`,
  )
}
