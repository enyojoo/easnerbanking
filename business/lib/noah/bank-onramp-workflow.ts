import { noahFetch } from "@/lib/noah/http"

/**
 * Bank onramp: fiat VA → crypto → withdrawal to Turnkey destination.
 * @see https://docs.noah.com/api-reference/convert-fiat-to-crypto/
 */
export async function startBankDepositToOnchainAddress(input: {
  customerId: string
  fiatCurrency: string
  cryptoCurrency: string
  network: string
  destinationAddress: string
}): Promise<Record<string, unknown>> {
  return noahFetch<Record<string, unknown>>({
    method: "POST",
    path: "/workflows/bank-deposit-to-onchain-address",
    json: {
      CustomerID: input.customerId,
      FiatCurrency: input.fiatCurrency,
      CryptoCurrency: input.cryptoCurrency,
      Network: input.network,
      DestinationAddress: { Address: input.destinationAddress },
    },
  })
}

/** Workflow id from Noah workflow JSON (onramp or onchain-deposit responses). */
export function pickNoahWorkflowIdFromResponse(raw: Record<string, unknown>): string | null {
  const w = raw.WorkflowID ?? raw.WorkflowId ?? raw.ID ?? raw.Id ?? raw.id
  return w != null && String(w).trim() ? String(w).trim() : null
}
