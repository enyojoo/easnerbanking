import { randomUUID } from "crypto"
import {
  readYcSendLockedLocalAmount,
  readYcSendLegFeeLocal,
  resolveYcSendLegRequiredSettlementCrypto,
  resolveYcSendLegServiceFeeLocal,
  roundYcSettlementCryptoUp,
  YC_SEND_LEG_CRYPTO_CENT,
  YC_SEND_LEG_CRYPTO_MICRO,
  YC_SEND_LEG_DESTINATION_MAX_ATTEMPTS,
} from "@easner/shared"
import type { YcServiceFeeConfig } from "@easner/shared"
import type { YcSendSubmitResult } from "@/lib/yellowcard/send-submit"
import { hydrateYcSendSubmitResult } from "@/lib/yellowcard/send-submit"
import { YcPayoutError } from "@/lib/yellowcard/payout-errors"

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

function roundLocal(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function cryptoUnits(amount: number, quantum: number): number {
  return Math.round(amount / quantum)
}

function cryptoFromUnits(units: number, quantum: number): number {
  return roundUsdc(units * quantum)
}

function isCentAligned(amount: number): boolean {
  return Math.abs(amount * 100 - Math.round(amount * 100)) <= 0.000001
}

function sameMicroAmount(a: number, b: number): boolean {
  return Math.abs(a - b) <= YC_SEND_LEG_CRYPTO_MICRO / 2
}

function sameCentBucketProbe(amount: number): number {
  const bucketCenter = Math.round(amount * 100) / 100
  const candidate = amount <= bucketCenter ? bucketCenter + 0.004 : bucketCenter - 0.004
  return roundUsdc(Math.max(YC_SEND_LEG_CRYPTO_MICRO, candidate))
}

export type YcSendPrecisionMode = "micro" | "cent"

export type YcSendLegLockResult = {
  sendRes: YcSendSubmitResult
  /** Amount requested by the product before YC quantization. */
  requestedLocalAmount: number
  /** Authoritative crypto amount returned by YC and later funded. */
  finalSettlementCryptoUsd: number
  /** YC gross local amount before destination-side fees. */
  lockedLocalAmount: number
  /** Actual recipient credit after all known destination-side fees. */
  recipientLocalAmount: number
  sendLegFeeLocal: number
  recipientSurplusLocal: number
  /** Observed net-local difference between adjacent YC settlement amounts. */
  payoutQuantumLocal: number
  settlementQuantumUsd: number
  precisionMode: YcSendPrecisionMode
  sequenceId: string
  expiresAt?: string
  discardedSendIds: string[]
}

type Observation = {
  sendRes: YcSendSubmitResult
  sequenceId: string
  submittedCryptoUsd: number
  acceptedCryptoUsd: number
  grossLocal: number
  feeLocal: number
  netLocal: number
  sendId?: string
}

function responseExpiry(sendRes: YcSendSubmitResult): string | undefined {
  const raw = String(
    (sendRes as { expiresAt?: string; expires_at?: string }).expiresAt ??
      (sendRes as { expires_at?: string }).expires_at ??
      "",
  ).trim()
  if (!raw) return undefined
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

/**
 * Lock the smallest YC direct-settlement amount whose net recipient credit meets the promise.
 * The first response discovers whether YC preserves micro-USDC or snaps to USDC cents; all
 * subsequent search decisions use YC's accepted amount and actual local response.
 */
export async function submitYcSendWithDestinationAmountLock(input: {
  receiveAmount: number
  initialSettlementCryptoUsd: number
  destinationRate: number
  ycSellRate?: number
  receiveCurrency: string
  maxAttempts?: number
  sequenceIdPrefix?: string
  feeConfig?: YcServiceFeeConfig | null
  /** Try the nearest cent-bucket boundary and its adjacent micro-unit concurrently. */
  parallelBoundaryProbe?: boolean
  /**
   * Submit one request at the upper half-cent boundary and validate YC's response.
   * This is the production confirmation mode: it permits the unavoidable cent-bucket
   * surplus without creating discarded YC send records.
   */
  singleSafeSurplusLock?: boolean
  buildSubmit: (args: {
    settlementCryptoUsd: number
    sequenceId: string
    attempt: number
  }) => Promise<YcSendSubmitResult>
}): Promise<YcSendLegLockResult> {
  const requestedLocal = roundLocal(input.receiveAmount)
  if (!(requestedLocal > 0)) {
    throw new YcPayoutError(
      "YC_SEND_NO_COMPLIANT_QUANTUM",
      "Yellowcard recipient amount must be positive.",
      422,
    )
  }

  const maxAttempts = input.maxAttempts ?? YC_SEND_LEG_DESTINATION_MAX_ATTEMPTS
  const sizingRate = Number(input.ycSellRate ?? 0) > 0 ? Number(input.ycSellRate) : input.destinationRate
  const prefix = String(input.sequenceIdPrefix ?? "yc_send").trim() || "yc_send"
  const sizedInitial = resolveYcSendLegRequiredSettlementCrypto({
    quotedReceive: requestedLocal,
    destinationRate: input.destinationRate,
    ycSellRate: input.ycSellRate,
    feeConfig: input.feeConfig,
  })
  let nextCrypto = roundYcSettlementCryptoUp(
    sizedInitial > 0 ? sizedInitial : input.initialSettlementCryptoUsd,
  )
  // Guarantee that the discovery request can distinguish cent snapping from preservation.
  if (isCentAligned(nextCrypto)) nextCrypto = roundUsdc(nextCrypto + YC_SEND_LEG_CRYPTO_MICRO)

  let precisionMode: YcSendPrecisionMode | undefined
  let quantumUsd = 0
  let lower: Observation | undefined
  let upper: Observation | undefined
  const observations: Observation[] = []
  const discardedProbeSendIds: string[] = []
  const seenAccepted = new Set<string>()
  let payoutPrecisionProbePending = false

  const observeRaw = async (submittedCryptoUsd: number, attempt: number): Promise<Observation> => {
    const sequenceId = `${prefix}_${randomUUID()}`
    let sendRes = await input.buildSubmit({
      settlementCryptoUsd: roundYcSettlementCryptoUp(submittedCryptoUsd),
      sequenceId,
      attempt,
    })
    let grossLocal = readYcSendLockedLocalAmount(sendRes as Record<string, unknown>) ?? 0
    let feeLocal = readYcSendLegFeeLocal(sendRes as Record<string, unknown>)

    if ((!(grossLocal > 0) || (!(feeLocal > 0) && !input.feeConfig)) && sendRes.id) {
      sendRes = await hydrateYcSendSubmitResult(sendRes)
      grossLocal = readYcSendLockedLocalAmount(sendRes as Record<string, unknown>) ?? 0
      feeLocal = readYcSendLegFeeLocal(sendRes as Record<string, unknown>)
    }
    if (!(grossLocal > 0)) {
      throw new YcPayoutError(
        "YC_SEND_UNAVAILABLE",
        "Yellowcard send response is missing the locked local amount.",
        503,
      )
    }
    if (!(feeLocal > 0) && input.feeConfig) {
      feeLocal = resolveYcSendLegServiceFeeLocal({
        grossLocal,
        feeConfig: input.feeConfig,
      })
    } else if (!(feeLocal > 0) && !input.feeConfig) {
      throw new YcPayoutError(
        "YC_SEND_FEE_UNAVAILABLE",
        "Yellowcard fee data is unavailable; recipient amount cannot be guaranteed.",
        503,
      )
    }

    const submitted = roundYcSettlementCryptoUp(submittedCryptoUsd)
    const accepted = roundUsdc(Number(sendRes.settlementInfo?.cryptoAmount ?? 0))
    if (!(accepted > 0)) {
      throw new YcPayoutError(
        "YC_SEND_UNAVAILABLE",
        "Yellowcard send response is missing the authoritative crypto amount.",
        503,
      )
    }

    if (!sameMicroAmount(accepted, submitted) && !isCentAligned(accepted)) {
      throw new YcPayoutError(
        "YC_SEND_PRECISION_UNDETERMINED",
        `Yellowcard changed ${submitted} USDC to unsupported amount ${accepted}.`,
        422,
      )
    }

    const observation: Observation = {
      sendRes,
      sequenceId,
      submittedCryptoUsd: submitted,
      acceptedCryptoUsd: accepted,
      grossLocal: roundLocal(grossLocal),
      feeLocal: roundLocal(feeLocal),
      netLocal: roundLocal(Math.max(0, grossLocal - feeLocal)),
      sendId: String(sendRes.id ?? "").trim() || undefined,
    }
    observations.push(observation)
    return observation
  }

  const observe = async (submittedCryptoUsd: number, attempt: number): Promise<Observation> => {
    const observation = await observeRaw(submittedCryptoUsd, attempt)
    const { acceptedCryptoUsd: accepted, submittedCryptoUsd: submitted } = observation
    if (!precisionMode) {
      if (sameMicroAmount(accepted, submitted)) {
        precisionMode = "micro"
        quantumUsd = YC_SEND_LEG_CRYPTO_MICRO
      } else if (isCentAligned(accepted)) {
        precisionMode = "cent"
        quantumUsd = YC_SEND_LEG_CRYPTO_CENT
      } else {
        throw new YcPayoutError(
          "YC_SEND_PRECISION_UNDETERMINED",
          `Yellowcard changed ${submitted} USDC to unsupported amount ${accepted}.`,
          422,
        )
      }
    } else if (
      (precisionMode === "micro" && !sameMicroAmount(accepted, submitted)) ||
      (precisionMode === "cent" && !isCentAligned(accepted))
    ) {
      throw new YcPayoutError(
        "YC_SEND_PRECISION_UNDETERMINED",
        "Yellowcard settlement precision changed during quote locking.",
        422,
      )
    }

    return observation
  }

  if (input.singleSafeSurplusLock) {
    // YC converts direct-settlement sends in nearest-cent settlement buckets while it may
    // echo the submitted funding amount to more decimals. Submitting at the upper half-cent
    // boundary selects the same safe bucket as the former adjacent-probe path with one send.
    const conversionCent = Math.ceil((nextCrypto - 0.0000001) * 100) / 100
    const candidateCrypto = roundUsdc(conversionCent - YC_SEND_LEG_CRYPTO_CENT / 2)
    const selected = await observeRaw(candidateCrypto, 0)
    const surplus = roundLocal(selected.netLocal - requestedLocal)
    // With only one YC send there is no adjacent response to observe. Derive a conservative
    // local cent-bucket ceiling from the selected response's gross conversion. The actual
    // recipient amount remains authoritative and must independently satisfy never-underpay.
    const conversionBucketCrypto = Math.max(
      YC_SEND_LEG_CRYPTO_CENT,
      Math.round(candidateCrypto * 100) / 100,
    )
    const payoutQuantumLocal = roundLocal(
      Math.max(0.01, (selected.grossLocal / conversionBucketCrypto) * YC_SEND_LEG_CRYPTO_CENT),
    )

    if (surplus < 0) {
      throw new YcPayoutError(
        "YC_SEND_NO_COMPLIANT_QUANTUM",
        `Yellowcard's single locked send would underpay the recipient by ${Math.abs(surplus).toFixed(2)} ${input.receiveCurrency}.`,
        422,
      )
    }
    if (surplus > payoutQuantumLocal) {
      throw new YcPayoutError(
        "YC_SEND_NO_COMPLIANT_QUANTUM",
        `Yellowcard recipient surplus ${surplus.toFixed(2)} ${input.receiveCurrency} exceeds one payout quantum ${payoutQuantumLocal.toFixed(2)}.`,
        422,
      )
    }

    console.info("[yc-send-lock] selected single safe-surplus settlement", {
      requestedLocalAmount: requestedLocal,
      recipientLocalAmount: selected.netLocal,
      receiveCurrency: input.receiveCurrency,
      precisionMode: "cent",
      settlementQuantumUsd: YC_SEND_LEG_CRYPTO_CENT,
      payoutQuantumLocal,
      recipientSurplusLocal: surplus,
      selectedSendId: selected.sendId,
      discardedSendIds: [],
      attempts: 1,
    })
    return {
      sendRes: selected.sendRes,
      requestedLocalAmount: requestedLocal,
      finalSettlementCryptoUsd: selected.acceptedCryptoUsd,
      lockedLocalAmount: selected.grossLocal,
      recipientLocalAmount: selected.netLocal,
      sendLegFeeLocal: selected.feeLocal,
      recipientSurplusLocal: surplus,
      payoutQuantumLocal,
      settlementQuantumUsd: YC_SEND_LEG_CRYPTO_CENT,
      precisionMode: "cent",
      sequenceId: selected.sequenceId,
      expiresAt: responseExpiry(selected.sendRes),
      discardedSendIds: [],
    }
  }

  if (input.parallelBoundaryProbe) {
    const initialForFallback = nextCrypto
    const conversionCent = Math.ceil((nextCrypto - 0.0000001) * 100) / 100
    const candidateCrypto = roundUsdc(conversionCent - YC_SEND_LEG_CRYPTO_CENT / 2)
    const adjacentLowerCrypto = roundUsdc(candidateCrypto - YC_SEND_LEG_CRYPTO_MICRO)
    if (adjacentLowerCrypto > 0) {
      const [adjacentLower, candidate] = await Promise.all([
        observeRaw(adjacentLowerCrypto, 0),
        observeRaw(candidateCrypto, 1),
      ])
      const payoutQuantumLocal = roundLocal(candidate.netLocal - adjacentLower.netLocal)
      const surplus = roundLocal(candidate.netLocal - requestedLocal)
      if (
        candidate.netLocal >= requestedLocal &&
        adjacentLower.netLocal < requestedLocal &&
        payoutQuantumLocal > 0.01 &&
        surplus >= 0 &&
        surplus <= payoutQuantumLocal
      ) {
        const discardedSendIds = adjacentLower.sendId ? [adjacentLower.sendId] : []
        console.info("[yc-send-lock] selected parallel cent-boundary settlement", {
          requestedLocalAmount: requestedLocal,
          recipientLocalAmount: candidate.netLocal,
          receiveCurrency: input.receiveCurrency,
          precisionMode: "cent",
          settlementQuantumUsd: YC_SEND_LEG_CRYPTO_CENT,
          payoutQuantumLocal,
          recipientSurplusLocal: surplus,
          selectedSendId: candidate.sendId,
          discardedSendIds,
          attempts: 2,
        })
        return {
          sendRes: candidate.sendRes,
          requestedLocalAmount: requestedLocal,
          finalSettlementCryptoUsd: candidate.acceptedCryptoUsd,
          lockedLocalAmount: candidate.grossLocal,
          recipientLocalAmount: candidate.netLocal,
          sendLegFeeLocal: candidate.feeLocal,
          recipientSurplusLocal: surplus,
          payoutQuantumLocal,
          settlementQuantumUsd: YC_SEND_LEG_CRYPTO_CENT,
          precisionMode: "cent",
          sequenceId: candidate.sequenceId,
          expiresAt: responseExpiry(candidate.sendRes),
          discardedSendIds,
        }
      }
      discardedProbeSendIds.push(
        ...observations.flatMap((item) => (item.sendId ? [item.sendId] : [])),
      )
      observations.length = 0
      nextCrypto = initialForFallback
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const observation = await observe(nextCrypto, attempt)
    if (!precisionMode || !(quantumUsd > 0)) break

    // YC production may echo exact six-decimal funding while quantizing the conversion to a
    // USDC-cent bucket. The second observation deliberately stays well inside the first
    // request's nearest-cent bucket so local minor-unit rounding cannot masquerade as cent mode.
    const previousObservation = observations.at(-2)
    if (
      precisionMode === "micro" &&
      payoutPrecisionProbePending &&
      previousObservation &&
      !sameMicroAmount(previousObservation.acceptedCryptoUsd, observation.acceptedCryptoUsd) &&
      previousObservation.grossLocal === observation.grossLocal &&
      previousObservation.netLocal === observation.netLocal
    ) {
      precisionMode = "cent"
      quantumUsd = YC_SEND_LEG_CRYPTO_CENT
    }
    if (payoutPrecisionProbePending) payoutPrecisionProbePending = false

    const acceptedKey = observation.acceptedCryptoUsd.toFixed(6)
    if (seenAccepted.has(acceptedKey)) {
      throw new YcPayoutError(
        "YC_SEND_PRECISION_UNDETERMINED",
        "Yellowcard returned the same settlement bucket for different adaptive requests.",
        422,
      )
    }
    seenAccepted.add(acceptedKey)

    if (observation.netLocal >= requestedLocal) {
      if (!upper || observation.acceptedCryptoUsd < upper.acceptedCryptoUsd) upper = observation
    } else if (!lower || observation.acceptedCryptoUsd > lower.acceptedCryptoUsd) {
      lower = observation
    }

    if (observations.length === 1 && precisionMode === "micro") {
      payoutPrecisionProbePending = true
      nextCrypto = sameCentBucketProbe(observation.acceptedCryptoUsd)
      continue
    }

    if (lower && upper) {
      const lowerUnits = cryptoUnits(lower.acceptedCryptoUsd, quantumUsd)
      const upperUnits = cryptoUnits(upper.acceptedCryptoUsd, quantumUsd)
      if (upperUnits - lowerUnits <= 1) {
        const selected = upper
        const payoutQuantumLocal = roundLocal(Math.max(0.01, selected.netLocal - lower.netLocal))
        const surplus = roundLocal(selected.netLocal - requestedLocal)
        if (surplus < 0 || surplus > payoutQuantumLocal) {
          throw new YcPayoutError(
            "YC_SEND_NO_COMPLIANT_QUANTUM",
            `Yellowcard recipient surplus ${surplus.toFixed(2)} ${input.receiveCurrency} exceeds one observed payout quantum ${payoutQuantumLocal.toFixed(2)}.`,
            422,
          )
        }
        const discardedSendIds = [
          ...discardedProbeSendIds,
          ...observations
          .filter((item) => item !== selected && item.sendId && item.sendId !== selected.sendId)
          .map((item) => item.sendId!),
        ]
        console.info("[yc-send-lock] selected smallest sufficient settlement", {
          requestedLocalAmount: requestedLocal,
          recipientLocalAmount: selected.netLocal,
          receiveCurrency: input.receiveCurrency,
          precisionMode,
          settlementQuantumUsd: quantumUsd,
          payoutQuantumLocal,
          recipientSurplusLocal: surplus,
          selectedSendId: selected.sendId,
          discardedSendIds,
          attempts: discardedProbeSendIds.length + observations.length,
        })
        return {
          sendRes: selected.sendRes,
          requestedLocalAmount: requestedLocal,
          finalSettlementCryptoUsd: selected.acceptedCryptoUsd,
          lockedLocalAmount: selected.grossLocal,
          recipientLocalAmount: selected.netLocal,
          sendLegFeeLocal: selected.feeLocal,
          recipientSurplusLocal: surplus,
          payoutQuantumLocal,
          settlementQuantumUsd: quantumUsd,
          precisionMode,
          sequenceId: selected.sequenceId,
          expiresAt: responseExpiry(selected.sendRes),
          discardedSendIds,
        }
      }
      nextCrypto = cryptoFromUnits(Math.floor((lowerUnits + upperUnits) / 2), quantumUsd)
      continue
    }

    const effectiveNetRate =
      observation.acceptedCryptoUsd > 0 && observation.netLocal > 0
        ? observation.netLocal / observation.acceptedCryptoUsd
        : sizingRate
    const localDelta = Math.abs(observation.netLocal - requestedLocal)
    const minLocalStep = 0.01
    const estimatedSteps = Math.max(
      1,
      Math.ceil(Math.max(localDelta, minLocalStep) / Math.max(effectiveNetRate * quantumUsd, 0.0000001)),
    )
    const currentUnits = cryptoUnits(observation.acceptedCryptoUsd, quantumUsd)
    nextCrypto = cryptoFromUnits(
      observation.netLocal >= requestedLocal
        ? Math.max(1, currentUnits - estimatedSteps)
        : currentUnits + estimatedSteps,
      quantumUsd,
    )
  }

  throw new YcPayoutError(
    "YC_SEND_NO_COMPLIANT_QUANTUM",
    `Yellowcard could not bracket a never-underpay ${requestedLocal} ${input.receiveCurrency} payout within ${maxAttempts} quotes.`,
    422,
  )
}
