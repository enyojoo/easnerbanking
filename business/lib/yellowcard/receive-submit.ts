import { yellowcardFetch } from "./http"
import { requireDepositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"
import { getYellowcardEnvironment } from "./config"

export type YcReceiveRail = "bank_transfer" | "mobile_money"

export type YcReceiveSource = {
  accountType: "bank" | "momo"
  accountNumber?: string
  networkId?: string
}

export type YcReceiveSubmitInput = {
  sequenceId: string
  customerUID: string
  /** Always retail for NG business (owner person). */
  customerType?: "retail" | "institution"
  channelId: string
  currency: string
  country: string
  localAmount?: number
  amount?: number
  forceAccept?: boolean
  directSettlement?: boolean
  /** @deprecated Receive uses `recipient`, not `sender`. */
  sender?: Record<string, unknown>
  /** Customer KYC for receive (required for direct settlement). */
  recipient?: Record<string, unknown>
  /** Payer bank/momo source (required for direct settlement). */
  source?: YcReceiveSource
  /** Build source from rail when `source` omitted. */
  payInRail?: YcReceiveRail
  /** MoMo phone when rail is mobile_money (production). */
  sourcePhone?: string | null
  settlementWalletAddress?: string
  reason?: string
}

export type YcReceiveSubmitResult = {
  id?: string
  sequenceId?: string
  status?: string
  rate?: number
  convertedAmount?: number
  localAmount?: number
  networkFeeAmountUSD?: number
  serviceFeeAmountUSD?: number
  bankInfo?: Record<string, unknown>
  settlementInfo?: {
    cryptoAmount?: number
    walletAddress?: string
    cryptoCurrency?: string
    cryptoNetwork?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** YC `/receive` requires `source.accountType` (bank | momo). */
export function buildYcReceiveSource(input: {
  rail: YcReceiveRail
  phone?: string | null
}): YcReceiveSource {
  const accountType = input.rail === "mobile_money" ? "momo" : "bank"
  const source: YcReceiveSource = { accountType }
  const phone = String(input.phone ?? "").trim()
  if (getYellowcardEnvironment() === "sandbox") {
    // Sandbox success simulation per YC docs.
    source.accountNumber = "1111111111"
  } else if (accountType === "momo" && phone) {
    source.accountNumber = phone
  }
  return source
}

export function buildYcReceiveSubmitBody(input: YcReceiveSubmitInput): Record<string, unknown> {
  const wallet =
    input.settlementWalletAddress?.trim() || requireDepositOmnibusSolanaAddressUsd()

  const body: Record<string, unknown> = {
    sequenceId: input.sequenceId,
    customerUID: input.customerUID,
    customerType: input.customerType ?? "retail",
    channelId: input.channelId,
    currency: input.currency.toUpperCase(),
    country: input.country.toUpperCase(),
    forceAccept: input.forceAccept ?? true,
    directSettlement: input.directSettlement ?? true,
    settlementInfo: {
      walletAddress: wallet,
      cryptoCurrency: "USDC",
      cryptoNetwork: "SOL",
    },
  }
  if (input.localAmount != null) body.localAmount = input.localAmount
  if (input.amount != null) body.amount = input.amount
  const recipient = input.recipient ?? input.sender
  if (recipient) body.recipient = recipient
  const source =
    input.source ??
    (input.payInRail
      ? buildYcReceiveSource({ rail: input.payInRail, phone: input.sourcePhone })
      : null)
  if (source) body.source = source
  if (input.reason) body.reason = input.reason
  return body
}

export async function submitYcReceive(
  input: YcReceiveSubmitInput,
): Promise<YcReceiveSubmitResult> {
  const body = buildYcReceiveSubmitBody(input)
  return yellowcardFetch<YcReceiveSubmitResult>({
    method: "POST",
    path: "/receive",
    json: body,
  })
}
