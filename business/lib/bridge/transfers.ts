import { settlementAssetForPayoutProvider } from "@easner/shared"
import { bridgeFetch } from "./http"
import { bridgePaymentRailForRecipient } from "./external-accounts"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"

export type BridgeTransfer = {
  id: string
  state?: string
  amount?: string
  currency?: string
  source_deposit_instructions?: {
    payment_rail?: string
    currency?: string
    to_address?: string
    address?: string
  }
}

export async function createBridgeOfframpTransfer(input: {
  customerId: string
  externalAccountId: string
  recipient: RecipientSellPrepareRow
  cryptoAmount: number
  idempotencyKey: string
}): Promise<BridgeTransfer> {
  const receiveCurrency = String(input.recipient.currency ?? "").trim().toUpperCase()
  const settlement = settlementAssetForPayoutProvider("bridge", receiveCurrency).toLowerCase()
  const amount = input.cryptoAmount.toFixed(6)
  const rail = bridgePaymentRailForRecipient(input.recipient)
  const destCurrency = receiveCurrency.toLowerCase()
  return bridgeFetch<BridgeTransfer>({
    method: "POST",
    path: "/transfers",
    idempotencyKey: input.idempotencyKey,
    json: {
      amount,
      on_behalf_of: input.customerId,
      source: {
        payment_rail: "solana",
        currency: settlement,
      },
      destination: {
        payment_rail: rail,
        currency: destCurrency,
        external_account_id: input.externalAccountId,
      },
    },
  })
}

export function bridgeTransferDepositAddress(transfer: BridgeTransfer): string {
  const inst = transfer.source_deposit_instructions
  return String(inst?.to_address ?? inst?.address ?? "").trim()
}

export function bridgeTransferIdempotencyCountry(recipient: RecipientSellPrepareRow): string {
  return resolveRecipientPayoutCountry(recipient)
}
