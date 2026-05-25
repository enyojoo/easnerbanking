import { noahFetch } from "@/lib/noah/http"
import { randomUUID } from "crypto"

export type StartAutomatedPayoutInput = {
  customerId: string
  cryptoCurrency: string
  /** Fiat face amount for payout (string decimal) */
  fiatAmount: string
  formSessionId: string
  /** Easner session id — sent as Noah ExternalID */
  externalId: string
  network: string
  /**
   * Payer wallet (Noah Trigger). Required by API; use request body or env.
   * @see https://docs.noah.com/recipes/payout/automated-payouts/
   */
  sourceAddress: string
  /** Minimum crypto amount for trigger (from prepare CryptoAuthorizedAmount or estimate) */
  cryptoTriggerAmount: string
}

function addHoursIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

/**
 * POST /workflows/onchain-deposit-to-payment-method
 */
export async function startOnchainDepositToPaymentWorkflow(
  input: StartAutomatedPayoutInput,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    Trigger: {
      Type: "SingleOnchainDepositSourceTriggerInput",
      Conditions: [
        {
          AmountConditions: [
            {
              ComparisonOperator: "GTEQ",
              Value: input.cryptoTriggerAmount,
            },
          ],
          Network: input.network,
        },
      ],
      SourceAddress: input.sourceAddress,
      Expiry: addHoursIso(1),
      Nonce: randomUUID(),
    },
    CustomerID: input.customerId,
    CryptoCurrency: input.cryptoCurrency,
    FiatAmount: input.fiatAmount,
    FormSessionID: input.formSessionId,
    ExternalID: input.externalId,
  }

  return noahFetch<Record<string, unknown>>({
    method: "POST",
    path: "/workflows/onchain-deposit-to-payment-method",
    json: body,
  })
}

function extractWorkflowAddress(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>
    const addr = o.Address ?? o.address
    if (typeof addr === "string" && addr.trim()) return addr.trim()
  }
  return null
}

function pickDestinationFromConditions(conditions: unknown): string | null {
  if (!Array.isArray(conditions)) return null
  for (const item of conditions) {
    if (!item || typeof item !== "object") continue
    const c = item as Record<string, unknown>
    const addr = extractWorkflowAddress(c.DestinationAddress ?? c.destinationAddress)
    if (addr) return addr
  }
  return null
}

/** Parse Noah onchain-deposit workflow response per MCP/docs (address may live under Conditions[]). */
export function pickDestinationAddress(workflowRaw: Record<string, unknown>): string | null {
  const top = extractWorkflowAddress(workflowRaw.DestinationAddress ?? workflowRaw.destinationAddress)
  if (top) return top

  const fromConditions = pickDestinationFromConditions(workflowRaw.Conditions ?? workflowRaw.conditions)
  if (fromConditions) return fromConditions

  const nested = workflowRaw.Workflow as Record<string, unknown> | undefined
  if (nested) {
    const fromWorkflow = extractWorkflowAddress(nested.DestinationAddress ?? nested.destinationAddress)
    if (fromWorkflow) return fromWorkflow
    const fromNestedConditions = pickDestinationFromConditions(nested.Conditions ?? nested.conditions)
    if (fromNestedConditions) return fromNestedConditions
  }

  const trigger = workflowRaw.Trigger as Record<string, unknown> | undefined
  if (trigger) {
    const fromTriggerConditions = pickDestinationFromConditions(trigger.Conditions ?? trigger.conditions)
    if (fromTriggerConditions) return fromTriggerConditions
  }

  return null
}

export function pickTriggerCryptoAmount(prepareCryptoAuthorized: string, prepareEstimate: string): string {
  const auth = prepareCryptoAuthorized?.trim()
  if (auth && auth !== "0" && auth !== "0.0") return auth
  const est = prepareEstimate?.trim()
  if (est && est !== "0") return est
  return "0.00000001"
}
