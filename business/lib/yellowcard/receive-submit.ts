import { yellowcardFetch } from "./http"
import { depositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"

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
  sender?: Record<string, unknown>
  recipient?: Record<string, unknown>
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

export function buildYcReceiveSubmitBody(input: YcReceiveSubmitInput): Record<string, unknown> {
  const wallet =
    input.settlementWalletAddress?.trim() || depositOmnibusSolanaAddressUsd() || undefined
  if (!wallet) {
    throw new Error("deposit_omnibus_solana_address_usd_required")
  }

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
  if (input.sender) body.sender = input.sender
  if (input.recipient) body.recipient = input.recipient
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
